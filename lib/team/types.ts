/**
 * Client-safe types and pure helpers for team members.
 * Server-only fetch lives in `./members.ts` — DO NOT import that from a
 * client component.
 */

export type TeamMember = {
  user_id: string;
  email: string;
  display_name: string | null;
  role: "owner" | "manager" | "member";
};

/**
 * Format a team member's display label. Used inline in dropdowns and chips.
 * Prefers display_name, falls back to local-part of email, finally to "user".
 */
export function formatMemberLabel(m: TeamMember | null | undefined): string {
  if (!m) return "Unassigned";
  if (m.display_name && m.display_name.trim()) return m.display_name.trim();
  const local = m.email?.split("@")[0];
  if (local) return local;
  return "user";
}
