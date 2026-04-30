"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTwilioClient, getPublicBaseUrl } from "@/lib/twilio/client";
import { toE164US } from "@/lib/sms/phone";

const MAX_BODY_CHARS = 1600; // 10 SMS segments — generous upper bound

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Send an outbound SMS reply on behalf of the authenticated user.
 *
 * Flow:
 *   1. Auth — user must be a member of the tenant that owns the thread
 *   2. Validate body
 *   3. Refuse if consent_status='stopped'
 *   4. Call Twilio API
 *   5. On success: insert sms_messages row with twilio_message_sid + status
 *   6. On failure: insert sms_messages row with twilio_status='failed' and
 *      error_code so the failure is visible in the conversation view
 *   7. revalidatePath so the page shows the new message immediately
 *
 * Returns either { ok: true } or { ok: false, error: <user-friendly message> }.
 * Never throws — server action errors should be returned, not raised.
 */
export async function sendSmsReply(
  threadId: number,
  rawBody: string,
): Promise<ActionResult> {
  const body = (rawBody ?? "").trim();
  if (!body) return { ok: false, error: "Message is empty." };
  if (body.length > MAX_BODY_CHARS) {
    return {
      ok: false,
      error: `Message too long (${body.length} chars, max ${MAX_BODY_CHARS}).`,
    };
  }

  // ---- Auth + tenant scoping -------------------------------------------
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Look up which tenants this user belongs to. Roles 'owner' and 'manager'
  // can send; 'member' is read-only for V1 (could relax later).
  const { data: memberships } = await supabase
    .from("client_users")
    .select("client_id, role")
    .eq("auth_user_id", user.id)
    .in("role", ["owner", "manager"]);

  const allowedClientIds = new Set((memberships ?? []).map((m) => m.client_id));
  if (allowedClientIds.size === 0) {
    return { ok: false, error: "You don't have permission to send messages." };
  }

  // Use admin client for the rest — RLS already enforced via the membership
  // check above; admin lets us write to sms_messages without a separate
  // INSERT policy.
  const admin = createAdminClient();

  const { data: thread, error: threadErr } = await admin
    .from("sms_threads")
    .select(
      "id, client_id, tenant_phone, contact_phone, consent_status, archived_at",
    )
    .eq("id", threadId)
    .maybeSingle();

  if (threadErr || !thread) {
    return { ok: false, error: "Thread not found." };
  }

  if (!allowedClientIds.has(thread.client_id)) {
    return { ok: false, error: "You don't have permission to send messages." };
  }

  if (thread.consent_status === "stopped") {
    return {
      ok: false,
      error:
        "This contact has opted out (replied STOP). You cannot send them messages.",
    };
  }

  // ---- Phone normalization ---------------------------------------------
  const fromE164 = toE164US(thread.tenant_phone);
  const toE164 = toE164US(thread.contact_phone);
  if (!fromE164 || !toE164) {
    return { ok: false, error: "Invalid phone number on this thread." };
  }

  // ---- Send via Twilio --------------------------------------------------
  let twilioSid: string | null = null;
  let twilioStatus: string | null = null;
  let errorCode: string | null = null;
  let userError: string | null = null;

  try {
    const client = getTwilioClient();
    const statusCallback = `${getPublicBaseUrl()}/api/twilio/sms/status`;

    const message = await client.messages.create({
      to: toE164,
      from: fromE164,
      body,
      statusCallback,
    });

    twilioSid = message.sid;
    twilioStatus = message.status; // 'queued' | 'sent' | 'sending' | etc.
  } catch (err) {
    // Twilio errors surface as { code, status, message, moreInfo }
    const e = err as {
      code?: number | string;
      status?: number;
      message?: string;
    };
    twilioStatus = "failed";
    errorCode = e.code != null ? String(e.code) : null;
    userError = humanizeTwilioError(e);
  }

  // ---- Insert message row regardless of success ------------------------
  // Failed attempts still create a row so the user sees their typed message
  // in the thread with a clear failure indicator. This avoids "did it send?"
  // confusion.
  const { error: insertErr } = await admin.from("sms_messages").insert({
    thread_id: thread.id,
    client_id: thread.client_id,
    direction: "outbound",
    body,
    twilio_message_sid: twilioSid,
    twilio_status: twilioStatus,
    error_code: errorCode,
    sent_by_user_id: user.id,
  });

  if (insertErr && !userError) {
    // Twilio sent OK but we couldn't persist — rare, but flag it
    console.error("[send-sms] message insert failed after Twilio send", {
      twilioSid,
      err: insertErr,
    });
    return {
      ok: false,
      error:
        "Message sent via Twilio but failed to save locally. Refresh to verify.",
    };
  }

  // If thread had been archived, surface it again on new outbound activity
  if (thread.archived_at) {
    await admin
      .from("sms_threads")
      .update({ archived_at: null })
      .eq("id", thread.id);
  }

  revalidatePath(`/app/messages/${thread.id}`);
  revalidatePath("/app/messages");

  if (userError) return { ok: false, error: userError };
  return { ok: true };
}

/**
 * Translate raw Twilio API errors into user-facing strings. Falls back to
 * a generic message rather than leaking SDK internals.
 */
function humanizeTwilioError(e: {
  code?: number | string;
  message?: string;
}): string {
  const code = e.code != null ? String(e.code) : "";
  switch (code) {
    case "21610":
      return "Recipient has unsubscribed (replied STOP).";
    case "21408":
    case "21211":
      return "Invalid recipient phone number.";
    case "21606":
      return "Your Twilio number can't send to this destination.";
    case "21614":
      return "Recipient is not a valid mobile number.";
    case "20003":
      return "Twilio authentication failed. Check API credentials.";
    case "30007":
      return "Carrier blocked the message (likely flagged as spam).";
    case "30034":
      return "Recipient's carrier is blocking your number.";
    default:
      // Show the Twilio message if we got one; otherwise generic
      return e.message
        ? `Send failed: ${e.message}`
        : "Send failed. Try again or check Twilio status.";
  }
}

/* -------------------------------------------------------------------------- */
/*  Scheduled SMS (v0.5.9)                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Schedule an SMS to be sent at a future timestamp. Inserts a row into
 * sms_scheduled with status='pending'. An n8n cron polls due rows and
 * ships them via Twilio.
 *
 * Validation:
 *   - body length 1..1600
 *   - scheduledForIso is a valid future timestamp (server-side check; client
 *     also enforces "at least 5 minutes in future" but server only requires
 *     "in the future" for clock-skew tolerance)
 *   - thread is not consent_status='stopped' AT SCHEDULE TIME (the cron
 *     checks again at send time and skips if changed since)
 *
 * The cron, not this action, will respect timezones. We store an absolute
 * timestamptz so timezone is handled at the client when picking the time
 * (we render the picker in tenant timezone).
 */
export async function scheduleSmsReply(
  threadId: number,
  body: string,
  scheduledForIso: string,
): Promise<ActionResult> {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "Message body is empty." };
  if (trimmed.length > MAX_BODY_CHARS) {
    return { ok: false, error: `Message too long (${trimmed.length}/${MAX_BODY_CHARS}).` };
  }

  const scheduledFor = new Date(scheduledForIso);
  if (isNaN(scheduledFor.getTime())) {
    return { ok: false, error: "Invalid scheduled time." };
  }
  if (scheduledFor.getTime() <= Date.now()) {
    return { ok: false, error: "Scheduled time must be in the future." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Members are read-only for outbound. Owners and managers only.
  const { data: memberships } = await supabase
    .from("client_users")
    .select("client_id, role")
    .eq("auth_user_id", user.id)
    .in("role", ["owner", "manager"]);
  const allowedClientIds = new Set((memberships ?? []).map((m) => m.client_id));
  if (allowedClientIds.size === 0) {
    return { ok: false, error: "You don't have permission to schedule messages." };
  }

  const { data: thread } = await supabase
    .from("sms_threads")
    .select("id, client_id, tenant_phone, contact_phone, consent_status, archived_at")
    .eq("id", threadId)
    .maybeSingle();

  if (!thread) return { ok: false, error: "Thread not found." };
  if (!allowedClientIds.has(thread.client_id)) {
    return { ok: false, error: "You don't have permission to schedule messages." };
  }
  if (thread.archived_at) return { ok: false, error: "Thread is archived." };
  if (thread.consent_status === "stopped") {
    return {
      ok: false,
      error: "This contact has opted out (replied STOP). They can text START to opt back in.",
    };
  }

  const tenantPhone = toE164US(thread.tenant_phone);
  const contactPhone = toE164US(thread.contact_phone);
  if (!tenantPhone || !contactPhone) {
    return { ok: false, error: "Phone number formatting error." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("sms_scheduled").insert({
    client_id: thread.client_id,
    thread_id: threadId,
    tenant_phone: tenantPhone,
    contact_phone: contactPhone,
    body: trimmed,
    scheduled_for: scheduledFor.toISOString(),
    scheduled_by: user.id,
    status: "pending",
  });

  if (error) {
    console.error("[scheduleSmsReply] insert failed", error);
    return { ok: false, error: error.message };
  }

  revalidatePath(`/app/messages/${threadId}`);
  return { ok: true };
}

/**
 * Cancel a pending scheduled message. Sets status='cancelled' and stamps
 * the cancelling user. Once a message has shipped (status='sent') it can't
 * be cancelled — Twilio doesn't support unsending.
 */
export async function cancelScheduledSms(
  scheduledId: number,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: row } = await supabase
    .from("sms_scheduled")
    .select("id, status, thread_id")
    .eq("id", scheduledId)
    .maybeSingle();

  if (!row) return { ok: false, error: "Scheduled message not found." };
  if (row.status !== "pending") {
    return {
      ok: false,
      error: `Can't cancel — message status is '${row.status}'.`,
    };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("sms_scheduled")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: user.id,
    })
    .eq("id", scheduledId)
    .eq("status", "pending"); // race-safety guard

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath(`/app/messages/${row.thread_id}`);
  return { ok: true };
}

/**
 * Edit a pending scheduled message — update body and/or scheduled_for.
 * Only owner of original schedule can edit (or any member with
 * owner/manager role since RLS allows).
 */
export async function editScheduledSms(
  scheduledId: number,
  body: string,
  scheduledForIso: string,
): Promise<ActionResult> {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "Message body is empty." };
  if (trimmed.length > MAX_BODY_CHARS) {
    return { ok: false, error: `Message too long (${trimmed.length}/${MAX_BODY_CHARS}).` };
  }

  const scheduledFor = new Date(scheduledForIso);
  if (isNaN(scheduledFor.getTime())) {
    return { ok: false, error: "Invalid scheduled time." };
  }
  if (scheduledFor.getTime() <= Date.now()) {
    return { ok: false, error: "Scheduled time must be in the future." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: row } = await supabase
    .from("sms_scheduled")
    .select("id, status, thread_id")
    .eq("id", scheduledId)
    .maybeSingle();

  if (!row) return { ok: false, error: "Scheduled message not found." };
  if (row.status !== "pending") {
    return {
      ok: false,
      error: `Can't edit — message status is '${row.status}'.`,
    };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("sms_scheduled")
    .update({
      body: trimmed,
      scheduled_for: scheduledFor.toISOString(),
    })
    .eq("id", scheduledId)
    .eq("status", "pending");

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath(`/app/messages/${row.thread_id}`);
  return { ok: true };
}
