import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Public onboarding endpoint — captures a lead from the marketing
 * /onboard page and inserts a row into Clients with `is_active=false`.
 *
 * Spam protection (v0.5.11):
 *   1. Honeypot field `website_url_confirm` — if non-empty, silently
 *      reject. Real browsers never fill hidden fields.
 *   2. Rate limit per IP — 3 successful submissions per hour, 10 per
 *      day. Tracked via onboard_intake_log with sha256-hashed IP.
 *   3. Required-field check — same as before.
 *
 * No CAPTCHA in v0.5.11. Add Cloudflare Turnstile later if attack
 * traffic appears.
 *
 * The full system_prompt and service config are filled in later by an
 * admin via /admin/clients/[id]. This endpoint just creates a lead row.
 */

const RATE_LIMIT_HOUR = 3;
const RATE_LIMIT_DAY = 10;

function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

function getClientIp(request: Request): string {
  // Netlify sets x-nf-client-connection-ip; fall back to standard headers
  const headers = request.headers;
  return (
    headers.get("x-nf-client-connection-ip") ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(request: Request) {
  let body: {
    business_name?: string;
    owner_first_name?: string;
    business_phone?: string;
    business_website?: string;
    service_type?: string;
    service_area?: string;
    contact_email?: string;
    notes?: string;
    // Honeypot — humans never fill this; bots usually do
    website_url_confirm?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  // ---- Honeypot check ---------------------------------------------------
  if ((body.website_url_confirm ?? "").trim() !== "") {
    // Look like success to the bot; log silently with rejection_reason
    const ipHash = hashIp(getClientIp(request));
    try {
      const admin = createAdminClient();
      await admin.from("onboard_intake_log").insert({
        ip_hash: ipHash,
        email: (body.contact_email ?? "").trim().toLowerCase() || null,
        business_name: (body.business_name ?? "").trim() || null,
        accepted: false,
        rejection_reason: "honeypot_filled",
      });
    } catch {
      // Log failure shouldn't surface to the bot
    }
    // Pretend it worked to avoid telling the bot WHY it failed
    return NextResponse.json({ success: true, client_id: 0 });
  }

  const businessName = (body.business_name ?? "").trim();
  const ownerFirstName = (body.owner_first_name ?? "").trim();
  const phone = (body.business_phone ?? "").trim();
  const email = (body.contact_email ?? "").trim().toLowerCase();
  const serviceType = (body.service_type ?? "").trim();

  if (!businessName || !ownerFirstName || !phone || !email || !serviceType) {
    return NextResponse.json(
      { success: false, error: "Missing required fields." },
      { status: 400 },
    );
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Server config error",
      },
      { status: 500 },
    );
  }

  // ---- Rate limit -------------------------------------------------------
  const ipHash = hashIp(getClientIp(request));
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // Count accepted submissions from this IP in last hour and last day
  const { count: hourCount } = await supabase
    .from("onboard_intake_log")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .eq("accepted", true)
    .gte("created_at", oneHourAgo);

  if ((hourCount ?? 0) >= RATE_LIMIT_HOUR) {
    await supabase.from("onboard_intake_log").insert({
      ip_hash: ipHash,
      email,
      business_name: businessName,
      accepted: false,
      rejection_reason: "rate_limit_hour",
    });
    return NextResponse.json(
      {
        success: false,
        error:
          "Too many submissions from your network in the last hour. Please try again later or email us directly.",
      },
      { status: 429 },
    );
  }

  const { count: dayCount } = await supabase
    .from("onboard_intake_log")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .eq("accepted", true)
    .gte("created_at", oneDayAgo);

  if ((dayCount ?? 0) >= RATE_LIMIT_DAY) {
    await supabase.from("onboard_intake_log").insert({
      ip_hash: ipHash,
      email,
      business_name: businessName,
      accepted: false,
      rejection_reason: "rate_limit_day",
    });
    return NextResponse.json(
      {
        success: false,
        error:
          "Daily submission limit reached. Please email us directly if you need to send another request.",
      },
      { status: 429 },
    );
  }

  // ---- Insert lead ------------------------------------------------------
  const intakeNotes = body.notes?.trim() || null;

  const insertPayload = {
    business_name: businessName,
    business_short_name: businessName,
    owner_first_name: ownerFirstName,
    business_phone: phone,
    business_website: body.business_website?.trim() || null,
    service_type: serviceType,
    primary_service: serviceType,
    service_area: body.service_area?.trim() || null,
    owner_email: email,
    intake_mode: "primary",
    is_active: false,
    notify_email: true,
    notify_dashboard_ping: true,
    notify_sms: false,
    service_constraints: intakeNotes
      ? `Intake notes from /onboard:\n${intakeNotes}`
      : null,
  };

  const { data, error } = await supabase
    .from("Clients")
    .insert(insertPayload)
    .select("id, business_name")
    .single();

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }

  // Log accepted submission for rate-limit accounting
  await supabase.from("onboard_intake_log").insert({
    ip_hash: ipHash,
    email,
    business_name: businessName,
    accepted: true,
  });

  return NextResponse.json({
    success: true,
    client_id: data.id,
    business_name: data.business_name,
  });
}
