import { describe, expect, it } from "vitest";
import {
  allocateClientRows,
  priceJob,
  priceLine,
  priceMaterial,
  roundUpTo,
  type EngineSettings,
} from "./engine";

/** Loaded rate $100/hr, 40% margin, $150 min, $5 rounding — easy mental math. */
const S: EngineSettings = {
  loadedLaborRate: 100,
  marginPct: 0.4,
  materialMarkupPct: 0,
  minimumJobCharge: 150,
  roundingIncrement: 5,
};

describe("roundUpTo", () => {
  it("rounds up to the increment", () => {
    expect(roundUpTo(1001, 5)).toBe(1005);
    expect(roundUpTo(1004.01, 5)).toBe(1005);
  });
  it("leaves exact multiples alone (float-safe)", () => {
    expect(roundUpTo(1000, 5)).toBe(1000);
    expect(roundUpTo(0.3 * 10, 1)).toBe(3); // 2.9999999999999996 → 3
  });
});

describe("MEASURED lines", () => {
  it("base_hours = qty × hr/unit; labor = hours × loaded rate", () => {
    const r = priceLine(
      { type: "MEASURED", qty: 400, laborHoursPerUnit: 0.01, materials: [] },
      S,
    );
    expect(r.baseHours).toBeCloseTo(4);
    expect(r.laborHours).toBeCloseTo(4);
    expect(r.laborCost).toBe(400);
    expect(r.lineCost).toBe(400);
  });
});

describe("TASK lines", () => {
  it("base_hours = flat hours (qty 1 = exact spec formula)", () => {
    const r = priceLine(
      { type: "TASK", qty: 1, flatLaborHours: 1.5, materials: [] },
      S,
    );
    expect(r.laborHours).toBeCloseTo(1.5);
    expect(r.laborCost).toBe(150);
  });
  it("qty repeats the task (2 × toilet swap)", () => {
    const r = priceLine(
      { type: "TASK", qty: 2, flatLaborHours: 1.5, materials: [] },
      S,
    );
    expect(r.laborCost).toBe(300);
  });
});

describe("prep multipliers", () => {
  it("multiply labor hours ONLY — materials untouched", () => {
    const r = priceLine(
      {
        type: "MEASURED",
        qty: 350,
        laborHoursPerUnit: 0.01,
        prepMultiplier: 1.6,
        materials: [
          { basis: "COVERAGE", coats: 1, coverageSqftPerUnit: 350, unitCost: 38 },
        ],
      },
      S,
    );
    expect(r.laborHours).toBeCloseTo(3.5 * 1.6);
    expect(r.laborCost).toBe(560);
    // 350 sqft × 1 coat / 350 coverage = exactly 1 gal — prep didn't touch it
    expect(r.materials[0].unitsPurchased).toBe(1);
    expect(r.materialCost).toBe(38);
  });
});

describe("material consumption", () => {
  it("gallon round-up: ceil(qty × coats / coverage)", () => {
    // 500 sqft × 2 coats / 350 = 2.857 → 3 gallons, never 2.857
    const m = priceMaterial(
      { basis: "COVERAGE", coats: 2, coverageSqftPerUnit: 350, unitCost: 38 },
      500,
      "MEASURED",
    );
    expect(m.unitsRaw).toBeCloseTo(2.857, 2);
    expect(m.unitsPurchased).toBe(3);
    expect(m.total).toBe(114);
  });

  it("respects purchasable unit size (5-gal buckets)", () => {
    const m = priceMaterial(
      { basis: "COVERAGE", coats: 2, coverageSqftPerUnit: 350, unitCost: 30, purchasableUnitSize: 5 },
      1200,
      "MEASURED",
    );
    // 1200×2/350 = 6.857 → next multiple of 5 = 10
    expect(m.unitsPurchased).toBe(10);
    expect(m.total).toBe(300);
  });

  it("PER_UNIT: qty × per-unit, rounded up to purchase step", () => {
    const m = priceMaterial(
      { basis: "PER_UNIT", qtyPerUnit: 0.3, unitCost: 8, purchasableUnitSize: 1 },
      10,
      "MEASURED",
    );
    expect(m.unitsRaw).toBeCloseTo(3);
    expect(m.unitsPurchased).toBe(3);
  });

  it("FLAT repeats with TASK count but not with MEASURED qty", () => {
    const task = priceMaterial({ basis: "FLAT", flatQty: 1, unitCost: 12 }, 3, "TASK");
    expect(task.unitsPurchased).toBe(3);
    const measured = priceMaterial({ basis: "FLAT", flatQty: 1, unitCost: 12 }, 500, "MEASURED");
    expect(measured.unitsPurchased).toBe(1);
  });

  it("zero-consumption material costs nothing", () => {
    const m = priceMaterial({ basis: "COVERAGE", coats: 2, coverageSqftPerUnit: 0, unitCost: 38 }, 500, "MEASURED");
    expect(m.unitsPurchased).toBe(0);
    expect(m.total).toBe(0);
  });
});

describe("margin math (the big one)", () => {
  it("price = cost / (1 − margin), NOT cost × (1 + margin)", () => {
    // labor 6hr = $600 cost → 600/0.6 = $1000. Markup math would give $840.
    const r = priceJob(
      { lines: [{ type: "TASK", qty: 1, flatLaborHours: 6, materials: [] }], travelFee: 0 },
      S,
    );
    expect(r.jobCost).toBe(600);
    expect(r.rawPrice).toBe(1000);
    expect(r.price).toBe(1000);
    expect(r.price).not.toBe(840);
    expect(r.effectiveMarkupPct).toBeCloseTo(0.6667, 3);
  });

  it("travel fee is part of job cost (margin applies over it)", () => {
    const r = priceJob(
      { lines: [{ type: "TASK", qty: 1, flatLaborHours: 6, materials: [] }], travelFee: 60 },
      S,
    );
    expect(r.jobCost).toBe(660);
    expect(r.rawPrice).toBe(1100);
  });

  it("material markup 0 is a no-op; >0 marks up materials before margin", () => {
    const base = { lines: [], extraMaterials: [{ basis: "FLAT" as const, flatQty: 1, unitCost: 100 }], travelFee: 0 };
    const noMarkup = priceJob(base, S);
    expect(noMarkup.materialCostMarked).toBe(100);
    const marked = priceJob(base, { ...S, materialMarkupPct: 0.15 });
    expect(marked.materialCostMarked).toBeCloseTo(115);
    expect(marked.rawPrice).toBeCloseTo(115 / 0.6, 1);
  });
});

describe("minimum charge & rounding", () => {
  it("tiny job gets pulled up to the minimum", () => {
    // 0.5 hr = $50 cost → raw $83.33 < $150 min → $150
    const r = priceJob(
      { lines: [{ type: "TASK", qty: 1, flatLaborHours: 0.5, materials: [] }], travelFee: 0 },
      S,
    );
    expect(r.rawPrice).toBeCloseTo(83.33, 1);
    expect(r.minimumApplied).toBe(true);
    expect(r.price).toBe(150);
  });

  it("final price rounds UP to the increment", () => {
    // 3.62 hr = $362 cost → raw 603.33 → round up to 605
    const r = priceJob(
      { lines: [{ type: "TASK", qty: 1, flatLaborHours: 3.62, materials: [] }], travelFee: 0 },
      S,
    );
    expect(r.rawPrice).toBeCloseTo(603.33, 1);
    expect(r.price).toBe(605);
  });

  it("empty job prices at the minimum, rounded", () => {
    const r = priceJob({ lines: [], travelFee: 0 }, S);
    expect(r.price).toBe(150);
  });
});

describe("rounding modes (none / $1 / $5)", () => {
  // 3.62 hr = $362 cost → raw 603.333… → cents 603.33
  const input = {
    lines: [{ type: "TASK" as const, qty: 1, flatLaborHours: 3.62, materials: [] }],
    travelFee: 0,
  };

  it("mode none (0): exact to the cent, no round-up", () => {
    const r = priceJob(input, { ...S, roundingIncrement: 0 });
    expect(r.price).toBe(603.33);
    const { rows, total } = allocateClientRows(r);
    expect(total).toBe(603.33);
    // Rows sum EXACTLY to the exact price — no redistribution drift.
    expect(rows.reduce((s, x) => s + x.amount, 0)).toBeCloseTo(603.33, 9);
  });

  it("mode $1: rounds up to the next dollar", () => {
    const r = priceJob(input, { ...S, roundingIncrement: 1 });
    expect(r.price).toBe(604);
  });

  it("mode $5: unchanged legacy behavior", () => {
    const r = priceJob(input, { ...S, roundingIncrement: 5 });
    expect(r.price).toBe(605);
  });

  it("exact $5-boundary sum: all modes agree", () => {
    // 9 hr = $900 cost → raw 1500.00 exactly (900 / 0.6)
    const boundary = {
      lines: [{ type: "TASK" as const, qty: 1, flatLaborHours: 9, materials: [] }],
      travelFee: 0,
    };
    expect(priceJob(boundary, { ...S, roundingIncrement: 0 }).price).toBe(1500);
    expect(priceJob(boundary, { ...S, roundingIncrement: 1 }).price).toBe(1500);
    expect(priceJob(boundary, { ...S, roundingIncrement: 5 }).price).toBe(1500);
  });

  it("mode none: internals identical to mode $5 (rounding is client-total-only)", () => {
    const none = priceJob(input, { ...S, roundingIncrement: 0 });
    const five = priceJob(input, { ...S, roundingIncrement: 5 });
    expect(none.jobCost).toBe(five.jobCost);
    expect(none.laborCost).toBe(five.laborCost);
    expect(none.rawPrice).toBe(five.rawPrice);
  });
});

describe("determinism (the whole point)", () => {
  it("same inputs → same price, every time", () => {
    const input = {
      lines: [
        {
          type: "MEASURED" as const,
          qty: 640,
          laborHoursPerUnit: 0.01,
          prepMultiplier: 1.25,
          materials: [{ basis: "COVERAGE" as const, coats: 2, coverageSqftPerUnit: 350, unitCost: 38 }],
        },
        { type: "TASK" as const, qty: 1, flatLaborHours: 1.25, materials: [{ basis: "FLAT" as const, flatQty: 1, unitCost: 12 }] },
      ],
      travelFee: 35,
    };
    const a = priceJob(input, S);
    for (let i = 0; i < 50; i++) {
      expect(priceJob(input, S).price).toBe(a.price);
    }
  });
});

describe("client-facing rows", () => {
  it("sum EXACTLY to the final price (rounding folded into largest row)", () => {
    const r = priceJob(
      {
        lines: [
          { key: "walls", type: "MEASURED", qty: 640, laborHoursPerUnit: 0.01, materials: [] },
          { key: "patch", type: "TASK", qty: 1, flatLaborHours: 1.25, materials: [] },
        ],
        travelFee: 35,
      },
      S,
    );
    const { rows, total } = allocateClientRows(r);
    expect(total).toBe(r.price);
    const sum = rows.reduce((s, x) => s + x.amount, 0);
    expect(sum).toBeCloseTo(r.price, 2);
    expect(rows.find((x) => x.kind === "travel")).toBeTruthy();
  });

  it("min-charge job: single line absorbs the bump to the minimum", () => {
    const r = priceJob(
      { lines: [{ key: "tv", type: "TASK", qty: 1, flatLaborHours: 0.5, materials: [] }], travelFee: 0 },
      S,
    );
    const { rows } = allocateClientRows(r);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(150);
  });
});

describe("hardware lines", () => {
  it("at-cost hardware is added at exactly its cost, margin only on labor", () => {
    // 6 hr labor = $600 cost → $1000 at 40% margin. + $159 lock passed through.
    const r = priceJob(
      {
        lines: [
          { key: "install", type: "TASK", qty: 1, flatLaborHours: 6, materials: [] },
          { key: "lock", type: "TASK", kind: "hardware", qty: 1, hardwareUnitCost: 159, passThrough: true, materials: [] },
        ],
        travelFee: 0,
      },
      S,
    );
    expect(r.hardwarePassThroughCost).toBe(159);
    expect(r.jobCost).toBe(759); // 600 labor + 159 part
    expect(r.rawPrice).toBe(1159); // 600/0.6 + 159
    expect(r.price).toBe(1160); // rounded up to $5
    const { rows } = allocateClientRows(r);
    const lock = rows.find((x) => x.key === "lock")!;
    expect(lock.amount).toBe(159); // exact, no markup
  });

  it("marked-up hardware gets the job margin, like a material", () => {
    // $159 lock, no labor → 159/0.6 = 265.
    const r = priceJob(
      {
        lines: [
          { key: "lock", type: "TASK", kind: "hardware", qty: 1, hardwareUnitCost: 159, passThrough: false, materials: [] },
        ],
        travelFee: 0,
      },
      S,
    );
    expect(r.hardwareMarkupCost).toBe(159);
    expect(r.hardwarePassThroughCost).toBe(0);
    expect(r.jobCost).toBe(159);
    expect(r.rawPrice).toBe(265); // 159 / 0.6
    const { rows } = allocateClientRows(r);
    expect(rows[0].amount).toBe(265);
  });

  it("count multiplies hardware cost", () => {
    const r = priceJob(
      {
        lines: [
          { key: "h", type: "TASK", kind: "hardware", qty: 3, hardwareUnitCost: 20, passThrough: true, materials: [] },
        ],
        travelFee: 0,
      },
      S,
    );
    expect(r.hardwarePassThroughCost).toBe(60);
  });

  it("mixed job: at-cost + marked-up + labor all compose and rows sum to price", () => {
    const r = priceJob(
      {
        lines: [
          { key: "labor", type: "TASK", qty: 1, flatLaborHours: 2, materials: [] },      // $200 → 333.33
          { key: "markup", type: "TASK", kind: "hardware", qty: 1, hardwareUnitCost: 90, passThrough: false, materials: [] }, // 90 → 150
          { key: "atcost", type: "TASK", kind: "hardware", qty: 1, hardwareUnitCost: 159, passThrough: true, materials: [] }, // 159 exact
        ],
        travelFee: 0,
      },
      S,
    );
    // margined base = 200 + 90 = 290 → 290/0.6 = 483.33; + 159 = 642.33 → $645
    expect(r.jobCost).toBe(449); // 200 + 90 + 159
    expect(r.price).toBe(645);
    const { rows } = allocateClientRows(r);
    expect(rows.find((x) => x.key === "atcost")!.amount).toBe(159);
    const sum = rows.reduce((s, x) => s + x.amount, 0);
    expect(sum).toBeCloseTo(r.price, 2);
  });
});
