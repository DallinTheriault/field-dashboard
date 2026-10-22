"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWriter } from "@/lib/estimator/auth";
import { getTenantTimezone, dayKeyInTz } from "@/lib/dates";
import { BATCH_MS, syncDayTrips, type SyncResult } from "@/lib/mileage/sync";
import { baseOn, daysBetween } from "@/lib/mileage/plan";
import { milesFromBase, type PropertyMiles } from "@/lib/mileage/property-miles";
import { checkServices, type ServiceCheck } from "@/lib/mileage/geo";
import { sharedTurn } from "@/lib/mileage/throttle";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const round1 = (n: number) => Math.round((n + 1e-9) * 10) / 10;
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

function cleanMiles(v: number | string): number | null {
  const n = Number(String(v).replace(/[^\d.]/g, ""));
  if (String(v).trim() === "" || !Number.isFinite(n) || n < 0) return null;
  return round1(n);
}

function revalidate(jobIds: Array<number | null | undefined> = []) {
  revalidatePath("/app/estimator/mileage");
  revalidatePath("/app/estimator/mileage/catch-up");
  revalidatePath("/app/estimator/expenses");
  for (const id of jobIds) if (id) revalidatePath(`/app/jobs/${id}`);
}

/**
 * Every action here ends well inside the server's 60 s limit: lookups start
 * only within a budget, and each request gives up after 8 s. After a change
 * (a base, days on site) a short batch covers the usual one or two days;
 * anything left stays pending for the Mileage page's batches.
 */
const AFTER_CHANGE_MS = 10_000;
const LOOKUP_MS = 15_000;

async function sync(clientId: number, budgetMs = AFTER_CHANGE_MS): Promise<SyncResult> {
  return syncDayTrips(createAdminClient(), clientId, { network: true, tz: await getTenantTimezone(), budgetMs });
}

/** One batch of trips that need a lookup (the Mileage page runs these until none are left). */
export async function syncTripsNow(): Promise<Result<SyncResult>> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const r = await sync(auth.clientId, BATCH_MS);
  if (r.inserted || r.updated || r.deleted) revalidate();
  return { ok: true, data: r };
}

/** One-way miles from today's base to an address, to check against Google Maps. */
export async function propertyMilesNow(address: string): Promise<Result<PropertyMiles>> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const a = (address ?? "").trim();
  if (!a) return { ok: true, data: { status: "no_address", address: "" } };
  const today = dayKeyInTz(new Date(), await getTenantTimezone());
  return { ok: true, data: await milesFromBase(createAdminClient(), auth.clientId, a, today, Date.now() + LOOKUP_MS) };
}

/** Ask each map service once, from today's base: can Field reach them? */
export async function checkMapServices(): Promise<Result<{ base: string; checks: ServiceCheck[] }>> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const admin = createAdminClient();
  const today = dayKeyInTz(new Date(), await getTenantTimezone());
  const { data: bases } = await admin.from("mileage_bases").select("id, address, effective_from").eq("client_id", auth.clientId);
  const base = baseOn(
    today,
    (bases ?? []).map((b) => ({ id: b.id, address: b.address, effectiveFrom: String(b.effective_from) })),
  );
  if (!base) return { ok: false, error: "Add a base first." };
  const checks = await checkServices(base.address, null, sharedTurn(admin, Date.now() + LOOKUP_MS));
  return { ok: true, data: { base: base.address, checks } };
}

/* ---------- trips ---------- */

export type TripInput = {
  tripDate: string;
  /** Where the drive started; blank = the base on that date. */
  startAddress?: string;
  destination: string;
  purpose: string;
  miles: number | string;
  jobId?: number | null;
};

/** A trip added by hand (a supply run, work from before Field). Never recalculated. */
export async function createTrip(input: TripInput): Promise<Result<{ id: number }>> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const { clientId } = auth;
  const tripDate = (input.tripDate ?? "").slice(0, 10);
  const destination = (input.destination ?? "").trim();
  const purpose = (input.purpose ?? "").trim();
  const miles = cleanMiles(input.miles);
  if (!isDate(tripDate)) return { ok: false, error: "Pick a date." };
  if (!destination) return { ok: false, error: "Where did you drive?" };
  if (!purpose) return { ok: false, error: "What was it for?" };
  if (miles === null) return { ok: false, error: "Miles must be a number, 0 or more." };

  const admin = createAdminClient();
  let jobId: number | null = null;
  if (input.jobId != null) {
    const { data: job } = await admin.from("jobs").select("id, client_id").eq("id", Number(input.jobId)).maybeSingle();
    if (!job || job.client_id !== clientId) return { ok: false, error: "Job not found." };
    jobId = job.id;
  }
  let start = (input.startAddress ?? "").trim() || null;
  let baseId: number | null = null;
  if (!start) {
    const { data: bases } = await admin.from("mileage_bases").select("id, address, effective_from").eq("client_id", clientId);
    const b = baseOn(
      tripDate,
      (bases ?? []).map((x) => ({ id: x.id, address: x.address, effectiveFrom: String(x.effective_from) })),
    );
    start = b?.address ?? null;
    baseId = b?.id ?? null;
  }
  const { data, error } = await admin
    .from("mileage_entries")
    .insert({
      client_id: clientId,
      trip_date: tripDate,
      kind: "manual",
      source: "manual",
      job_id: jobId,
      base_id: baseId,
      start_address: start,
      destination,
      purpose,
      miles,
      miles_status: "ok",
      round_trip: true,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Couldn't save the trip." };
  revalidate([jobId]);
  return { ok: true, data: { id: data.id } };
}

/**
 * Edit a trip. An automatic trip that's edited becomes "edited" and is never
 * recalculated again (Put back undoes that). Typing miles into a trip Field
 * couldn't work out is an edit like any other.
 */
export async function updateTrip(
  id: number,
  patch: { tripDate?: string; startAddress?: string; destination?: string; purpose?: string; miles?: number | string },
): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("mileage_entries")
    .select("id, client_id, kind, job_id")
    .eq("id", Number(id))
    .maybeSingle();
  if (!row || row.client_id !== auth.clientId) return { ok: false, error: "Trip not found." };
  if (row.kind === "removed") return { ok: false, error: "Put this trip back before editing it." };

  const update: Record<string, unknown> = {};
  if (patch.tripDate !== undefined) {
    const d = patch.tripDate.slice(0, 10);
    if (!isDate(d)) return { ok: false, error: "Pick a date." };
    if (row.kind !== "manual") return { ok: false, error: "An automatic trip's date comes from the days on site." };
    update.trip_date = d;
  }
  if (patch.startAddress !== undefined) update.start_address = patch.startAddress.trim() || null;
  if (patch.destination !== undefined) {
    if (!patch.destination.trim()) return { ok: false, error: "Where did you drive?" };
    update.destination = patch.destination.trim();
  }
  if (patch.purpose !== undefined) {
    if (!patch.purpose.trim()) return { ok: false, error: "What was it for?" };
    update.purpose = patch.purpose.trim();
  }
  if (patch.miles !== undefined) {
    const m = cleanMiles(patch.miles);
    if (m === null) return { ok: false, error: "Miles must be a number, 0 or more." };
    update.miles = m;
    update.miles_status = "ok";
    update.miles_note = null;
  }
  if (Object.keys(update).length === 0) return { ok: true };
  if (row.kind === "auto") update.kind = "edited";

  const { error } = await admin.from("mileage_entries").update(update).eq("id", row.id);
  if (error) return { ok: false, error: error.message };
  revalidate([row.job_id]);
  return { ok: true };
}

/** Delete a trip. An automatic one is kept as removed, so it isn't made again. */
export async function deleteTrip(id: number): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("mileage_entries")
    .select("id, client_id, kind, job_id")
    .eq("id", Number(id))
    .maybeSingle();
  if (!row || row.client_id !== auth.clientId) return { ok: false, error: "Trip not found." };
  const { error } =
    row.kind === "manual"
      ? await admin.from("mileage_entries").delete().eq("id", row.id)
      : await admin.from("mileage_entries").update({ kind: "removed" }).eq("id", row.id);
  if (error) return { ok: false, error: error.message };
  revalidate([row.job_id]);
  return { ok: true };
}

/** Undo an edit or a removal: the day goes back to its automatic trip. */
export async function restoreTrip(id: number): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("mileage_entries")
    .select("id, client_id, kind, job_id")
    .eq("id", Number(id))
    .maybeSingle();
  if (!row || row.client_id !== auth.clientId) return { ok: false, error: "Trip not found." };
  if (row.kind !== "edited" && row.kind !== "removed") return { ok: false, error: "Nothing to put back." };
  const { error } = await admin
    .from("mileage_entries")
    .update({ kind: "auto", miles_status: "pending" })
    .eq("id", row.id);
  if (error) return { ok: false, error: error.message };
  await sync(auth.clientId);
  revalidate([row.job_id]);
  return { ok: true };
}

/* ---------- bases ---------- */

/**
 * Where trips start, from a date on. Adding or changing one recalculates the
 * automatic trips it covers; edited and manual trips stay as they are.
 */
export async function saveBase(input: { id?: number | null; address: string; effectiveFrom: string }): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const address = (input.address ?? "").trim();
  const from = (input.effectiveFrom ?? "").slice(0, 10);
  if (!address) return { ok: false, error: "Enter the address." };
  if (!isDate(from)) return { ok: false, error: "Pick the date it starts." };
  const admin = createAdminClient();
  const { error } = input.id
    ? await admin
        .from("mileage_bases")
        .update({ address, effective_from: from })
        .eq("id", Number(input.id))
        .eq("client_id", auth.clientId)
    : await admin.from("mileage_bases").insert({ client_id: auth.clientId, address, effective_from: from });
  if (error) {
    return { ok: false, error: error.code === "23505" ? "There's already a base starting that day." : error.message };
  }
  await sync(auth.clientId);
  revalidate();
  return { ok: true };
}

export async function deleteBase(id: number): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const admin = createAdminClient();
  const { error } = await admin.from("mileage_bases").delete().eq("id", Number(id)).eq("client_id", auth.clientId);
  if (error) return { ok: false, error: error.message };
  await sync(auth.clientId);
  revalidate();
  return { ok: true };
}

/* ---------- rates ---------- */

/** The IRS rate from a date on. Each trip uses the rate in effect on its date. */
export async function saveRatePeriod(input: { effectiveFrom: string; rate: number | string; note?: string }): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const from = (input.effectiveFrom ?? "").slice(0, 10);
  const raw = String(input.rate).trim();
  // Typed as cents (76) or dollars (0.76): both mean 76 cents.
  let rate = Number(raw.replace(/[^\d.]/g, ""));
  if (!isDate(from)) return { ok: false, error: "Pick the date it starts." };
  if (!raw || !Number.isFinite(rate) || rate < 0) return { ok: false, error: "Enter the rate, e.g. 0.76." };
  if (rate >= 10) rate = rate / 100;
  const admin = createAdminClient();
  const { error } = await admin.from("mileage_rate_periods").upsert(
    { client_id: auth.clientId, effective_from: from, rate_per_mile: Math.round(rate * 10000) / 10000, note: input.note?.trim() || null },
    { onConflict: "client_id,effective_from" },
  );
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

export async function deleteRatePeriod(effectiveFrom: string): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const admin = createAdminClient();
  const { error } = await admin
    .from("mileage_rate_periods")
    .delete()
    .eq("client_id", auth.clientId)
    .eq("effective_from", effectiveFrom.slice(0, 10));
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

/* ---------- days on site ---------- */

async function jobInTenant(admin: ReturnType<typeof createAdminClient>, jobId: number, clientId: number) {
  const { data } = await admin
    .from("jobs")
    .select("id, client_id, start_datetime, end_datetime")
    .eq("id", jobId)
    .maybeSingle();
  return data && data.client_id === clientId ? data : null;
}

/**
 * After a job is marked completed: if it has no hours logged and no days on
 * site, the days to ask about ("Which days were you there?"), starting from
 * the scheduled days. Null when there's nothing to ask.
 */
export async function siteDaysToAsk(jobId: number): Promise<Result<{ days: string[] } | null>> {
  const auth = await requireWriter();
  if (!auth.ok) return { ok: true, data: null }; // members aren't asked
  const admin = createAdminClient();
  const job = await jobInTenant(admin, Number(jobId), auth.clientId);
  if (!job) return { ok: false, error: "Job not found." };
  const [{ count: hours }, { count: days }] = await Promise.all([
    admin.from("time_entries").select("*", { count: "exact", head: true }).eq("job_id", job.id),
    admin.from("job_site_days").select("*", { count: "exact", head: true }).eq("job_id", job.id),
  ]);
  if ((hours ?? 0) > 0 || (days ?? 0) > 0) return { ok: true, data: null };
  const tz = await getTenantTimezone();
  const start = job.start_datetime ? dayKeyInTz(job.start_datetime, tz) : null;
  const end = job.end_datetime ? dayKeyInTz(job.end_datetime, tz) : null;
  return { ok: true, data: { days: start ? daysBetween(start, end) : [] } };
}

/** Save the days on site for a job (replacing any entered before), then work out the trips. */
export async function setJobSiteDays(jobId: number, days: string[]): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const clean = [...new Set((days ?? []).map((d) => String(d).slice(0, 10)).filter(isDate))].sort();
  if (clean.length > 62) return { ok: false, error: "That's more days than one job should have." };
  const admin = createAdminClient();
  const job = await jobInTenant(admin, Number(jobId), auth.clientId);
  if (!job) return { ok: false, error: "Job not found." };
  const { error: dErr } = await admin.from("job_site_days").delete().eq("job_id", job.id);
  if (dErr) return { ok: false, error: dErr.message };
  if (clean.length > 0) {
    const { error } = await admin
      .from("job_site_days")
      .insert(clean.map((day) => ({ client_id: auth.clientId, job_id: job.id, day })));
    if (error) return { ok: false, error: error.message };
  }
  await admin.from("jobs").update({ site_days_done_at: new Date().toISOString() }).eq("id", job.id);
  await sync(auth.clientId);
  revalidate([job.id]);
  return { ok: true };
}

/** Catch-up: "I wasn't on site for this one." */
export async function markNoSiteDays(jobId: number): Promise<Result> {
  return setJobSiteDays(jobId, []);
}
