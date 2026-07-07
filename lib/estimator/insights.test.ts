import { describe, expect, it } from "vitest";
import {
  catalogVariance,
  isApplyWorthy,
  jobVariance,
  type VarianceServiceRow,
} from "./insights";

const SERVICES: VarianceServiceRow[] = [
  {
    id: 1,
    name: "Patch — medium",
    type: "TASK",
    unit: null,
    labor_hours_per_unit: null,
    flat_labor_hours: 1.25,
  },
  {
    id: 2,
    name: "Walls — 2 coats",
    type: "MEASURED",
    unit: "sqft",
    labor_hours_per_unit: 0.01,
    flat_labor_hours: null,
  },
];

describe("jobVariance", () => {
  const estimate = {
    id: 1,
    job_id: 9,
    computed_cost: 1000,
    resolved_loaded_rate: 100,
    resolved_travel_fee: 50,
  };
  const lines = [
    { service_id: 1, resolved_labor_hours: 4, resolved_labor_cost: 400 },
    { service_id: null, resolved_labor_hours: 4, resolved_labor_cost: 400 },
  ];

  it("compares frozen estimates against logged actuals", () => {
    const v = jobVariance(estimate, lines, 10, 200);
    expect(v.estHours).toBe(8);
    expect(v.actualHours).toBe(10);
    expect(v.hoursVariancePct).toBeCloseTo(0.25, 6);
    // est materials = 1000 − 800 labor − 50 travel = 150
    expect(v.estMaterialCost).toBe(150);
    expect(v.actualMaterialCost).toBe(200);
    // actual cost = 10 h × frozen $100 + 200 + 50 travel
    expect(v.actualCost).toBe(1250);
    expect(v.costVariancePct).toBeCloseTo(0.25, 6);
    expect(v.hasActuals).toBe(true);
  });

  it("null variance when nothing was estimated (no divide-by-zero)", () => {
    const v = jobVariance(
      { ...estimate, computed_cost: 0, resolved_travel_fee: 0 },
      [],
      2,
      0,
    );
    expect(v.hoursVariancePct).toBeNull();
    expect(v.costVariancePct).toBeNull();
  });
});

describe("catalogVariance (attribution by estimated share)", () => {
  it("attributes job hours to lines proportionally to estimated share", () => {
    // Job: patch 1.25h est + walls 3.75h est = 5h est; 6h actually logged.
    // Patch share 25% → 1.5h attributed (ratio 1.2); walls 75% → 4.5h (1.2).
    const rows = catalogVariance(SERVICES, [
      {
        jobId: 1,
        actualHours: 6,
        lines: [
          { service_id: 1, resolved_labor_hours: 1.25, resolved_labor_cost: 0 },
          { service_id: 2, resolved_labor_hours: 3.75, resolved_labor_cost: 0 },
        ],
      },
    ]);
    const patch = rows.find((r) => r.service.id === 1)!;
    expect(patch.attributedActualHours).toBeCloseTo(1.5, 2);
    expect(patch.ratio).toBeCloseTo(1.2, 6);
    expect(patch.suggestedRate).toBeCloseTo(1.5, 2); // 1.25 × 1.2
    const walls = rows.find((r) => r.service.id === 2)!;
    expect(walls.suggestedRate).toBeCloseTo(0.012, 4); // 0.01 × 1.2
  });

  it("ad-hoc lines never teach the catalog", () => {
    const rows = catalogVariance(SERVICES, [
      {
        jobId: 1,
        actualHours: 10,
        lines: [
          { service_id: null, resolved_labor_hours: 5, resolved_labor_cost: 0 },
        ],
      },
    ]);
    expect(rows).toHaveLength(0);
  });

  it("aggregates across jobs and sorts biggest misses first", () => {
    const rows = catalogVariance(SERVICES, [
      {
        jobId: 1,
        actualHours: 2.5, // patch runs 2× over
        lines: [
          { service_id: 1, resolved_labor_hours: 1.25, resolved_labor_cost: 0 },
        ],
      },
      {
        jobId: 2,
        actualHours: 4.4, // walls run 1.1× over
        lines: [
          { service_id: 2, resolved_labor_hours: 4, resolved_labor_cost: 0 },
        ],
      },
      {
        jobId: 3,
        actualHours: 1.25, // patch exactly on estimate
        lines: [
          { service_id: 1, resolved_labor_hours: 1.25, resolved_labor_cost: 0 },
        ],
      },
    ]);
    expect(rows[0].service.id).toBe(1); // |1.5−1| > |1.1−1|
    const patch = rows[0];
    expect(patch.jobCount).toBe(2);
    // (2.5 + 1.25) / (1.25 + 1.25) = 1.5
    expect(patch.ratio).toBeCloseTo(1.5, 6);
  });

  it("jobs without logged hours or estimates are skipped", () => {
    const rows = catalogVariance(SERVICES, [
      { jobId: 1, actualHours: 0, lines: [{ service_id: 1, resolved_labor_hours: 2, resolved_labor_cost: 0 }] },
      { jobId: 2, actualHours: 3, lines: [] },
    ]);
    expect(rows).toHaveLength(0);
  });
});

describe("isApplyWorthy", () => {
  it("suggests applying only at |variance| ≥ 10%", () => {
    const base = {
      service: SERVICES[0],
      jobCount: 3,
      estHours: 10,
      attributedActualHours: 11,
      currentRate: 1.25,
      suggestedRate: 1.38,
    };
    expect(isApplyWorthy({ ...base, ratio: 1.09 })).toBe(false);
    expect(isApplyWorthy({ ...base, ratio: 1.1 })).toBe(true);
    expect(isApplyWorthy({ ...base, ratio: 0.85 })).toBe(true);
  });
});
