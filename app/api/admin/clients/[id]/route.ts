import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";

/**
 * Update a Clients row from the admin form.
 *
 * Authorization: the caller's email must be in ADMIN_EMAILS. We re-check
 * here because this route uses the service-role client (bypasses RLS) and
 * we don't want to rely solely on the admin layout for protection.
 *
 * Only the platform-managed fields below are written; anything else in the
 * body is ignored.
 */
const ALLOWED_FIELDS = new Set([
  "business_name",
  "business_short_name",
  "owner_first_name",
  "business_phone",
  "business_website",
  "owner_email",
  "owner_phone",
  "timezone_label",
  "calendar_id",
  "is_active",
  "is_test",
  "feature_calendar_enabled",
  "feature_estimator_enabled",
  "feature_receipt_ai_enabled",
]);
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  // ---- Auth check ----
  const sb = await createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: "Not signed in." },
      { status: 401 },
    );
  }
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!adminEmails.includes((user.email ?? "").toLowerCase())) {
    return NextResponse.json(
      { success: false, error: "Forbidden." },
      { status: 403 },
    );
  }

  const { id } = await context.params;
  const clientId = Number(id);
  if (!Number.isInteger(clientId) || clientId < 1) {
    return NextResponse.json(
      { success: false, error: "Invalid client id." },
      { status: 400 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Coerce booleans/strings — supabase-js handles types, but trim strings.
  const update: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED_FIELDS.has(key)) continue;
    if (typeof value === "string") {
      update[key] = value.trim() === "" ? null : value.trim();
    } else {
      update[key] = value;
    }
  }
  update.updated_at = new Date().toISOString();

  const { error: updateError } = await admin
    .from("Clients")
    .update(update)
    .eq("id", clientId);

  if (updateError) {
    return NextResponse.json(
      { success: false, error: `Update failed: ${updateError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
