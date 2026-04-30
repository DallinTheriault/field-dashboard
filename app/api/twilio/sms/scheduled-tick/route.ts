import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTwilioClient, getPublicBaseUrl } from "@/lib/twilio/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Scheduled SMS cron tick. n8n hits this every N minutes. We pick up to
 * BATCH_SIZE pending rows whose scheduled_for is in the past, send each
 * via Twilio, and update status accordingly. Rows whose thread has since
 * gone consent_status='stopped' are skipped with status='skipped_opted_out'.
 *
 * Auth: shared secret in `x-cron-secret` header. The same secret pattern
 * we already use for n8n→dashboard auth elsewhere. Set CRON_SECRET in the
 * Netlify env.
 *
 * Idempotency: each row is processed exactly once because we mark it
 * non-pending before the Twilio call, and twilio_message_sid is UNIQUE so
 * an accidental duplicate retry would conflict and surface as an error
 * instead of a double send. (Twilio's idempotency comes from us not
 * retrying — we don't.)
 *
 * Per-tenant fairness: not implemented yet. If one tenant ever schedules
 * 10,000 messages, they'd starve other tenants until processed. v0.5.9
 * scope is single-tenant Sharpline so this is fine. Add ROW_NUMBER()
 * partition logic in v0.6+ if needed.
 */

const BATCH_SIZE = 25;

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error("[scheduled-tick] CRON_SECRET env var is not set");
    return NextResponse.json({ error: "server-misconfigured" }, { status: 500 });
  }
  if (secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Pull due rows. We don't lock at the DB level — the cron is
  // single-tenanted and won't have concurrent runners. If it ever does,
  // wrap this in a SELECT FOR UPDATE SKIP LOCKED inside a function.
  const { data: due, error: fetchErr } = await admin
    .from("sms_scheduled")
    .select(
      "id, client_id, thread_id, tenant_phone, contact_phone, body, scheduled_for",
    )
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(BATCH_SIZE);

  if (fetchErr) {
    console.error("[scheduled-tick] fetch failed", fetchErr);
    return NextResponse.json({ error: "fetch-failed" }, { status: 500 });
  }

  const rows = due ?? [];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  const twilio = getTwilioClient();
  const statusCallback = `${getPublicBaseUrl()}/api/twilio/sms/status`;

  const results: Array<{
    id: number;
    outcome: "sent" | "failed" | "skipped_opted_out";
    detail?: string;
  }> = [];

  for (const row of rows) {
    // Re-check consent right before send — may have changed between
    // schedule and now (recipient texted STOP after operator scheduled)
    const { data: thread } = await admin
      .from("sms_threads")
      .select("consent_status, archived_at")
      .eq("id", row.thread_id)
      .maybeSingle();

    if (!thread || thread.archived_at) {
      await admin
        .from("sms_scheduled")
        .update({
          status: "failed",
          error_code: "thread_unavailable",
          error_message: "Thread was deleted or archived between schedule and send.",
          sent_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      results.push({ id: row.id, outcome: "failed", detail: "thread_unavailable" });
      continue;
    }

    if (thread.consent_status === "stopped") {
      await admin
        .from("sms_scheduled")
        .update({
          status: "skipped_opted_out",
          sent_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      results.push({ id: row.id, outcome: "skipped_opted_out" });
      continue;
    }

    // Send via Twilio
    try {
      const message = await twilio.messages.create({
        from: row.tenant_phone,
        to: row.contact_phone,
        body: row.body,
        statusCallback,
      });

      // Mark scheduled row as sent
      await admin
        .from("sms_scheduled")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          twilio_message_sid: message.sid,
        })
        .eq("id", row.id);

      // Insert into sms_messages so the thread shows the sent message
      // alongside other history. Mirrors what sendSmsReply does.
      await admin.from("sms_messages").insert({
        thread_id: row.thread_id,
        client_id: row.client_id,
        direction: "outbound",
        body: row.body,
        twilio_message_sid: message.sid,
        twilio_status: message.status,
      });

      // Bump thread last_outbound_at / last_message_at via the trigger
      // already on sms_messages — no manual update needed here.

      results.push({ id: row.id, outcome: "sent" });
    } catch (e) {
      const errAny = e as { code?: string | number; message?: string };
      const errorCode = errAny.code != null ? String(errAny.code) : "unknown";
      const errorMessage = errAny.message ?? "Twilio send failed";

      await admin
        .from("sms_scheduled")
        .update({
          status: "failed",
          error_code: errorCode,
          error_message: errorMessage,
          sent_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      // Also surface the failure in the thread so operator sees it
      await admin.from("sms_messages").insert({
        thread_id: row.thread_id,
        client_id: row.client_id,
        direction: "outbound",
        body: row.body,
        twilio_status: "failed",
        error_code: errorCode,
      });

      results.push({ id: row.id, outcome: "failed", detail: errorCode });
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    results,
  });
}
