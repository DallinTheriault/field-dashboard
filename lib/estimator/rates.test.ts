import { describe, expect, it } from "vitest";
import {
  effectiveSellRate,
  loadedLaborRate,
  monthlyBillableHours,
} from "./rates";

describe("monthlyBillableHours", () => {
  it("computes hours/wk × 52 / 12 × utilization", () => {
    expect(monthlyBillableHours(40, 0.55)).toBeCloseTo(95.3333, 3);
  });

  it("is 0 when no hours are worked", () => {
    expect(monthlyBillableHours(0, 0.55)).toBe(0);
  });
});

describe("loadedLaborRate", () => {
  it("computes (annual/12 + overhead) / billable hours", () => {
    // 60k/yr + $800/mo overhead over 95.333 billable hrs → $60.84/hr
    const mbh = monthlyBillableHours(40, 0.55);
    expect(loadedLaborRate(60000, 800, mbh)).toBeCloseTo(60.8392, 3);
  });

  it("guards divide-by-zero (unset hours → rate 0, not Infinity)", () => {
    expect(loadedLaborRate(60000, 800, 0)).toBe(0);
  });
});

describe("effectiveSellRate", () => {
  it("applies MARGIN math: rate / (1 − margin), not rate × (1 + margin)", () => {
    expect(effectiveSellRate(60, 0.4)).toBeCloseTo(100, 6);
    // markup math would (wrongly) give 84 — make sure we don't
    expect(effectiveSellRate(60, 0.4)).not.toBeCloseTo(84, 0);
  });

  it("guards margin ≥ 100%", () => {
    expect(effectiveSellRate(60, 1)).toBe(0);
  });
});
