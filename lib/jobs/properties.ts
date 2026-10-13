import type { SupabaseClient } from "@supabase/supabase-js";
import { formatAddress } from "./address";

/**
 * Reuse an exact (contact, address, unit) property or create a new one.
 * Soft-guards duplicates at the app layer (§5.2) — never hard-fails.
 * Returns the property id, or null on write failure.
 */
export async function findOrCreateProperty(
  admin: SupabaseClient,
  clientId: number,
  contactId: number,
  address: string,
  unit: string | null,
): Promise<number | null> {
  let match = admin
    .from("properties")
    .select("id")
    .eq("client_id", clientId)
    .eq("contact_id", contactId)
    .eq("address", address);
  match = unit === null ? match.is("unit", null) : match.eq("unit", unit);
  const { data: existing } = await match.maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await admin
    .from("properties")
    .insert({ client_id: clientId, contact_id: contactId, address, unit })
    .select("id")
    .single();
  if (error || !created) {
    console.error("[properties] property create failed", error);
    return null;
  }
  return created.id;
}

export type RepointResult =
  | { ok: true; propertyId: number | null; address: string | null }
  | { ok: false; error: string };

/**
 * Apply an edited address to a job.
 *
 * A property can be shared by several of a contact's jobs, so editing one job's
 * address never rewrites a property. Instead the job moves onto the contact's
 * property with exactly that address + unit (created if there isn't one), and
 * jobs.address is rewritten to match it.
 *
 * Jobs with no contact can't own a property (properties.contact_id is
 * required); for those only jobs.address changes.
 */
export async function repointJobAddress(
  admin: SupabaseClient,
  clientId: number,
  jobId: number,
  input: { address: string; unit: string },
): Promise<RepointResult> {
  const { data: job } = await admin
    .from("jobs")
    .select("id, client_id, contact_id")
    .eq("id", jobId)
    .maybeSingle();
  if (!job || job.client_id !== clientId) return { ok: false, error: "Job not found." };

  const base = input.address.trim();
  const unit = input.unit.trim() || null;

  if (job.contact_id == null) {
    const text = formatAddress(base, unit);
    const { error } = await admin.from("jobs").update({ address: text }).eq("id", jobId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, propertyId: null, address: text };
  }

  if (!base) return { ok: false, error: "Address is required." };
  const propertyId = await findOrCreateProperty(admin, clientId, job.contact_id, base, unit);
  if (propertyId === null) return { ok: false, error: "Failed to save the property." };

  const text = formatAddress(base, unit);
  const { error } = await admin
    .from("jobs")
    .update({ property_id: propertyId, address: text })
    .eq("id", jobId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, propertyId, address: text };
}
