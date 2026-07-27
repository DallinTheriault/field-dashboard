/**
 * Mileage math — pure functions (MILEAGE_SPEC §5.2, §6.1, §6.3).
 *
 * The IRS standard rate changes every year, so the app NEVER ships a baked-in
 * number and never guesses one. A year with no configured rate yields a
 * `rateSet: false` result and the UI shows miles only. Dollars are stated only
 * when the user has entered the rate for that year.
 *
 * Mileage is deliberately NOT part of summarizePnl: standard mileage and
 * actual vehicle costs are alternative deduction methods and must never be
 * summed into one number.
 */

const round2 = (n: number) => Math.round((n + 1e-9) * 100) / 100;
const round1 = (n: number) => Math.round((n + 1e-9) * 10) / 10;

export type MileageEntryLike = {
  trip_date: string;
  miles: number | string;
};

export type MileageRateMap = Map<number, number>;

/** year → rate lookup built from the mileage_rates rows. */
export function buildRateMap(
  rows: Array<{ year: number | string; rate_per_mile: number | string }>,
): MileageRateMap {
  const m = new Map<number, number>();
  for (const r of rows) {
    const y = Number(r.year);
    const rate = Number(r.rate_per_mile);
    if (Number.isInteger(y) && Number.isFinite(rate) && rate >= 0) m.set(y, rate);
  }
  return m;
}

export type MileageTotal =
  | { miles: number; rateSet: true; rate: number; dollars: number }
  | { miles: number; rateSet: false; rate: null; dollars: null };

/**
 * Total miles for a set of entries, and their dollar value ONLY when a rate
 * exists for that year. Never fabricates a rate.
 */
export function summarizeMileage(
  entries: MileageEntryLike[],
  year: number,
  rates: MileageRateMap,
): MileageTotal {
  const miles = round1(
    entries.reduce((s, e) => {
      const n = Number(e.miles);
      return s + (Number.isFinite(n) ? n : 0);
    }, 0),
  );
  const rate = rates.get(year);
  if (rate === undefined) {
    return { miles, rateSet: false, rate: null, dollars: null };
  }
  return { miles, rateSet: true, rate, dollars: round2(miles * rate) };
}

/** Entries whose trip_date falls in the given calendar year. */
export function entriesForYear<T extends MileageEntryLike>(
  entries: T[],
  year: number,
): T[] {
  const prefix = String(year);
  return entries.filter((e) => String(e.trip_date).slice(0, 4) === prefix);
}

/**
 * The round-trip convenience: `miles` is ALWAYS the final total that gets
 * stored and reported — never doubled again downstream. This helper exists
 * only so the entry form can offer "round trip" as a one-way × 2 shortcut.
 */
export function totalMilesFor(oneWayOrTotal: number, roundTrip: boolean): number {
  const n = Number(oneWayOrTotal);
  if (!Number.isFinite(n) || n < 0) return 0;
  return round1(roundTrip ? n * 2 : n);
}

/** The neutral, non-advisory note shown wherever both figures appear (§6.3). */
export const ALTERNATIVE_METHODS_NOTE =
  "These are alternative methods. Your tax preparer will choose one.";
