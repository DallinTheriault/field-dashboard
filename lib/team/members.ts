import { createClient } from "@/lib/supabase/server";
import type { TeamMember } from "./types";

// Re-export types/helpers so existing imports from "@/lib/team/members"
// continue to work for SERVER consumers. Client components must import
// from "@/lib/team/types" directly to avoid pulling in next/headers.
export { formatMemberLabel } from "./types";
export type { TeamMember } from "./types";

/**
 * Fetch all team members for the current user's tenant. Used to populate
 * lead-assignment dropdowns on jobs and contacts.
 *
 * SERVER-ONLY — uses next/headers via supabase/server. Do not import this
 * function from a client component.
 */
export async function getTeamMembers(clientId: number): Promise<TeamMember[]> {
  const supabase = await createClient();

  const { data: rows, error } = await supabase.rpc("list_team_members", {
    p_client_id: clientId,
  });

  if (error || !rows) return [];

  return (rows as TeamMember[]).filter(
    (r) =>
      r.user_id &&
      r.role &&
      (r.role === "owner" || r.role === "manager" || r.role === "member"),
  );
}
