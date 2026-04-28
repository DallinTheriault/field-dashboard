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
 * Pass `regenerate_prompt: true` in the body to also call the
 * `save_rendered_system_prompt(client_id)` RPC after the update lands.
 */
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

  const regenerate = Boolean(body.regenerate_prompt);
  // Strip control flag before passing to the DB.
  delete body.regenerate_prompt;
  // Never let the client overwrite the id.
  delete body.id;

  const admin = createAdminClient();

  // Coerce booleans/strings — supabase-js handles types, but trim strings.
  const update: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
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

  if (regenerate) {
    const { error: rpcError } = await admin.rpc("save_rendered_system_prompt", {
      p_client_id: clientId,
    });
    // The RPC may use a different param name in production. Try a fallback.
    if (rpcError && /could not find function|argument/i.test(rpcError.message)) {
      const { error: rpcError2 } = await admin.rpc(
        "save_rendered_system_prompt",
        { client_id: clientId },
      );
      if (rpcError2) {
        return NextResponse.json(
          {
            success: false,
            error: `Save succeeded, but prompt regeneration failed: ${rpcError2.message}`,
          },
          { status: 500 },
        );
      }
    } else if (rpcError) {
      return NextResponse.json(
        {
          success: false,
          error: `Save succeeded, but prompt regeneration failed: ${rpcError.message}`,
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ success: true });
}
