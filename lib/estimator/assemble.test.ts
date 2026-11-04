import { describe, expect, it } from "vitest";
import {
  buildEngineSettings,
  buildSavePayload,
  missingRate,
  priceEstimate,
  toEngineLine,
  type EstimatorBundle,
  type RawLine,
} from "./assemble";

/** The same four numbers as Business › Pricing: $110 general, $125 skilled. */
const BUNDLE: EstimatorBundle = {
  settings: {
    default_hourly_rate: 110,
    skilled_hourly_rate: 125,
    material_markup_pct: 0,
    minimum_job_charge: 150,
  },
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
      rate_type: "general",
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
      rate_type: "skilled",
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
  it("prices from Business › Pricing: no hidden margin or rounding", () => {
    const s = buildEngineSettings(BUNDLE);
    expect(s.loadedLaborRate).toBe(110);
    expect(s.marginPct).toBe(0);
    expect(s.roundingIncrement).toBe(0);
    expect(s.minimumJobCharge).toBe(150);
  });
});

describe("pricing at Field's rates", () => {
  it("Job 14's estimate: 2 hr of ad-hoc labor sells at the $110 general rate, not ~$116", () => {
    const line: RawLine = { ...adHoc, description: "Light prep and Touch Up Paint", qty: 1, hoursPerUnit: 2 };
    const priced = priceEstimate([line], BUNDLE);
    expect(priced.result.price).toBe(220);
    expect(priced.rows[0].amount).toBe(220);
  });

  it("a skilled catalog task sells at the skilled rate", () => {
    const toilet: RawLine = { ...adHoc, serviceId: 11, description: "Toilet swap", qty: 1, hoursPerUnit: null };
    // 1.5 hr × $125 = $187.50
    expect(priceEstimate([toilet], BUNDLE).result.price).toBe(187.5);
  });

  it("the minimum job charge still applies, to the cent", () => {
    const small: RawLine = { ...adHoc, qty: 1, hoursPerUnit: 0.5 };
    expect(priceEstimate([small], BUNDLE).result.price).toBe(150);
  });

  it("materials and marked-up parts take the material markup; at-cost parts don't", () => {
    const marked: EstimatorBundle = { ...BUNDLE, settings: { ...BUNDLE.settings!, material_markup_pct: 0.2, minimum_job_charge: 0 } };
    const part = (markup: boolean): RawLine => ({
      ...adHoc,
      qty: 1,
      hoursPerUnit: null,
      isHardware: true,
      unitPrice: 100,
      hardwareMarkup: markup,
    });
    expect(priceEstimate([part(true)], marked).result.price).toBe(120);
    expect(priceEstimate([part(false)], marked).result.price).toBe(100);
  });

  it("says which rate is missing instead of pricing labor at $0", () => {
    const noSkilled: EstimatorBundle = { ...BUNDLE, settings: { ...BUNDLE.settings!, skilled_hourly_rate: null } };
    const toilet: RawLine = { ...adHoc, serviceId: 11, qty: 1, hoursPerUnit: null };
    expect(missingRate([adHoc], noSkilled)).toBeNull();
    expect(missingRate([toilet], noSkilled)).toMatch(/skilled hourly rate/);
    expect(missingRate([adHoc], { ...BUNDLE, settings: null })).toMatch(/general hourly rate/);
    const part: RawLine = { ...adHoc, isHardware: true, unitPrice: 10 };
    expect(missingRate([part], { ...BUNDLE, settings: null })).toBeNull();
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
    const priced = priceEstimate(rawLines, bundle);
    return buildSavePayload({
      clientId: 1,
      jobId: 99,
      billingEntityId: null,
      notes: null,
      overridePrice: null,
      overrideReason: null,
      rawLines,
      priced,
    });
  }

  it("freezes every pricing input into the payload", () => {
    const p = snapshot(BUNDLE);
    expect(p.estimate.resolved_loaded_rate).toBe(110);
    expect(p.estimate.resolved_margin_pct).toBe(0);
    expect(p.estimate.resolved_rounding_increment).toBe(0);
    // Estimates never carry a travel fee (mileage is never billed).
    expect(p.estimate.resolved_travel_fee).toBe(0);
    expect(p.estimate.travel_zone_id).toBeNull();
    expect(p.lines).toHaveLength(2);
    // Catalog line froze the service's hours/unit and prep multiplier
    expect(p.lines[0].resolved_hours_per_unit).toBeCloseTo(0.01, 9);
    expect(p.lines[0].resolved_prep_multiplier).toBeCloseTo(1.6, 9);
    // Each line froze the rate its hours sold at
    expect(p.lines[0].resolved_loaded_rate).toBe(110);
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
    // No travel row: the line amounts alone make the price.
    const priced = priceEstimate(rawLines, BUNDLE);
    expect(priced.rows.some((r) => r.kind === "travel")).toBe(false);
    expect(rowSum).toBeCloseTo(p.estimate.computed_price, 2);
  });

  it("carries the optional task link without touching pricing", () => {
    const linked: RawLine[] = [
      { ...rawLines[0], taskId: 7 },
      { ...rawLines[1], taskId: null },
    ];
    const priced = priceEstimate(linked, BUNDLE);
    const p = buildSavePayload({
      clientId: 1,
      jobId: 99,
      billingEntityId: null,
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
    // Settings edit: raise the general rate.
    const mutated: EstimatorBundle = {
      ...BUNDLE,
      settings: { ...BUNDLE.settings!, default_hourly_rate: 140 },
    };
    const after = snapshot(mutated);
    expect(after.estimate.computed_price).not.toBe(before.estimate.computed_price);
    // The earlier payload is untouched by the bundle mutation.
    expect(before.estimate.resolved_loaded_rate).toBe(110);
  });
});
