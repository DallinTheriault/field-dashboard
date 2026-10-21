/**
 * Mileage, the pure part: which trips the days on site make, which base and
 * rate apply on a date, and the deduction. No database, no network; the sync
 * (lib/mileage/sync.ts) feeds it and stores what it returns.
 *
 * Mileage is for taxes only. Nothing here is ever billed.
 */

const round1 = (n: number) => Math.round((n + 1e-9) * 10) / 10;
const round2 = (n: number) => Math.round((n + 1e-9) * 100) / 100;

export type SiteVisit = { date: string; jobId: number };

export type JobInfo = {
  id: number;
  /** "J-2026-012 Pat Rivera": job number and name, for the trip's purpose. */
  label: string;
  /** Street address to drive to (no unit). */
  address: string | null;
  propertyId: number | null;
  /** Minutes after midnight the job starts (tenant time); null = no time. */
  startMinute: number | null;
};

export type Base = { id: number; address: string; effectiveFrom: string };

export type Stop = { job_id: number; property_id: number | null; address: string | null; label: string };

export type DayPlan = {
  date: string;
  base: Base | null;
  stops: Stop[];
  purpose: string;
  destination: string;
};

/** The base in effect on a date: the latest one that started on or before it. */
export function baseOn(date: string, bases: Base[]): Base | null {
  let best: Base | null = null;
  for (const b of bases) {
    if (b.effectiveFrom <= date && (!best || b.effectiveFrom > best.effectiveFrom)) best = b;
  }
  return best;
}

/**
 * One round trip per day on site. Two or more jobs on the same day are one
 * loop: base, each job in start-time order, back to base.
 */
export function planDays(visits: SiteVisit[], jobs: Map<number, JobInfo>, bases: Base[]): DayPlan[] {
  const byDate = new Map<string, Set<number>>();
  for (const v of visits) {
    if (!jobs.has(v.jobId)) continue;
    const set = byDate.get(v.date) ?? new Set<number>();
    set.add(v.jobId);
    byDate.set(v.date, set);
  }
  const plans: DayPlan[] = [];
  for (const [date, ids] of [...byDate].sort(([a], [b]) => a.localeCompare(b))) {
    const ordered = [...ids]
      .map((id) => jobs.get(id)!)
      .sort((a, b) => (a.startMinute ?? 1e9) - (b.startMinute ?? 1e9) || a.id - b.id);
    const stops: Stop[] = ordered.map((j) => ({
      job_id: j.id,
      property_id: j.propertyId,
      address: j.address,
      label: j.label,
    }));
    plans.push({
      date,
      base: baseOn(date, bases),
      stops,
      purpose: stops.map((s) => s.label).join("; "),
      destination: stops.map((s) => s.address ?? "(no address)").join(" → "),
    });
  }
  return plans;
}

export type RatePeriod = { effectiveFrom: string; rate: number };

/** The rate for a trip's date, or null when none had started yet. */
export function rateOn(date: string, periods: RatePeriod[]): number | null {
  let best: RatePeriod | null = null;
  for (const p of periods) {
    if (p.effectiveFrom <= date && (!best || p.effectiveFrom > best.effectiveFrom)) best = p;
  }
  return best ? best.rate : null;
}

export type TripMiles = { date: string; miles: number | null };

export type MonthTotal = { month: number; miles: number; dollars: number };

export type YearTotal = {
  miles: number;
  dollars: number;
  /** Trips with miles but no rate on their date (not in dollars). */
  unpricedMiles: number;
  /** Trips still missing miles. */
  missing: number;
  months: MonthTotal[];
};

/** Miles by month, the year total, and the deduction: miles × the rate on each trip's date. */
export function yearTotals(trips: TripMiles[], periods: RatePeriod[]): YearTotal {
  const months: MonthTotal[] = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, miles: 0, dollars: 0 }));
  let unpriced = 0;
  let missing = 0;
  // The deduction is rounded once, on the total; months are rounded for show.
  let exact = 0;
  for (const t of trips) {
    if (t.miles === null || !Number.isFinite(t.miles)) {
      missing++;
      continue;
    }
    const m = months[Number(t.date.slice(5, 7)) - 1];
    if (!m) continue;
    m.miles += t.miles;
    const rate = rateOn(t.date, periods);
    if (rate === null) unpriced += t.miles;
    else {
      m.dollars += t.miles * rate;
      exact += t.miles * rate;
    }
  }
  for (const m of months) {
    m.miles = round1(m.miles);
    m.dollars = round2(m.dollars);
  }
  return {
    miles: round1(months.reduce((s, m) => s + m.miles, 0)),
    dollars: round2(exact),
    unpricedMiles: round1(unpriced),
    missing,
    months,
  };
}

/** A Google Maps driving-directions link to check a trip: start, the stops, back to start. */
export function mapsUrl(start: string, stops: string[], roundTrip = true): string {
  const q = new URLSearchParams({ api: "1", origin: start, travelmode: "driving" });
  if (roundTrip) {
    q.set("destination", start);
    if (stops.length > 0) q.set("waypoints", stops.join("|"));
  } else {
    q.set("destination", stops[stops.length - 1] ?? start);
    if (stops.length > 1) q.set("waypoints", stops.slice(0, -1).join("|"));
  }
  return `https://www.google.com/maps/dir/?${q.toString()}`;
}

/** Every date from start to end (inclusive), YYYY-MM-DD, at most `cap` days. */
export function daysBetween(start: string, end: string | null, cap = 31): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T12:00:00Z`);
  const last = end && end >= start ? end : start;
  while (out.length < cap) {
    const key = d.toISOString().slice(0, 10);
    out.push(key);
    if (key >= last) break;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Cache key for an address: lowercase, single spaces, no trailing punctuation. */
export function addressKey(address: string): string {
  return address.toLowerCase().replace(/[.,]+/g, " ").replace(/\s+/g, " ").trim();
}

export function sumMiles(legs: number[]): number {
  return round1(legs.reduce((s, n) => s + n, 0));
}
