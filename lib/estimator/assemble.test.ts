import { describe, expect, it } from "vitest";
import {
  buildEngineSettings,
  buildSavePayload,
  priceEstimate,
  toEngineLine,
  type EstimatorBundle,
  type RawLine,
} from "./assemble";

/** Synthetic settings: $120k pay, 40 hr/wk, 75% util, $1,000/mo overhead. */
const BUNDLE: EstimatorBundle = {
  settings: {
    desired_annual_owner_pay: 120000,
    hours_worked_per_week: 40,
    utilization_pct: 0.75,
    margin_pct: 0.4,
    material_markup_pct: 0,
    minimum_job_charge: 150,
    rounding_increment: 5,
  },
  monthlyOverhead: 1000,
  services: [
    {
      id: 10,
      name: "Walls — 2 coats",
      type: "MEASURED",
      unit: "sqft",
      labor_hours_per_unit: 0.01,
      flat_labor_hours: null,
      is_placeholder: false,
      active: true,
    },
    {
      id: 11,
      name: "Toilet swap",
      type: "TASK",
      unit: null,
      labor_hours_per_unit: null,
      flat_labor_hours: 1.5,
      is_placeholder: false,
      active: true,
    },
  ],
  materials: [
    {
      id: 20,
      name: "Interior paint",
      unit: "gal",
      unit_cost: 38,
      coverage_sqft_per_unit: 350,
      purchasable_unit_size: 1,
      active: true,
    },
  ],
  links: [
    {
      id: 30,
      service_id: 10,
      material_id: 20,
      basis: "COVERAGE",
      coats: 2,
      qty_per_unit: null,
      flat_qty: null,
    },
  ],
  modifiers: [
    {
      id: 40,
      name: "Prep — Heavy",
      scope: "LINE",
      math: "MULTIPLIER",
      value: 1.6,
      active: true,
    },
  ],
  zones: [
    { id: 50, label: "15–30 mi", flat_fee: 35, active: true },
  ],
  entities: [],
};

const adHoc: RawLine = {
  key: "a",
  serviceId: null,
  description: "Junk removal",
  type: "TASK",
  qty: 2,
  unit: null,
  hoursPerUnit: 1,
  prepModifierId: null,
};

describe("buildEngineSettings", () => {
  it("derives the loaded rate from pay + overhead + billable hours", () => {
    const s = buildEngineSettings(BUNDLE);
    // (120000/12 + 1000) / (40 × 52/12 × 0.75 = 130) = 11000/130
    expect(s.loadedLaborRate).toBeCloseTo(84.61538461538461, 10);
    expect(s.marginPct).toBe(0.4);
  });
});

describe("toEngineLine", () => {
  it("resolves catalog MEASURED lines with linked materials and prep", () => {
    const line = toEngineLine(
      {
        key: "w",
        serviceId: 10,
        description: "Walls — 2 coats",
        type: "MEASURED",
        qty: 500,
        unit: "sqft",
        hoursPerUnit: null,
        prepModifierId: 40,
      },
      0,
      BUNDLE,
    );
    expect(line.type).toBe("MEASURED");
    expect(line.laborHoursPerUnit).toBe(0.01);
    expect(line.prepMultiplier).toBe(1.6);
    expect(line.materials).toHaveLength(1);
    expect(line.materials[0].coats).toBe(2);
    expect(line.materials[0].unitCost).toBe(38);
  });

  it("treats ad-hoc lines as first-class TASK lines", () => {
    const line = toEngineLine(adHoc, 0, BUNDLE);
    expect(line.type).toBe("TASK");
    expect(line.flatLaborHours).toBe(1);
    expect(line.qty).toBe(2);
    expect(line.materials).toHaveLength(0);
  });
});

describe("buildSavePayload (Snapshot Rule)", () => {
  const rawLines: RawLine[] = [
    {
      key: "w",
      serviceId: 10,
      description: "Walls — 2 coats",
      type: "MEASURED",
      qty: 500,
      unit: "sqft",
      hoursPerUnit: null,
      prepModifierId: 40,
    },
    adHoc,
  ];

  function snapshot(bundle: EstimatorBundle) {
    const priced = priceEstimate(rawLines, 50, bundle);
    return buildSavePayload({
      clientId: 1,
      jobId: 99,
      billingEntityId: null,
      travelZoneId: 50,
      notes: null,
      overridePrice: null,
      overrideReason: null,
      rawLines,
      priced,
    });
  }

  it("freezes every pricing input into the payload", () => {
    const p = snapshot(BUNDLE);
    expect(p.estimate.resolved_loaded_rate).toBeCloseTo(84.6154, 3);
    expect(p.estimate.resolved_margin_pct).toBe(0.4);
    expect(p.estimate.resolved_travel_fee).toBe(35);
    expect(p.lines).toHaveLength(2);
    // Catalog line froze the service's hours/unit and prep multiplier
    expect(p.lines[0].resolved_hours_per_unit).toBeCloseTo(0.01, 9);
    expect(p.lines[0].resolved_prep_multiplier).toBeCloseTo(1.6, 9);
    // Ad-hoc line froze its manual hours
    expect(p.lines[1].resolved_hours_per_unit).toBe(1);
    expect(p.lines[1].resolved_labor_hours).toBe(2);
    // Paint: 500×2/350 = 2.857 → 3 gal frozen with cost
    expect(p.materials).toHaveLength(1);
    expect(p.materials[0].qty).toBe(3);
    expect(p.materials[0].resolved_total).toBe(114);
    expect(p.materials[0].line_index).toBe(0);
  });

  it("client amounts sum exactly to the computed price", () => {
    const p = snapshot(BUNDLE);
    const rowSum = p.lines.reduce(
      (s, l) => s + l.resolved_client_amount,
      0,
    );
    // Lines + travel row = price; travel is its own client row, so
    // line amounts sum to price minus the travel row.
    const priced = priceEstimate(rawLines, 50, BUNDLE);
    const travelRow = priced.rows.find((r) => r.kind === "travel");
    expect(rowSum + (travelRow?.amount ?? 0)).toBeCloseTo(
      p.estimate.computed_price,
      2,
    );
  });

  it("carries the optional task link without touching pricing", () => {
    const linked: RawLine[] = [
      { ...rawLines[0], taskId: 7 },
      { ...rawLines[1], taskId: null },
    ];
    const priced = priceEstimate(linked, 50, BUNDLE);
    const p = buildSavePayload({
      clientId: 1,
      jobId: 99,
      billingEntityId: null,
      travelZoneId: 50,
      notes: null,
      overridePrice: null,
      overrideReason: null,
      rawLines: linked,
      priced,
    });
    expect(p.lines[0].task_id).toBe(7);
    expect(p.lines[1].task_id).toBeNull();
    // Pricing is byte-identical with or without links.
    const unlinked = snapshot(BUNDLE);
    expect(p.estimate.computed_price).toBe(unlinked.estimate.computed_price);
    expect(p.lines[0].resolved_client_amount).toBe(
      unlinked.lines[0].resolved_client_amount,
    );
  });

  it("settings changes change NEW payloads only — a frozen payload is inert data", () => {
    const before = snapshot(BUNDLE);
    // Hostile settings edit: double the pay target, gut the margin.
    const mutated: EstimatorBundle = {
      ...BUNDLE,
      settings: { ...BUNDLE.settings!, desired_annual_owner_pay: 240000, margin_pct: 0.1 },
      monthlyOverhead: 4000,
    };
    const after = snapshot(mutated);
    expect(after.estimate.computed_price).not.toBe(before.estimate.computed_price);
    // The earlier payload is untouched by the bundle mutation.
    expect(before.estimate.resolved_loaded_rate).toBeCloseTo(84.6154, 3);
  });
});
