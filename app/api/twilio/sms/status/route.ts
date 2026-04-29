import { NextResponse } from "next/server";
import twilio from "twilio";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Twilio outbound message status callback.
 *
 * Twilio POSTs here when an outbound message changes state. We use it to
 * update sms_messages.twilio_status so the UI shows real delivery state
 * ("delivered", "failed", "undelivered") instead of leaving messages stuck
 * in "queued" forever.
 *
 * Statuses we typically see:
 *   queued → sending → sent → delivered    (happy path)
 *   queued → sending → sent → undelivered  (carrier rejected after sent)
 *   queued → failed                        (Twilio rejected, e.g. bad number)
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.error("[twilio-status] TWILIO_AUTH_TOKEN not set");
    return new NextResponse("Server not configured", { status: 500 });
  }

  // Reconstruct full URL Twilio called for signature verification
  const proto =
    request.headers.get("x-forwarded-proto") ||
    new URL(request.url).protocol.replace(":", "");
  const host = request.headers.get("host") || new URL(request.url).host;
  const path = new URL(request.url).pathname + new URL(request.url).search;
  const fullUrl = `${proto}://${host}${path}`;

  const rawBody = await request.text();
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(rawBody)) params[k] = v;

  const signature = request.headers.get("x-twilio-signature") || "";
  const valid = twilio.validateRequest(authToken, signature, fullUrl, params);

  if (!valid) {
    console.warn("[twilio-status] invalid signature");
    return new NextResponse("Forbidden", { status: 403 });
  }

  const messageSid = params.MessageSid;
  const status = params.MessageStatus;
  const errorCode = params.ErrorCode || null;

  if (!messageSid || !status) {
    return new NextResponse("OK", { status: 200 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("sms_messages")
    .update({
      twilio_status: status,
      error_code: errorCode,
    })
    .eq("twilio_message_sid", messageSid);

  if (error) {
    console.error("[twilio-status] update failed", { messageSid, error });
  }

  return new NextResponse("OK", { status: 200 });
}
