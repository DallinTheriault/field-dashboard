import { createClient } from "@/lib/supabase/server";
import type { Tag } from "./types";

/**
 * List all tags for a tenant, sorted by usage (most used first), then by
 * recency (newest second). Used to populate the search-and-suggest UI.
 */
export async function listTagsForClient(clientId: number): Promise<Tag[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tags")
    .select("*")
    .eq("client_id", clientId)
    .order("use_count", { ascending: false })
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data as Tag[];
}

/**
 * Fetch tags currently attached to a job. Used in detail/list rendering.
 */
export async function getJobTags(jobId: number): Promise<Tag[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_tags")
    .select("tag:tags(*)")
    .eq("job_id", jobId);

  if (error || !data) return [];
  // Supabase types nested joins as arrays even when 1:1; cast through unknown
  return (data as unknown as Array<{ tag: Tag | null }>)
    .map((r) => r.tag)
    .filter((t): t is Tag => t !== null);
}

/**
 * Fetch tags currently attached to a contact.
 */
export async function getContactTags(contactId: number): Promise<Tag[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_tags")
    .select("tag:tags(*)")
    .eq("contact_id", contactId);

  if (error || !data) return [];
  return (data as unknown as Array<{ tag: Tag | null }>)
    .map((r) => r.tag)
    .filter((t): t is Tag => t !== null);
}

/**
 * Bulk-fetch tags for a list of jobs in one round-trip. Returns a map of
 * job_id -> Tag[]. Used by list views to show tag chips on each row.
 */
export async function getTagsByJobIds(
  jobIds: number[],
): Promise<Map<number, Tag[]>> {
  const result = new Map<number, Tag[]>();
  if (jobIds.length === 0) return result;
  const supabase = await createClient();
  const { data } = await supabase
    .from("job_tags")
    .select("job_id, tag:tags(*)")
    .in("job_id", jobIds);

  if (!data) return result;
  for (const row of data as unknown as Array<{ job_id: number; tag: Tag | null }>) {
    if (!row.tag) continue;
    const existing = result.get(row.job_id) ?? [];
    existing.push(row.tag);
    result.set(row.job_id, existing);
  }
  return result;
}

/**
 * Bulk-fetch tags for a list of contacts in one round-trip.
 */
export async function getTagsByContactIds(
  contactIds: number[],
): Promise<Map<number, Tag[]>> {
  const result = new Map<number, Tag[]>();
  if (contactIds.length === 0) return result;
  const supabase = await createClient();
  const { data } = await supabase
    .from("contact_tags")
    .select("contact_id, tag:tags(*)")
    .in("contact_id", contactIds);

  if (!data) return result;
  for (const row of data as unknown as Array<{ contact_id: number; tag: Tag | null }>) {
    if (!row.tag) continue;
    const existing = result.get(row.contact_id) ?? [];
    existing.push(row.tag);
    result.set(row.contact_id, existing);
  }
  return result;
}

export type { Tag } from "./types";
