import { createClient } from "@/lib/supabase/server";
import { isValidRole, type Role } from "./roles";

/**
 * Get the authenticated user's role for their tenant. Cached per request
 * via React's request memoization (createClient already does this) but
 * we don't add explicit cache here — server components calling this
 * multiple times in one render is rare.
 *
 * Returns null if not signed in OR if the user is signed in but has no
 * client_users row (which shouldn't happen — auth without membership is
 * a broken state, treat as unauthorized).
 */
export async function getCurrentUserRole(): Promise<{
  role: Role;
  clientId: number;
  userId: string;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
}
