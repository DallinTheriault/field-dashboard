import { createClient } from "@/lib/supabase/server";

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
