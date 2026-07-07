import { describe, expect, it } from "vitest";
import { buildClientDocRows } from "./client-rows";

/**
 * THE LEAK TEST (kickoff §6.5): nothing but description / qtyLabel / amount
 * may reach a client-facing document. Hours, loaded rate, margin, cost, and
 * prep must be structurally absent even when handed a fully-loaded frozen
 * line row (as the DB returns it).
 */
const frozenLineFromDb = {
  description: "Walls — 2 coats",
  qty: 640,
  unit: "sqft",
  resolved_client_amount: 1180.5,
  // Internals that must never leak:
  resolved_labor_hours: 6.4,
  resolved_loaded_rate: 65.9,
  resolved_labor_cost: 421.76,
  resolved_material_cost: 152,
  resolved_line_cost: 573.76,
  resolved_prep_multiplier: 1.6,
};

describe("buildClientDocRows (leak test)", () => {
  it("emits ONLY description/qtyLabel/amount keys", () => {
    const { rows } = buildClientDocRows({
      lines: [frozenLineFromDb],
      travelFee: 35,
      zoneLabel: "15–30 mi",
      computedPrice: 1240,
      overridePrice: null,
    });
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(["amount", "description", "qtyLabel"]);
    }
    const dumped = JSON.stringify(rows);
    for (const forbidden of [
      "hours",
      "rate",
      "margin",
      "cost",
      "prep",
      "65.9",
      "573.76",
      "421.76",
    ]) {
      expect(dumped).not.toContain(forbidden);
    }
  });

  it("rows sum exactly to the total (travel absorbs the allocator remainder)", () => {
    const { rows, total } = buildClientDocRows({
      lines: [
        { description: "A", qty: 1, unit: null, resolved_client_amount: 164.75 },
        { description: "B", qty: 1, unit: null, resolved_client_amount: 355.25 },
      ],
      travelFee: 35,
      zoneLabel: "15–30 mi",
      computedPrice: 580,
      overridePrice: null,
    });
    expect(rows).toHaveLength(3);
    expect(rows[2].amount).toBeCloseTo(60, 2);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(total, 2);
  });

  it("override renders as an explicit Price adjustment row", () => {
    const { rows, total } = buildClientDocRows({
      lines: [
        { description: "A", qty: 1, unit: null, resolved_client_amount: 520 },
      ],
      travelFee: 0,
      computedPrice: 520,
      overridePrice: 450,
    });
    expect(total).toBe(450);
    const adj = rows.find((r) => r.description === "Price adjustment");
    expect(adj?.amount).toBeCloseTo(-70, 2);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(450, 2);
  });

  it("qty labels: measured shows unit, repeated tasks show count, single tasks nothing", () => {
    const { rows } = buildClientDocRows({
      lines: [
        { description: "Walls", qty: 640, unit: "sqft", resolved_client_amount: 100 },
        { description: "Repairs", qty: 2, unit: null, resolved_client_amount: 100 },
        { description: "Haul", qty: 1, unit: null, resolved_client_amount: 100 },
      ],
      travelFee: 0,
      computedPrice: 300,
      overridePrice: null,
    });
    expect(rows.map((r) => r.qtyLabel)).toEqual(["640 sqft", "× 2", null]);
  });
});
