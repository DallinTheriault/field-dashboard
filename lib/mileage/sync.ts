import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { jobContactName, type JobLocationRow } from "@/lib/jobs/address";
import { drivingMiles, lookupAddress, pointKey, type Point } from "./geo";
import { sharedTurn } from "./throttle";
import { addressKey, planDays, sumMiles, type Base, type DayPlan, type JobInfo, type SiteVisit } from "./plan";

/**
 * Keeps the automatic trips in step with the days on site: one loop per day,
 * from the base in effect that day, through each job, and back. Days on site
 * are the days hours were logged, plus days entered by hand (job_site_days).
 *
 * Only `auto` trips are written. A day whose trip was edited or removed is
 * left alone, and manual trips are never touched. Idempotent: run it after
 * anything that could change a trip (hours, days, a base); the Mileage page
 * runs it too, so a missed hook heals itself.
 *
 * `network: false` uses only what's cached and marks the rest pending, so a
 * page can render without waiting on outside services.
 *
 * With the network, it's one batch: lookups start only before the budget
 * runs out, and each request gives up after 8 s, so a batch ends within
 * budget + 8 s (well inside the server's 60 s limit) whatever the services
 * do. Lookups left over stay pending; the Mileage page runs batches until
 * none are.
 */
export const BATCH_MS = 25_000;

export type SyncResult = {
  inserted: number;
  updated: number;
  deleted: number;
  pending: number;
  failed: number;
  /** Requests the map services answered this batch. None, with trips pending: they're busy, stop for now. */
  lookups: number;
};

type GeoRow = { address_key: string; status: "ok" | "not_found"; lat: number | null; lon: number | null };

export async function syncDayTrips(
  admin: SupabaseClient,
  clientId: number,
  opts: { network: boolean; tz: string; budgetMs?: number },
): Promise<SyncResult> {
  const result: SyncResult = { inserted: 0, updated: 0, deleted: 0, pending: 0, failed: 0, lookups: 0 };
  const deadline = Date.now() + (opts.budgetMs ?? BATCH_MS);
  const online = () => opts.network && Date.now() < deadline;

  const [{ data: hours }, { data: manualDays }, { data: baseRows }, { data: existing }] = await Promise.all([
    admin.from("time_entries").select("job_id, entry_date").eq("client_id", clientId),
    admin.from("job_site_days").select("job_id, day").eq("client_id", clientId),
    admin.from("mileage_bases").select("id, address, effective_from").eq("client_id", clientId),
    admin
      .from("mileage_entries")
      .select("id, trip_date, kind, base_id, start_address, stops, destination, purpose, miles, miles_status, miles_note, job_id")
      .eq("client_id", clientId)
      .in("kind", ["auto", "edited", "removed"]),
  ]);

  const visits: SiteVisit[] = [
    ...(hours ?? []).map((h) => ({ date: String(h.entry_date).slice(0, 10), jobId: Number(h.job_id) })),
    ...(manualDays ?? []).map((d) => ({ date: String(d.day).slice(0, 10), jobId: Number(d.job_id) })),
  ];
  const jobIds = [...new Set(visits.map((v) => v.jobId))];
  const { data: jobRows } = jobIds.length
    ? await admin
        .from("jobs")
        .select("id, client_id, name, job_number, address, property_id, start_datetime, property:properties(address, unit), contact:contacts!jobs_contact_id_fkey(name)")
        .in("id", jobIds)
        .eq("client_id", clientId)
    : { data: [] };

  const jobs = new Map<number, JobInfo>();
  for (const j of (jobRows ?? []) as unknown as Array<
    JobLocationRow & { id: number; job_number: string | null; start_datetime: string | null }
  >) {
    const prop = Array.isArray(j.property) ? j.property[0] : j.property;
    const street = (j.property_id != null ? prop?.address : j.address)?.trim() || null;
    jobs.set(j.id, {
      id: j.id,
      label: [j.job_number, jobContactName(j) ?? `Job #${j.id}`].filter(Boolean).join(" "),
      address: street,
      propertyId: j.property_id ?? null,
      startMinute: j.start_datetime ? minuteOfDay(j.start_datetime, opts.tz) : null,
    });
  }
  const bases: Base[] = (baseRows ?? []).map((b) => ({
    id: Number(b.id),
    address: String(b.address),
    effectiveFrom: String(b.effective_from).slice(0, 10),
  }));
  const plans = planDays(visits, jobs, bases);

  // Points for every address involved, from the cache, then (if allowed) the services.
  const addresses = new Map<string, string>();
  for (const p of plans) {
    if (p.base) addresses.set(addressKey(p.base.address), p.base.address);
    for (const s of p.stops) if (s.address) addresses.set(addressKey(s.address), s.address);
  }
  const geo = new Map<string, GeoRow | "error">();
  if (addresses.size > 0) {
    const { data: cached } = await admin
      .from("geocode_cache")
      .select("address_key, status, lat, lon")
      .eq("client_id", clientId)
      .in("address_key", [...addresses.keys()]);
    for (const g of (cached ?? []) as GeoRow[]) geo.set(g.address_key, g);
  }
  const turn = sharedTurn(admin, deadline);
  if (opts.network) {
    for (const [key, address] of addresses) {
      if (geo.has(key) || !online()) continue;
      const g = await lookupAddress(address, turn);
      if (g.status === "later") continue;
      result.lookups++;
      if (g.status === "error") {
        geo.set(key, "error");
        continue;
      }
      const row = {
        client_id: clientId,
        address_key: key,
        address,
        status: g.status,
        lat: g.status === "ok" ? g.point.lat : null,
        lon: g.status === "ok" ? g.point.lon : null,
        matched_address: g.status === "ok" ? g.matched : null,
        source: g.status === "ok" ? g.source : null,
      };
      await admin.from("geocode_cache").upsert(row, { onConflict: "client_id,address_key" });
      geo.set(key, row as GeoRow);
    }
  }

  const routeCache = new Map<string, number>();
  const { data: routes } = await admin.from("route_cache").select("from_point, to_point, miles").eq("client_id", clientId);
  for (const r of routes ?? []) routeCache.set(`${r.from_point}|${r.to_point}`, Number(r.miles));

  async function leg(a: Point, b: Point): Promise<number | "pending" | "failed"> {
    const from = pointKey(a);
    const to = pointKey(b);
    if (from === to) return 0;
    const hit = routeCache.get(`${from}|${to}`) ?? routeCache.get(`${to}|${from}`);
    if (hit !== undefined) return hit;
    if (!online()) return "pending";
    const r = await drivingMiles(a, b, turn);
    if (r === "later") return "pending";
    result.lookups++;
    if (r === "failed") return "failed";
    routeCache.set(`${from}|${to}`, r.miles);
    await admin
      .from("route_cache")
      .upsert({ client_id: clientId, from_point: from, to_point: to, miles: Math.round(r.miles * 100) / 100, source: r.source }, {
        onConflict: "client_id,from_point,to_point",
      });
    return r.miles;
  }

  const pointOf = (address: string | null): Point | "missing" | "not_found" | "pending" | "error" => {
    if (!address) return "missing";
    const g = geo.get(addressKey(address));
    if (g === "error") return "error";
    if (!g) return "pending";
    if (g.status !== "ok" || g.lat === null || g.lon === null) return "not_found";
    return { lat: g.lat, lon: g.lon };
  };

  async function measure(p: DayPlan): Promise<{ miles: number | null; status: string; note: string | null }> {
    if (!p.base) return { miles: null, status: "no_base", note: "No base address for this date. Add one under Bases." };
    const start = pointOf(p.base.address);
    if (start === "not_found") return { miles: null, status: "no_address", note: `Couldn't find your base on the map: ${p.base.address}` };
    const stops: Point[] = [];
    for (const s of p.stops) {
      const pt = pointOf(s.address);
      if (pt === "missing") return { miles: null, status: "no_address", note: `${s.label} has no address.` };
      if (pt === "not_found") return { miles: null, status: "no_address", note: `Couldn't find this address on the map: ${s.address}` };
      if (pt === "pending" || pt === "error") return pending(pt);
      stops.push(pt);
    }
    if (start === "pending" || start === "error" || start === "missing") return pending(start === "missing" ? "error" : start);
    const path = [start, ...stops, start];
    const legs: number[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const m = await leg(path[i], path[i + 1]);
      if (m === "pending") return pending("pending");
      if (m === "failed") return pending("error");
      legs.push(m);
    }
    return { miles: sumMiles(legs), status: "ok", note: null };
  }
  function pending(kind: "pending" | "error") {
    return kind === "pending"
      ? { miles: null, status: "pending", note: null }
      : { miles: null, status: "route_failed", note: "Couldn't calculate miles, try again later." };
  }

  const byDate = new Map((existing ?? []).map((e) => [String(e.trip_date).slice(0, 10), e]));
  const planned = new Set<string>();
  const now = new Date().toISOString();
  for (const p of plans) {
    planned.add(p.date);
    const have = byDate.get(p.date);
    if (have && have.kind !== "auto") continue; // edited or removed: never recalculated
    const m = await measure(p);
    // Without the network, a day that hasn't changed keeps its last result
    // (a failed lookup stays failed until someone tries again).
    const sameDay =
      !!have &&
      have.base_id === (p.base?.id ?? null) &&
      have.start_address === (p.base?.address ?? null) &&
      canon(have.stops) === canon(p.stops) &&
      have.purpose === p.purpose &&
      have.destination === p.destination;
    if (m.status === "pending" && !opts.network && sameDay && have.miles_status !== "pending") continue;
    if (m.status === "pending") result.pending++;
    if (m.status === "route_failed") result.failed++;
    const row = {
      trip_date: p.date,
      kind: "auto",
      source: "proposed",
      job_id: p.stops[0]?.job_id ?? null,
      base_id: p.base?.id ?? null,
      start_address: p.base?.address ?? null,
      stops: p.stops,
      destination: p.destination,
      purpose: p.purpose,
      miles: m.miles,
      miles_status: m.status,
      miles_note: m.note,
      round_trip: true,
    };
    if (!have) {
      const { error } = await admin.from("mileage_entries").insert({ client_id: clientId, ...row, calculated_at: now });
      if (!error) {
        result.inserted++;
        continue;
      }
      if (error.code !== "23505") {
        console.error("[mileage] insert trip failed", p.date, error.message);
        continue;
      }
      // Another sync made the day's trip first: bring it up to date, if it's
      // still automatic.
      const { error: uErr } = await admin
        .from("mileage_entries")
        .update({ ...row, calculated_at: now })
        .eq("client_id", clientId)
        .eq("trip_date", p.date)
        .eq("kind", "auto");
      if (uErr) console.error("[mileage] update trip failed", p.date, uErr.message);
      else result.updated++;
      continue;
    }
    // Only write when something changed (a failed route was retried above).
    const same =
      have.base_id === row.base_id &&
      have.start_address === row.start_address &&
      canon(have.stops) === canon(row.stops) &&
      have.destination === row.destination &&
      have.purpose === row.purpose &&
      (have.miles === null ? null : Number(have.miles)) === row.miles &&
      have.miles_status === row.miles_status &&
      have.job_id === row.job_id;
    if (same) continue;
    const { error } = await admin.from("mileage_entries").update({ ...row, calculated_at: now }).eq("id", have.id);
    if (error) console.error("[mileage] update trip failed", p.date, error.message);
    else result.updated++;
  }

  // Automatic trips for days no longer on site go away; edited ones stay.
  const gone = (existing ?? []).filter((e) => e.kind === "auto" && !planned.has(String(e.trip_date).slice(0, 10)));
  if (gone.length > 0) {
    await admin.from("mileage_entries").delete().in("id", gone.map((e) => e.id));
    result.deleted = gone.length;
  }
  return result;
}

/** JSON with object keys sorted: jsonb hands keys back in its own order. */
function canon(v: unknown): string {
  return JSON.stringify(v, (_k, x) =>
    x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x,
  );
}

/** Minutes after midnight, in the tenant's time zone. */
function minuteOfDay(iso: string, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(iso));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}
