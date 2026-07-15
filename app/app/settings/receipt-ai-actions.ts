"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Flip the AI receipt-scanning entitlement (owner-only, spec §8.3).
 * Clients writes go through the service role after an explicit role check
 * (house pattern — Clients has no direct user write path for flags).
 * UI hiding is UX; the scan route re-checks this flag server-side on
 * every call (spec §8.2).
 */
export async function setReceiptAiEnabled(enabled: boolean): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: memberships } = await supabase
    .from("client_users")
    .select("client_id, role")
    .eq("auth_user_id", user.id)
    .eq("role", "owner")
    .limit(1);
  const clientId = memberships?.[0]?.client_id;
  if (!clientId) {
    return { ok: false, error: "Only the owner can change this." };
  }

  const { error } = await createAdminClient()
    .from("Clients")
    .update({ feature_receipt_ai_enabled: enabled })
    .eq("id", clientId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/settings");
  revalidatePath("/app/estimator/purchases");
  return { ok: true };
}
