import { describe, expect, it } from "vitest";
import { billedTwiceMessage, estimateRows, estimateToBill, pricedTwice, type EstimateLink } from "./estimate-rows";

describe("estimateRows", () => {
  it("bills each line per estimate, every row claiming the estimate", () => {
    const rows = estimateRows({
      id: 53,
      version: 1,
      computed_price: 232.58,
      manual_override_price: null,
      resolved_travel_fee: 0,
      zoneLabel: null,
      lines: [{ description: "Light prep and Touch Up Paint", qty: 1, unit: null, resolved_client_amount: 232.58 }],
    });
    expect(rows).toEqual([{ description: "Light prep and Touch Up Paint", qtyLabel: "per estimate", amount: 232.58, estimate_id: 53 }]);
  });

  it("keeps a price adjustment, as the estimate charged it", () => {
    const rows = estimateRows({
      id: 7, version: 2, computed_price: 300, manual_override_price: 250, resolved_travel_fee: 0, zoneLabel: null,
      lines: [{ description: "Walls", qty: 400, unit: "sqft", resolved_client_amount: 300 }],
    });
    expect(rows.map((r) => [r.description, r.qtyLabel, r.amount])).toEqual([
      ["Walls", "400 sqft, per estimate", 300],
      ["Price adjustment", "per estimate", -50],
    ]);
    expect(rows.every((r) => r.estimate_id === 7)).toBe(true);
  });
});

describe("estimateToBill", () => {
  const v = (id: number, version: number, status = "accepted") => ({ id, version, status });
  it("offers the newest accepted version", () => {
    expect(estimateToBill([v(4, 1), v(14, 2), v(21, 3, "draft")], []).estimateId).toBe(14);
  });
  it("offers nothing once any version is on an invoice", () => {
    const r = estimateToBill([v(4, 1), v(14, 2)], [{ estimate_id: 4, invoice_id: 9, invoice_number: "SPC-2026-002" }]);
    expect(r).toEqual({ estimateId: null, claimedBy: { estimate_id: 4, invoice_id: 9, invoice_number: "SPC-2026-002" } });
  });
});

describe("linked job lines", () => {
  const link = (over: Partial<EstimateLink>): EstimateLink => ({
    line: "Prep walls", taskId: 1, taskTitle: "Prep", billable: true, unitPrice: 150, ...over,
  });
  it("only a billable job line with a price bills twice", () => {
    expect(pricedTwice([link({}), link({ taskId: 2, billable: false }), link({ taskId: 3, unitPrice: null })]).map((l) => l.taskId))
      .toEqual([1]);
  });
  it("names the lines and says what to do", () => {
    expect(billedTwiceMessage([link({})])).toBe(
      'On the estimate, "Prep walls" is linked to the job line "Prep", which has its own price, so this invoice would bill that work twice. Mark "Prep" not billable on the job (the estimate prices it), then try again.',
    );
    expect(billedTwiceMessage([link({}), link({ line: "Paint", taskId: 2, taskTitle: "Paint walls" })])).toMatch(
      /"Prep walls" → "Prep", "Paint" → "Paint walls"\. Mark "Prep", "Paint walls" not billable/,
    );
  });
});
