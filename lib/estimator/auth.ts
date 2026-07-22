import { createClient } from "@/lib/supabase/server";
import { isValidRole, type Role } from "@/lib/permissions/roles";

export type WriterAuth =
  | { ok: false; error: string }
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createClient>>;
      clientId: number;
    };

/**
 * Server-action gate for estimator writes: signed-in owner/manager of a
 * tenant. Mirrors the user_can_write_client RLS policy; RLS remains the
 * backstop on every query made with the returned client.
 */
export async function requireWriter(): Promise<WriterAuth> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: memberships } = await supabase
    .from("client_users")
    .select("client_id, role")
    .eq("auth_user_id", user.id)
    .in("role", ["owner", "manager"]);
  const clientId = memberships?.[0]?.client_id as number | undefined;
  if (!clientId) {
    return { ok: false, error: "You don't have permission to do this." };
  }
  return { ok: true, supabase, clientId };
}

export type MemberAuth =
  | { ok: false; error: string }
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createClient>>;
      clientId: number;
      role: Role;
      userId: string;
    };

/**
 * Server-action gate for expense CAPTURE: any signed-in member of a tenant
 * (member/manager/owner). client_id + role derive from the session, never
 * the request body. Callers using the admin client MUST still verify that
 * every target row (job, purchase, item) belongs to this client_id — the
 * admin client bypasses RLS, so this is the only tenant boundary.
 */
export async function requireMember(): Promise<MemberAuth> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: memberships } = await supabase
    .from("client_users")
    .select("client_id, role")
    .eq("auth_user_id", user.id)
    .order("created_at", { ascending: true });
  const m = memberships?.[0];
  if (!m || !isValidRole(m.role)) {
    return { ok: false, error: "You're not on a team." };
  }
  return {
    ok: true,
    supabase,
    clientId: m.client_id as number,
    role: m.role,
    userId: user.id,
  };
}
