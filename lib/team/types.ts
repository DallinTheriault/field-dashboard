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
 * Prefers display_name. If absent, derives a friendlier label from email:
 * "dallintheriault" → "dallin t.", "synahtraofficial" → "synahtra o."
 */
export function formatMemberLabel(m: TeamMember | null | undefined): string {
  if (!m) return "Unassigned";
  if (m.display_name && m.display_name.trim()) return m.display_name.trim();
  const local = m.email?.split("@")[0];
  if (!local) return "user";
  // Try splitting on common separators (.,_,-) for "first.last" patterns
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0];
    const lastInitial = parts[parts.length - 1].charAt(0);
    return `${first} ${lastInitial}.`;
  }
  return local;
}
