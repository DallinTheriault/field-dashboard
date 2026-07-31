import { createClient } from "@/lib/supabase/server";

/** Cap on suggestions offered. Well above any real tenant's vocabulary; it
 *  exists so free text can never balloon the page payload. */
const MAX_SUGGESTIONS = 50;

/**
 * Rank a tenant's raw `jobs.service` values into a suggestion list.
 *
 * jobs.service is free text, so the same job type arrives spelled several ways
 * ("Turn", "Turn work", "apartment turn"). Matching case-insensitively and
 * offering the most-used spelling back is what makes the list converge over
 * time instead of accumulating another variant on every job.
 *
 * Most used first (same convention as tag suggestions), ties broken
 * alphabetically so the order is stable between renders.
 */
export function rankServices(values: (string | null | undefined)[]): string[] {
  // key = lowercased value; we keep a count and the most common exact spelling.
  const groups = new Map<string, { total: number; spellings: Map<string, number> }>();

  for (const raw of values) {
    const value = raw?.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    const group = groups.get(key) ?? { total: 0, spellings: new Map() };
    group.total += 1;
    group.spellings.set(value, (group.spellings.get(value) ?? 0) + 1);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => {
      const best = [...group.spellings.entries()].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
      )[0][0];
      return { label: best, total: group.total };
    })
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label))
    .slice(0, MAX_SUGGESTIONS)
    .map((entry) => entry.label);
}

/**
 * The tenant's own distinct service values, for the edit form's datalist.
 *
 * Multi-tenant safety is structural: the query is scoped to the caller's
 * client_id and RLS scopes it again, so a tenant can only ever be suggested
 * words it typed itself. Nothing here is seeded with a trade vocabulary.
 */
export async function listServiceSuggestions(clientId: number): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("service")
    .eq("client_id", clientId)
    .not("service", "is", null);

  if (error || !data) return [];
  return rankServices(data.map((row) => row.service as string | null));
}
