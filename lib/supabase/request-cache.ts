import { cache } from "react";
import { createClient } from "./server";

/**
 * Per-request memoization for the auth + tenant lookups that layout, page,
 * and permission helpers each repeat on EVERY navigation. Before this,
 * one click could fire 3-4 identical Supabase Auth round-trips plus
 * duplicate client_users/Clients queries, all serialized — a large chunk
 * of the multi-second page switches.
 *
 * React cache() dedupes within a single server render; nothing persists
 * across requests, so auth freshness is unchanged.
 */

/** One auth.getUser() network round-trip per request, shared by all callers. */
export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
