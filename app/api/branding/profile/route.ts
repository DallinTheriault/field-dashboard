import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Owner-editable subset of Clients fields. Things like business_name,
 * twilio_number, vapi_assistant_id, calendar_id, intake_mode, primary_service,
 * service_type, and timezone are intentionally NOT in this list — those are
 * operator-managed at /admin/clients/[id] for billing/identity reasons.
 */
const ALLOWED_FIELDS = new Set([
  "business_short_name",
  "owner_first_name",
  "owner_email",
  "owner_phone",
  "business_website",
  "business_hours",
  "service_area",
  "pricing_block",
  "scope_values",
  "service_constraints",
  "escalation_phone",
]);

const MAX_LEN = 2000;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: clientUsers } = await supabase
    .from("client_users")
    .select("client_id, role")
    .eq("auth_user_id", user.id)
    .in("role", ["owner", "manager"])
    .limit(1);

  const clientId = clientUsers?.[0]?.client_id;
  if (!clientId) {
    return NextResponse.json(
      { error: "You don't have permission to edit this business" },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED_FIELDS.has(key)) continue;
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length > MAX_LEN) {
      return NextResponse.json(
        { error: `${key} is too long (max ${MAX_LEN} chars)` },
        { status: 400 },
      );
    }
    update[key] = trimmed === "" ? null : trimmed;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("Clients")
    .update(update)
    .eq("id", clientId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
