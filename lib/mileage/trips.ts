import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RatePeriod, Stop } from "./plan";

export type TripKind = "auto" | "edited" | "removed" | "manual";
export type MilesStatus = "ok" | "pending" | "no_base" | "no_address" | "route_failed";

export type TripRecord = {
  id: number;
  date: string;
  kind: TripKind;
  startAddress: string | null;
  destination: string;
  purpose: string;
  miles: number | null;
  status: MilesStatus | null;
  note: string | null;
  stops: Stop[];
  jobId: number | null;
};

const COLS = "id, trip_date, kind, start_address, destination, purpose, miles, miles_status, miles_note, stops, job_id";

/** The year's trips, oldest first. Removed ones only when asked for. */
export async function loadTrips(
  supabase: SupabaseClient,
  year: number,
  opts: { includeRemoved?: boolean } = {},
): Promise<TripRecord[]> {
  let q = supabase
    .from("mileage_entries")
    .select(COLS)
    .gte("trip_date", `${year}-01-01`)
    .lte("trip_date", `${year}-12-31`)
    .order("trip_date", { ascending: true })
    .order("id", { ascending: true });
  if (!opts.includeRemoved) q = q.neq("kind", "removed");
  const { data } = await q;
  return (data ?? []).map((t) => ({
    id: Number(t.id),
    date: String(t.trip_date).slice(0, 10),
    kind: t.kind as TripKind,
    startAddress: (t.start_address as string | null) ?? null,
    destination: String(t.destination),
    purpose: String(t.purpose),
    miles: t.miles === null ? null : Number(t.miles),
    status: (t.miles_status as MilesStatus | null) ?? null,
    note: (t.miles_note as string | null) ?? null,
    stops: (t.stops as Stop[] | null) ?? [],
    jobId: (t.job_id as number | null) ?? null,
  }));
}

export async function loadRatePeriods(supabase: SupabaseClient): Promise<Array<RatePeriod & { note: string | null }>> {
  const { data } = await supabase
    .from("mileage_rate_periods")
    .select("effective_from, rate_per_mile, note")
    .order("effective_from", { ascending: true });
  return (data ?? []).map((r) => ({
    effectiveFrom: String(r.effective_from).slice(0, 10),
    rate: Number(r.rate_per_mile),
    note: (r.note as string | null) ?? null,
  }));
}

export type BaseRecord = { id: number; address: string; effectiveFrom: string };

export async function loadBases(supabase: SupabaseClient): Promise<BaseRecord[]> {
  const { data } = await supabase
    .from("mileage_bases")
    .select("id, address, effective_from")
    .order("effective_from", { ascending: true });
  return (data ?? []).map((b) => ({ id: Number(b.id), address: String(b.address), effectiveFrom: String(b.effective_from).slice(0, 10) }));
}
