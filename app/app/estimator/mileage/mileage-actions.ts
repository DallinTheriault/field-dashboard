"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWriter } from "@/lib/estimator/auth";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const round1 = (n: number) => Math.round((n + 1e-9) * 10) / 10;

function cleanMiles(v: number | string): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return round1(n);
}

export type TripInput = {
  tripDate: string;
  destination: string;
  purpose: string;
  miles: number | string;
  jobId?: number | null;
  vehicle?: string | null;
  roundTrip?: boolean;
  source?: "manual" | "proposed";
  /** Only when the user explicitly opts in — never a side effect of editing. */
  saveDistanceToPropertyId?: number | null;
};

/**
 * Create one trip. Mileage is its own record type: this writes NOTHING to
 * purchases/expenses and never touches job costing.
 *
 * The proposal path carries `source: 'proposed'` and is guarded here against
 * producing a second trip for the same job + day. That guard is server-side on
 * purpose (architect requirement): the client's dismissal memory is a
 * convenience, so a cleared browser or a new device must not be able to
 * duplicate a trip. A partial unique index backs this up structurally.
 */
export async function createTrip(input: TripInput): Promise<Result<{ id: number }>> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const { clientId } = auth;

  const tripDate = (input.tripDate ?? "").slice(0, 10);
  const destination = (input.destination ?? "").trim();
  const purpose = (input.purpose ?? "").trim();
  const miles = cleanMiles(input.miles);
  const source = input.source === "proposed" ? "proposed" : "manual";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(tripDate)) return { ok: false, error: "Pick a date." };
  if (!destination) return { ok: false, error: "Where did you drive?" };
  if (!purpose) return { ok: false, error: "What was the business purpose?" };
  if (miles === null) return { ok: false, error: "Miles must be 0 or more." };

  const admin = createAdminClient();

  // Tenant boundary — the admin client bypasses RLS, so a referenced job must
  // belong to the caller's client_id (derived from the session, not the body).
  let jobId: number | null = null;
  if (input.jobId != null) {
    const { data: job } = await admin
      .from("jobs")
      .select("id, client_id")
      .eq("id", Number(input.jobId))
      .maybeSingle();
    if (!job || job.client_id !== clientId) return { ok: false, error: "Job not found." };
    jobId = job.id;
  }

  // Non-negotiable duplicate guard for proposals: ANY existing entry for this
  // job + date means no second trip gets proposed into existence.
  if (source === "proposed" && jobId !== null) {
    const { count } = await admin
      .from("mileage_entries")
      .select("*", { count: "exact", head: true })
      .eq("client_id", clientId)
      .eq("job_id", jobId)
      .eq("trip_date", tripDate);
    if ((count ?? 0) > 0) {
      return { ok: false, error: "A trip is already logged for this job on that day." };
    }
  }

  const { data, error } = await admin
    .from("mileage_entries")
    .insert({
      client_id: clientId,
      trip_date: tripDate,
      job_id: jobId,
      destination,
      purpose,
      miles,
      round_trip: input.roundTrip ?? true,
      vehicle: (input.vehicle ?? "").trim() || null,
      source,
    })
    .select("id")
    .single();
  if (error || !data) {
    // The partial unique index is the structural backstop for the same race.
    if (error?.code === "23505") {
      return { ok: false, error: "A trip is already logged for this job on that day." };
    }
    return { ok: false, error: error?.message ?? "Couldn't save the trip." };
  }

  // Cache the distance on the property ONLY when explicitly requested (§5.3):
  // editing one trip must never silently overwrite the saved distance.
  if (input.saveDistanceToPropertyId != null) {
    const { data: prop } = await admin
      .from("properties")
      .select("id, client_id")
      .eq("id", Number(input.saveDistanceToPropertyId))
      .maybeSingle();
    if (prop && prop.client_id === clientId) {
      await admin
        .from("properties")
        .update({ miles_from_base: miles })
        .eq("id", prop.id);
    }
  }

  revalidatePath("/app/estimator/mileage");
  if (jobId) revalidatePath(`/app/jobs/${jobId}`);
  return { ok: true, data: { id: data.id } };
}

/** Edit a trip. created_at is immutable (a DB trigger enforces it too). */
export async function updateTrip(
  id: number,
  patch: {
    tripDate?: string;
    destination?: string;
    purpose?: string;
    miles?: number | string;
    vehicle?: string | null;
  },
): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const { clientId } = auth;

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("mileage_entries")
    .select("id, client_id, job_id")
    .eq("id", Number(id))
    .maybeSingle();
  if (!row || row.client_id !== clientId) return { ok: false, error: "Trip not found." };

  const update: Record<string, unknown> = {};
  if (patch.tripDate !== undefined) {
    const d = patch.tripDate.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: false, error: "Pick a date." };
    update.trip_date = d;
  }
  if (patch.destination !== undefined) {
    const v = patch.destination.trim();
    if (!v) return { ok: false, error: "Where did you drive?" };
    update.destination = v;
  }
  if (patch.purpose !== undefined) {
    const v = patch.purpose.trim();
    if (!v) return { ok: false, error: "What was the business purpose?" };
    update.purpose = v;
  }
  if (patch.miles !== undefined) {
    const m = cleanMiles(patch.miles);
    if (m === null) return { ok: false, error: "Miles must be 0 or more." };
    update.miles = m;
  }
  if (patch.vehicle !== undefined) update.vehicle = (patch.vehicle ?? "").trim() || null;
  if (Object.keys(update).length === 0) return { ok: true };

  const { error } = await admin.from("mileage_entries").update(update).eq("id", row.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/estimator/mileage");
  if (row.job_id) revalidatePath(`/app/jobs/${row.job_id}`);
  return { ok: true };
}

export async function deleteTrip(id: number): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const { clientId } = auth;

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("mileage_entries")
    .select("id, client_id, job_id")
    .eq("id", Number(id))
    .maybeSingle();
  if (!row || row.client_id !== clientId) return { ok: false, error: "Trip not found." };

  const { error } = await admin.from("mileage_entries").delete().eq("id", row.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/estimator/mileage");
  if (row.job_id) revalidatePath(`/app/jobs/${row.job_id}`);
  return { ok: true };
}

/** Set (or clear) the per-year rate. Never defaulted, never guessed. */
export async function setMileageRate(
  year: number,
  ratePerMile: number | string | null,
): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const { clientId } = auth;

  const y = Number(year);
  if (!Number.isInteger(y) || y < 2000 || y > 2100) {
    return { ok: false, error: "Pick a valid year." };
  }
  const admin = createAdminClient();

  if (ratePerMile === null || ratePerMile === "") {
    await admin.from("mileage_rates").delete().eq("client_id", clientId).eq("year", y);
    revalidatePath("/app/estimator/mileage");
    return { ok: true };
  }
  const rate = Number(ratePerMile);
  if (!Number.isFinite(rate) || rate < 0) {
    return { ok: false, error: "Rate must be 0 or more." };
  }
  const { error } = await admin
    .from("mileage_rates")
    .upsert(
      { client_id: clientId, year: y, rate_per_mile: rate, updated_at: new Date().toISOString() },
      { onConflict: "client_id,year" },
    );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/estimator/mileage");
  return { ok: true };
}

/** The origin for proposed trips. Saved distances are NOT recomputed (§5.3). */
export async function setMileageBaseAddress(address: string): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const { clientId } = auth;
  const admin = createAdminClient();
  const { error } = await admin
    .from("pricing_settings")
    .update({ mileage_base_address: address.trim() || null })
    .eq("client_id", clientId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/estimator/mileage");
  return { ok: true };
}

/** Explicit "update saved distance for this property" (§5.3). */
export async function setPropertyDistance(
  propertyId: number,
  miles: number | string,
): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const { clientId } = auth;
  const m = cleanMiles(miles);
  if (m === null) return { ok: false, error: "Miles must be 0 or more." };

  const admin = createAdminClient();
  const { data: prop } = await admin
    .from("properties")
    .select("id, client_id")
    .eq("id", Number(propertyId))
    .maybeSingle();
  if (!prop || prop.client_id !== clientId) return { ok: false, error: "Property not found." };
  const { error } = await admin
    .from("properties")
    .update({ miles_from_base: m })
    .eq("id", prop.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
