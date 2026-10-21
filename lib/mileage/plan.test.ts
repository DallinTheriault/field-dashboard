import { describe, expect, it } from "vitest";
import { addressKey, baseOn, daysBetween, mapsUrl, planDays, rateOn, yearTotals, type JobInfo } from "./plan";

const bases = [
  { id: 1, address: "742 E 620 S, American Fork, UT 84003", effectiveFrom: "2026-01-01" },
  { id: 2, address: "2376 W 12920 S, Riverton, UT 84065", effectiveFrom: "2026-09-27" },
];
const job = (id: number, label: string, address: string | null, startMinute: number | null = null): JobInfo => ({
  id, label, address, propertyId: id * 10, startMinute,
});

describe("baseOn", () => {
  it("uses the old base through Sep 26 and the new one from Sep 27", () => {
    expect(baseOn("2026-09-26", bases)?.id).toBe(1);
    expect(baseOn("2026-09-27", bases)?.id).toBe(2);
    expect(baseOn("2026-12-31", bases)?.id).toBe(2);
  });
  it("has no base before the first one", () => {
    expect(baseOn("2025-12-31", bases)).toBeNull();
  });
});

describe("planDays", () => {
  const jobs = new Map([
    [1, job(1, "J-2026-001 Ann", "1 A St", 13 * 60)],
    [2, job(2, "J-2026-002 Bo", "2 B St", 8 * 60)],
    [3, job(3, "J-2026-003 Cy", null)],
  ]);

  it("one round trip per day on site, even with several hour entries", () => {
    const plans = planDays(
      [{ date: "2026-07-07", jobId: 1 }, { date: "2026-07-07", jobId: 1 }, { date: "2026-07-08", jobId: 1 }],
      jobs,
      bases,
    );
    expect(plans.map((p) => [p.date, p.stops.length])).toEqual([["2026-07-07", 1], ["2026-07-08", 1]]);
    expect(plans[0].purpose).toBe("J-2026-001 Ann");
    expect(plans[0].base?.id).toBe(1);
  });

  it("two jobs on one day are one loop, in start-time order", () => {
    const [p] = planDays([{ date: "2026-10-01", jobId: 1 }, { date: "2026-10-01", jobId: 2 }], jobs, bases);
    expect(p.stops.map((s) => s.job_id)).toEqual([2, 1]); // 8:00 before 13:00
    expect(p.destination).toBe("2 B St → 1 A St");
    expect(p.purpose).toBe("J-2026-002 Bo; J-2026-001 Ann");
    expect(p.base?.id).toBe(2);
  });

  it("a job without a start time goes after timed ones", () => {
    const [p] = planDays([{ date: "2026-10-01", jobId: 3 }, { date: "2026-10-01", jobId: 1 }], jobs, bases);
    expect(p.stops.map((s) => s.job_id)).toEqual([1, 3]);
    expect(p.destination).toBe("1 A St → (no address)");
  });
});

describe("rates and the deduction", () => {
  const periods = [
    { effectiveFrom: "2026-01-01", rate: 0.725 },
    { effectiveFrom: "2026-07-01", rate: 0.76 },
  ];
  it("uses the rate in effect on each trip's date", () => {
    expect(rateOn("2026-06-30", periods)).toBe(0.725);
    expect(rateOn("2026-07-01", periods)).toBe(0.76);
    expect(rateOn("2025-12-31", periods)).toBeNull();
  });
  it("totals miles by month and multiplies each trip by its own rate", () => {
    const t = yearTotals(
      [
        { date: "2026-06-30", miles: 10 },
        { date: "2026-07-01", miles: 10 },
        { date: "2026-07-15", miles: 5.5 },
        { date: "2026-07-20", miles: null },
      ],
      periods,
    );
    expect(t.miles).toBe(25.5);
    expect(t.dollars).toBe(7.25 + 7.6 + 4.18);
    expect(t.months[5]).toEqual({ month: 6, miles: 10, dollars: 7.25 });
    expect(t.months[6]).toEqual({ month: 7, miles: 15.5, dollars: 11.78 });
    expect(t.missing).toBe(1);
  });
  it("rounds the deduction once, on the total, not month by month", () => {
    // 31.4 × .76 = 23.864 and 45.7 × .76 = 34.732: months round to 23.86 + 34.73 = 58.59,
    // the deduction is 58.596 → 58.60.
    const t = yearTotals([{ date: "2026-07-08", miles: 31.4 }, { date: "2026-08-20", miles: 45.7 }], periods);
    expect(t.dollars).toBe(58.6);
    expect(t.months[6].dollars + t.months[7].dollars).toBeCloseTo(58.59, 2);
  });
  it("keeps miles with no rate out of the dollars, and says so", () => {
    const t = yearTotals([{ date: "2025-12-01", miles: 8 }], periods);
    expect(t.dollars).toBe(0);
    expect(t.unpricedMiles).toBe(8);
  });
});

describe("helpers", () => {
  it("links Google Maps directions out and back, through every stop", () => {
    const url = new URL(mapsUrl("Base Rd", ["1 A St", "2 B St"]));
    expect(url.searchParams.get("origin")).toBe("Base Rd");
    expect(url.searchParams.get("destination")).toBe("Base Rd");
    expect(url.searchParams.get("waypoints")).toBe("1 A St|2 B St");
    expect(url.searchParams.get("travelmode")).toBe("driving");
  });
  it("lists the days of a multi-day job", () => {
    expect(daysBetween("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(daysBetween("2026-10-30", null)).toEqual(["2026-10-30"]);
  });
  it("keys addresses so small spelling differences share a lookup", () => {
    expect(addressKey("2376 W 12920 S,  Riverton, UT.")).toBe(addressKey("2376 w 12920 s riverton ut"));
  });
});
