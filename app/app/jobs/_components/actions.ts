"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toE164US } from "@/lib/sms/phone";

const VALID_STATUSES = [
  "lead",
  "estimated",
  "accepted",
  "scheduled",
  "in_progress",
  "completed",
  "callback",
  "callback_complete",
  "cancelled",
] as const;

type CreateJobResult =
  | { ok: true; jobId: number }
  | { ok: false; error: string };

/**
 * Compose the single free-text address that every display path reads
 * (jobs.address is the displayed truth — see CONTACTS_PROPERTIES_SPEC §4).
 * A property's structured address + unit collapse into one string here.
 */
function composeAddress(address: string, unit: string | null): string {
  const a = address.trim();
  const u = (unit ?? "").trim();
  return u ? `${a}, Unit ${u}` : a;
}

/**
 * Resolve the caller's tenant, requiring owner/manager (job creation is a
 * write). Returns the client_id or an error message.
 */
async function requireWriterClientId(): Promise<
  { ok: true; clientId: number } | { ok: false; error: string }
> {
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

  const allowed = memberships ?? [];
  if (allowed.length === 0) {
    return { ok: false, error: "You don't have permission to create jobs." };
  }
  // V1: one tenant per user; first membership wins (matches prior behavior).
  return { ok: true, clientId: allowed[0].client_id };
}

export type CreateJobInput = {
  /** Existing contact picked from the combobox. Omit for the manual path. */
  contactId?: number | null;
  /** Manual path (new contact) — also the display name/phone source. */
  name?: string;
  phone?: string;
  /** Existing property picked for the chosen contact. */
  propertyId?: number | null;
  /** New address typed (manual path, or "new property" for a known contact). */
  address?: string;
  /** Optional unit — feeds the §5.3 unit-becomes-property auto-save. */
  unit?: string;
  /** Optional "bill to" override; null bills the property's contact. */
  billToContactId?: number | null;
  status?: string;
};

/**
 * Create a job through any of the three CONTACTS_PROPERTIES_SPEC paths:
 *   1. existing contact + existing property (+ optional new unit → auto-saved)
 *   2. existing contact + brand-new address (saved as a property on them)
 *   3. fresh manual lead (name/phone/address → new contact + first property)
 * Plus an optional per-job bill-to override.
 *
 * All contact/property/bill-to references are re-checked against the caller's
 * client_id here (Handoff 2 guard pattern) since writes use the admin client —
 * a cross-tenant id is impossible even if the UI is bypassed.
 */
export async function createJob(input: CreateJobInput): Promise<CreateJobResult> {
  const status = (input.status ?? "lead").trim();
  if (!VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    return { ok: false, error: "Invalid status." };
  }

  const gate = await requireWriterClientId();
  if (!gate.ok) return gate;
  const { clientId } = gate;

  const admin = createAdminClient();

  // ---- 1. Resolve the contact -------------------------------------------
  let contact: {
    id: number;
    name: string | null;
    phone: string | null;
    email: string | null;
  };

  if (input.contactId != null) {
    const { data: c } = await admin
      .from("contacts")
      .select("id, client_id, name, phone, email")
      .eq("id", input.contactId)
      .maybeSingle();
    if (!c || c.client_id !== clientId) {
      return { ok: false, error: "Contact not found." };
    }
    contact = { id: c.id, name: c.name, phone: c.phone, email: c.email };
  } else {
    // Manual path — need a name + a normalizable phone.
    const name = (input.name ?? "").trim();
    const rawPhone = (input.phone ?? "").trim();
    if (!name) return { ok: false, error: "Name is required." };
    if (!rawPhone) return { ok: false, error: "Phone is required." };
    const phone = toE164US(rawPhone);
    if (!phone) {
      return {
        ok: false,
        error: "Phone must be a 10-digit US number (e.g. 801-555-1234).",
      };
    }
    // Match-or-create by (client_id, phone), same as the original flow.
    const { data: existing } = await admin
      .from("contacts")
      .select("id, name, phone, email")
      .eq("client_id", clientId)
      .eq("phone", phone)
      .maybeSingle();
    if (existing) {
      contact = {
        id: existing.id,
        name: existing.name,
        phone: existing.phone,
        email: existing.email,
      };
    } else {
      const { data: created, error: cErr } = await admin
        .from("contacts")
        .insert({
          client_id: clientId,
          phone,
          name,
          first_contacted_at: new Date().toISOString(),
          last_contacted_at: new Date().toISOString(),
        })
        .select("id, name, phone, email")
        .single();
      if (cErr || !created) {
        return { ok: false, error: "Failed to create contact. Try again." };
      }
      contact = {
        id: created.id,
        name: created.name,
        phone: created.phone,
        email: created.email,
      };
    }
  }

  // ---- 2. Resolve the property + the displayed address -------------------
  let propertyId: number;
  let jobAddress: string;

  if (input.propertyId != null) {
    const { data: prop } = await admin
      .from("properties")
      .select("id, client_id, contact_id, address, unit")
      .eq("id", input.propertyId)
      .maybeSingle();
    if (!prop || prop.client_id !== clientId || prop.contact_id !== contact.id) {
      return { ok: false, error: "Property not found for this contact." };
    }
    const typedUnit = (input.unit ?? "").trim() || null;
    if (typedUnit && typedUnit !== prop.unit) {
      // §5.3 — a new unit at a known property auto-saves as its own property
      // (same address, new unit). An existing match is reused. No prompt.
      const resolved = await findOrCreateProperty(
        admin,
        clientId,
        contact.id,
        prop.address,
        typedUnit,
      );
      if (!resolved) return { ok: false, error: "Failed to save the unit." };
      propertyId = resolved;
      jobAddress = composeAddress(prop.address, typedUnit);
    } else {
      propertyId = prop.id;
      jobAddress = composeAddress(prop.address, prop.unit);
    }
  } else {
    // New address (manual path, or "new property" for a known contact).
    const baseAddress = (input.address ?? "").trim();
    if (!baseAddress) return { ok: false, error: "Address is required." };
    const typedUnit = (input.unit ?? "").trim() || null;
    const resolved = await findOrCreateProperty(
      admin,
      clientId,
      contact.id,
      baseAddress,
      typedUnit,
    );
    if (!resolved) return { ok: false, error: "Failed to save the property." };
    propertyId = resolved;
    jobAddress = composeAddress(baseAddress, typedUnit);
  }

  // ---- 3. Optional bill-to override --------------------------------------
  let billToContactId: number | null = null;
  if (input.billToContactId != null) {
    const { data: bc } = await admin
      .from("contacts")
      .select("id, client_id")
      .eq("id", input.billToContactId)
      .maybeSingle();
    if (!bc || bc.client_id !== clientId) {
      return { ok: false, error: "Bill-to contact not found." };
    }
    billToContactId = bc.id;
  }

  // ---- 4. Insert the job -------------------------------------------------
  const { data: newJob, error: jobErr } = await admin
    .from("jobs")
    .insert({
      client_id: clientId,
      name: contact.name ?? (input.name ?? "").trim(),
      phone: contact.phone,
      email: contact.email,
      address: jobAddress,
      status,
      contact_id: contact.id,
      property_id: propertyId,
      bill_to_contact_id: billToContactId,
      source: "manual",
    })
    .select("id")
    .single();

  if (jobErr || !newJob) {
    console.error("[create-job] job insert failed", jobErr);
    return {
      ok: false,
      error: jobErr?.message ?? "Failed to create job. Try again.",
    };
  }

  revalidatePath("/app/jobs");
  revalidatePath("/app");
  return { ok: true, jobId: newJob.id };
}

/**
 * Reuse an exact (contact, address, unit) property or create a new one.
 * Soft-guards duplicates at the app layer (§5.2) — never hard-fails.
 * Returns the property id, or null on write failure.
 */
async function findOrCreateProperty(
  admin: ReturnType<typeof createAdminClient>,
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
    console.error("[create-job] property create failed", error);
    return null;
  }
  return created.id;
}

/**
 * Backward-compatible manual entry point (calendar quick-create + any caller
 * that only has name/phone/address). Delegates to the path-3 flow.
 */
export async function createJobManual(formData: {
  name: string;
  phone: string;
  address: string;
  status?: string;
}): Promise<CreateJobResult> {
  return createJob({
    name: formData.name,
    phone: formData.phone,
    address: formData.address,
    status: formData.status,
  });
}

/**
 * Create a job and redirect to its detail page. Used by forms that want
 * automatic navigation.
 */
export async function createJobAndRedirect(formData: {
  name: string;
  phone: string;
  address: string;
  status?: string;
}) {
  const result = await createJobManual(formData);
  if (!result.ok) return result;
  redirect(`/app/jobs/${result.jobId}`);
}

export type ContactHit = {
  id: number;
  name: string | null;
  phone: string | null;
};

/**
 * Typeahead for the New Job contact combobox. Scoped to the caller's tenant
 * by RLS (the user client). Matches on name or phone digits.
 */
export async function searchContacts(query: string): Promise<ContactHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const supabase = await createClient();

  // Match name (case-insensitive) OR phone digits. Phone is stored E.164, so
  // strip the user's separators before the phone LIKE.
  const digits = q.replace(/\D/g, "");
  const ors = [`name.ilike.%${q}%`];
  if (digits.length >= 3) ors.push(`phone.ilike.%${digits}%`);

  const { data } = await supabase
    .from("contacts")
    .select("id, name, phone")
    .is("archived_at", null)
    .or(ors.join(","))
    .order("last_contacted_at", { ascending: false, nullsFirst: false })
    .limit(8);
  return (data ?? []) as ContactHit[];
}

export type PropertyHit = {
  id: number;
  address: string;
  unit: string | null;
  label: string | null;
};

/**
 * The saved properties for a contact, for the New Job property selector.
 * RLS-scoped to the caller's tenant.
 */
export async function getContactProperties(
  contactId: number,
): Promise<PropertyHit[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("properties")
    .select("id, address, unit, label")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: true });
  return (data ?? []) as PropertyHit[];
}
