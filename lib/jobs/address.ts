/**
 * Where a job is, and how a job reads in a picker.
 *
 * The job's property is the source of truth for its address. jobs.address is a
 * text copy taken when the job was created; it does not follow later edits to
 * the property, so it is read only for legacy jobs that have no property.
 */

import { BILLING_LABEL, type BillingState, type JobBilling } from "@/lib/jobs/billing";

/**
 * PostgREST select fragment for everything the helpers below read. jobs has
 * two FKs to contacts (contact_id and bill_to_contact_id), so the contact
 * embed has to name the one it means.
 */
export const JOB_LOCATION_SELECT =
  "address, property_id, property:properties(address, unit), contact:contacts!jobs_contact_id_fkey(name)";

// To-one embeds come back as an object, but supabase-js is untyped here, so
// accept the array shape too rather than trusting a cast.
type Embed<T> = T | T[] | null | undefined;

export type JobLocationRow = {
  name?: string | null;
  address: string | null;
  property_id: number | null;
  property?: Embed<{ address: string | null; unit: string | null }>;
  contact?: Embed<{ name: string | null }>;
};

function one<T>(v: Embed<T>): T | null {
  return (Array.isArray(v) ? v[0] : v) ?? null;
}

/** "359 E 200 N Provo UT, 84606, Unit 6" — the same shape job creation writes. */
export function formatAddress(
  address: string | null | undefined,
  unit: string | null | undefined,
): string | null {
  const a = (address ?? "").trim();
  if (!a) return null;
  const u = (unit ?? "").trim();
  return u ? `${a}, Unit ${u}` : a;
}

/** The job's address + unit, read from its property; jobs.address only when there is none. */
export function jobAddress(row: JobLocationRow): string | null {
  if (row.property_id != null) {
    const p = one(row.property);
    return formatAddress(p?.address, p?.unit);
  }
  return formatAddress(row.address, null);
}

/** The job's contact by name, else the name typed on the job. */
export function jobContactName(row: JobLocationRow): string | null {
  return one(row.contact)?.name?.trim() || row.name?.trim() || null;
}

/** What a job picker needs, resolved on the server so clients just render it. */
export type JobPick = {
  id: number;
  name: string;
  jobNumber: string | null;
  address: string | null;
  status: string | null;
  /** Billing state (owners/managers only; v099). */
  billing?: BillingState | null;
};

export function toJobPick(
  row: JobLocationRow & { id: number; job_number?: string | null; status?: string | null },
): JobPick {
  return {
    id: row.id,
    name: jobContactName(row) ?? row.job_number ?? `Job #${row.id}`,
    jobNumber: row.job_number ?? null,
    address: jobAddress(row),
    status: row.status ?? null,
  };
}

const JOB_STATUS_SHORT: Record<string, string> = {
  lead: "lead",
  estimated: "estimated",
  accepted: "accepted",
  scheduled: "scheduled",
  in_progress: "in progress",
  completed: "completed",
  callback: "callback",
  callback_complete: "callback done",
  cancelled: "cancelled",
};

/**
 * Picker label: address + unit first (what tells a property manager's jobs
 * apart), then job number, then contact, then status. Parts that are missing
 * are dropped, so legacy jobs with no number or address still read cleanly in
 * the native <select> picker at iPhone width.
 */
export function jobPickLabel(j: JobPick): string {
  const parts: string[] = [];
  if (j.address) parts.push(j.address);
  if (j.jobNumber && j.jobNumber !== j.name) parts.push(j.jobNumber);
  parts.push(j.name);
  if (j.status) parts.push(JOB_STATUS_SHORT[j.status] ?? j.status);
  if (j.billing) parts.push(BILLING_LABEL[j.billing].toLowerCase());
  return parts.join(" · ");
}

/** Picks with each job's billing state attached. */
export function withBilling(picks: JobPick[], billing: Map<number, JobBilling>): JobPick[] {
  return picks.map((p) => ({ ...p, billing: billing.get(p.id)?.state ?? null }));
}
