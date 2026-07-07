import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/request-cache";
import { isValidRole, type Role } from "./roles";

/**
 * Get the authenticated user's role for their tenant. cache()d per request:
 * layout, page, and nested components all share ONE auth round-trip and ONE
 * membership query per navigation.
 *
 * Returns null if not signed in OR if the user is signed in but has no
 * client_users row (which shouldn't happen — auth without membership is
 * a broken state, treat as unauthorized).
 */
export const getCurrentUserRole = cache(async (): Promise<{
  role: Role;
  clientId: number;
  userId: string;
} | null> => {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return null;

  // First membership wins. Field is currently single-tenant-per-user;
  // multi-tenant per-user requires a tenant switcher and isn't planned.
  const { data: membership } = await supabase
    .from("client_users")
    .select("client_id, role")
    .eq("auth_user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership || !isValidRole(membership.role)) return null;

  return {
    role: membership.role,
    clientId: membership.client_id,
    userId: user.id,
  };
});
