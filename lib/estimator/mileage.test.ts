import { describe, it, expect } from "vitest";
import {
  buildRateMap,
  entriesForYear,
  summarizeMileage,
  totalMilesFor,
} from "./mileage";

const entries2026 = [
  { trip_date: "2026-03-04", miles: 12.4 },
  { trip_date: "2026-07-10", miles: 30 },
  { trip_date: "2026-12-31", miles: 7.6 },
];

describe("summarizeMileage", () => {
  it("sums miles and computes dollars when the year's rate is set", () => {
    const rates = buildRateMap([{ year: 2026, rate_per_mile: 0.7 }]);
    const t = summarizeMileage(entries2026, 2026, rates);
    expect(t.miles).toBe(50);
    expect(t.rateSet).toBe(true);
    expect(t.dollars).toBe(35);
  });

  it("NEVER invents a rate — an unset year yields miles only", () => {
    const rates = buildRateMap([{ year: 2025, rate_per_mile: 0.67 }]);
    const t = summarizeMileage(entries2026, 2026, rates);
    expect(t.miles).toBe(50);
    expect(t.rateSet).toBe(false);
    expect(t.rate).toBeNull();
    expect(t.dollars).toBeNull();
  });

  it("uses each year's own rate", () => {
    const rates = buildRateMap([
      { year: 2025, rate_per_mile: 0.67 },
      { year: 2026, rate_per_mile: 0.7 },
    ]);
    const a = summarizeMileage([{ trip_date: "2025-05-01", miles: 100 }], 2025, rates);
    const b = summarizeMileage([{ trip_date: "2026-05-01", miles: 100 }], 2026, rates);
    expect(a.dollars).toBe(67);
    expect(b.dollars).toBe(70);
  });

  it("handles an empty log and string miles", () => {
    const rates = buildRateMap([{ year: 2026, rate_per_mile: 0.7 }]);
    expect(summarizeMileage([], 2026, rates).miles).toBe(0);
    expect(summarizeMileage([], 2026, rates).dollars).toBe(0);
    const t = summarizeMileage([{ trip_date: "2026-01-01", miles: "10.5" }], 2026, rates);
    expect(t.miles).toBe(10.5);
  });

  it("a zero rate is a set rate, not an unset one", () => {
    const rates = buildRateMap([{ year: 2026, rate_per_mile: 0 }]);
    const t = summarizeMileage(entries2026, 2026, rates);
    expect(t.rateSet).toBe(true);
    expect(t.dollars).toBe(0);
  });
});

describe("buildRateMap", () => {
  it("ignores malformed rows rather than guessing", () => {
    const m = buildRateMap([
      { year: 2026, rate_per_mile: 0.7 },
      { year: "bad", rate_per_mile: 1 },
      { year: 2027, rate_per_mile: "nope" },
    ]);
    expect(m.get(2026)).toBe(0.7);
    expect(m.has(2027)).toBe(false);
    expect(m.size).toBe(1);
  });

  it("accepts numeric strings from the DB driver", () => {
    const m = buildRateMap([{ year: "2026", rate_per_mile: "0.70" }]);
    expect(m.get(2026)).toBe(0.7);
  });
});

describe("entriesForYear", () => {
  it("filters by the trip_date calendar year", () => {
    const all = [...entries2026, { trip_date: "2025-12-31", miles: 99 }];
    expect(entriesForYear(all, 2026)).toHaveLength(3);
    expect(entriesForYear(all, 2025)).toHaveLength(1);
  });
});

describe("totalMilesFor", () => {
  it("doubles only when round trip is chosen, and stores the FINAL total", () => {
    expect(totalMilesFor(12.5, true)).toBe(25);
    expect(totalMilesFor(12.5, false)).toBe(12.5);
  });

  it("guards junk input", () => {
    expect(totalMilesFor(-5, true)).toBe(0);
    expect(totalMilesFor(Number.NaN, false)).toBe(0);
  });
});
