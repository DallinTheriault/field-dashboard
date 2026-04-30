import { NextResponse } from "next/server";
import twilio from "twilio";
import { createAdminClient } from "@/lib/supabase/admin";
import { toE164US, fmtPhoneDisplay } from "@/lib/sms/phone";
import { detectKeyword, autoReplyBody } from "@/lib/sms/consent-keywords";

/**
 * Twilio "A message comes in" webhook.
 *
 * Twilio POSTs application/x-www-form-urlencoded with these key fields:
 *   MessageSid, AccountSid, From, To, Body, NumMedia, ...
 *
 * Flow:
 *   1. Verify X-Twilio-Signature against TWILIO_AUTH_TOKEN
 *   2. Look up the tenant whose Clients.twilio_number matches `To`
 *   3. Upsert sms_threads row keyed by (client_id, tenant_phone, contact_phone)
 *   4. Insert sms_messages row (idempotent via unique MessageSid)
 *   5. Create a notifications row so the bell pings
 *   6. Return empty <Response/> TwiML so Twilio doesn't auto-reply
 *
 * Failure modes are intentionally lenient: anything we can't handle still
 * returns 200 + empty TwiML, but logs to audit_log so we can investigate
 * without Twilio retrying for 24h.
 */

// Force Node runtime (we use crypto via the Twilio SDK + need raw body access)
export const runtime = "nodejs";
// Disable caching — every webhook is a fresh side effect.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.error("[twilio-inbound] TWILIO_AUTH_TOKEN not set; rejecting");
    return new NextResponse("Server not configured", { status: 500 });
  }

  // Twilio signs based on the URL it called. In Next.js on Netlify we
  // reconstruct the full URL from headers. Trust the x-forwarded-* headers
  // from Netlify; they're set by the platform, not by clients.
  const proto =
    request.headers.get("x-forwarded-proto") ||
    new URL(request.url).protocol.replace(":", "");
  const host = request.headers.get("host") || new URL(request.url).host;
  const path = new URL(request.url).pathname + new URL(request.url).search;
  const fullUrl = `${proto}://${host}${path}`;

  // Twilio sends form-urlencoded. Read raw, parse manually so we can both
  // verify the signature and inspect the params.
  const rawBody = await request.text();
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(rawBody)) params[k] = v;

  const signature = request.headers.get("x-twilio-signature") || "";
  const valid = twilio.validateRequest(authToken, signature, fullUrl, params);

  if (!valid) {
    console.warn("[twilio-inbound] invalid signature", {
      url: fullUrl,
      hasSig: !!signature,
    });
    return new NextResponse("Forbidden", { status: 403 });
  }

  const messageSid = params.MessageSid;
  const fromRaw = params.From;
  const toRaw = params.To;
  const body = params.Body ?? "";

  if (!messageSid || !fromRaw || !toRaw) {
    console.warn("[twilio-inbound] missing required params", { params });
    return twimlOk();
  }

  const fromE164 = toE164US(fromRaw);
  const toE164 = toE164US(toRaw);
  if (!fromE164 || !toE164) {
    console.warn("[twilio-inbound] non-US numbers, ignoring", { fromRaw, toRaw });
    return twimlOk();
  }

  const supabase = createAdminClient();

  // ---- Tenant lookup ------------------------------------------------------
  // Match Clients.twilio_number to the To header. The number was stored in
  // E.164 by the operator; defensive comparison handles either format.
  const { data: clients, error: clientErr } = await supabase
    .from("Clients")
    .select("id, twilio_number, business_name")
    .or(`twilio_number.eq.${toE164},twilio_number.eq.${toRaw}`)
    .limit(1);

  if (clientErr) {
    console.error("[twilio-inbound] client lookup failed", clientErr);
    return twimlOk();
  }

  const client = clients?.[0];
  if (!client) {
    console.warn("[twilio-inbound] no tenant for To number", { toE164 });
    // Audit so we can detect a misconfigured number without Twilio retries
    await supabase.from("audit_log").insert({
      action: "sms.inbound_no_tenant",
      target_type: "twilio_number",
      target_id: toE164,
      details: { from: fromE164, message_sid: messageSid },
    });
    return twimlOk();
  }

  // ---- Idempotency check --------------------------------------------------
  const { data: existing } = await supabase
    .from("sms_messages")
    .select("id")
    .eq("twilio_message_sid", messageSid)
    .maybeSingle();
  if (existing) return twimlOk();

  // ---- Upsert thread ------------------------------------------------------
  // Try to link an existing contact by phone first.
  const { data: contact } = await supabase
    .from("contacts")
    .select("id, name")
    .eq("client_id", client.id)
    .eq("phone", fromE164)
    .maybeSingle();

  const displayName = contact?.name ?? null;

  // Upsert by the unique (client_id, tenant_phone, contact_phone) constraint
  const { data: thread, error: threadErr } = await supabase
    .from("sms_threads")
    .upsert(
      {
        client_id: client.id,
        tenant_phone: toE164,
        contact_phone: fromE164,
        contact_id: contact?.id ?? null,
        display_name: displayName,
        archived_at: null, // un-archive on new inbound activity
      },
      {
        onConflict: "client_id,tenant_phone,contact_phone",
        ignoreDuplicates: false,
      },
    )
    .select("id")
    .single();

  if (threadErr || !thread) {
    console.error("[twilio-inbound] thread upsert failed", threadErr);
    return twimlOk();
  }

  // ---- Insert message -----------------------------------------------------
  const { error: msgErr } = await supabase.from("sms_messages").insert({
    thread_id: thread.id,
    client_id: client.id,
    direction: "inbound",
    body,
    twilio_message_sid: messageSid,
    twilio_status: "received",
  });

  if (msgErr) {
    // If this was a unique_violation (race with another instance handling the
    // same retry) we treat it as success.
    if (msgErr.code === "23505") return twimlOk();
    console.error("[twilio-inbound] message insert failed", msgErr);
    return twimlOk();
  }

  // ---- Compliance keyword handling ---------------------------------------
  // STOP / HELP / START are detected here so we can update the thread's
  // consent_status and (for STOP/HELP) reply with TwiML inline. Twilio
  // ALSO does carrier-level handling for these — our handling layers on
  // top so the dashboard reflects the user's status accurately.
  const keyword = detectKeyword(body);
  if (keyword === "stop") {
    await supabase
      .from("sms_threads")
      .update({ consent_status: "stopped" })
      .eq("id", thread.id);
  } else if (keyword === "start") {
    await supabase
      .from("sms_threads")
      .update({ consent_status: "active" })
      .eq("id", thread.id);
  } else if (keyword === "help") {
    await supabase
      .from("sms_threads")
      .update({ consent_status: "help_sent" })
      .eq("id", thread.id);
  }

  // ---- Notification -------------------------------------------------------
  // Don't fire bell notifications for STOP/HELP — those are compliance
  // events, not real customer messages the operator needs to action.
  // (We do still store the message above so it shows in the thread.)
  if (!keyword) {
    const senderLabel = displayName || fmtPhoneDisplay(fromE164);
    const preview = body.length > 120 ? body.slice(0, 117) + "…" : body;
    await supabase.from("notifications").insert({
      client_id: client.id,
      kind: "sms_received",
      title: `New text from ${senderLabel}`,
      body: preview,
      link_url: `/app/messages/${thread.id}`,
    });
  }

  // ---- Auto-reply (STOP/HELP only) ---------------------------------------
  // Twilio will already send its own STOP confirmation if we don't, but a
  // branded one is clearer for the recipient. For HELP, Twilio doesn't
  // auto-reply, so this is the only response they get.
  const replyText = autoReplyBody(keyword, client.business_name || "Field");
  if (replyText) {
    return twimlReply(replyText);
  }

  return twimlOk();
}

function twimlOk() {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response/>`, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

/**
 * Reply with a single SMS. TwiML <Message> escaping: only `&`, `<`, `>`
 * are special. Body length up to 1600 chars (Twilio splits if needed).
 */
function twimlReply(body: string) {
  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`,
    {
      status: 200,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    },
  );
}
