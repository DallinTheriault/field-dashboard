"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Reject a pending intake by deleting the Clients row. Operator-only
 * (gated by ADMIN_EMAILS) and only for is_active=false rows so we can't
 * accidentally delete a live tenant from this surface.
 */
export async function rejectIntake(clientId: number): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim());
  if (!user.email || !adminEmails.includes(user.email)) {
    return { ok: false, error: "Not authorized." };
  }

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("Clients")
    .select("id, business_name, is_active")
    .eq("id", clientId)
    .maybeSingle();

  if (!target) return { ok: false, error: "Client not found." };
  if (target.is_active) {
    return {
      ok: false,
      error:
        "Won't delete an active tenant from the intake queue. Pause/deactivate it first.",
    };
  }

  const { error } = await admin.from("Clients").delete().eq("id", clientId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/clients");
  return { ok: true };
}
