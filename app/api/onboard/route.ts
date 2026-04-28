import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Public onboarding endpoint — captures a lead from the marketing
 * /onboard page and inserts a row into Clients with `is_active=false`
 * and a status that signals "needs operator setup".
 *
 * The full system_prompt and service config are filled in later by an
 * admin via /admin/clients/[id], which is the page that calls
 * `save_rendered_system_prompt(client_id)` once everything's set.
 */
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
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const businessName = (body.business_name ?? "").trim();
  const ownerFirstName = (body.owner_first_name ?? "").trim();
  const phone = (body.business_phone ?? "").trim();
  const email = (body.contact_email ?? "").trim();
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

  const insertPayload = {
    business_name: businessName,
    business_short_name: businessName,
    owner_first_name: ownerFirstName,
    business_phone: phone,
    business_website: body.business_website?.trim() || null,
    service_type: serviceType,
    primary_service: serviceType,
    service_area: body.service_area?.trim() || null,
    contact_email: email,
    intake_mode: "primary",
    is_active: false,
    notify_email: email,
    notify_dashboard_ping: true,
    notify_sms: false,
    setup_notes: body.notes?.trim() || null,
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

  return NextResponse.json({
    success: true,
    client_id: data.id,
    business_name: data.business_name,
  });
}
