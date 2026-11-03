import { describe, expect, it } from "vitest";
import { summarizePnl } from "./expenses";

describe("summarizePnl (unified expenses)", () => {
  it("income − all expense lines = net; job-assigned tracked", () => {
    const s = summarizePnl({
      paymentCents: [154000, 17696], // $1,540 + $176.96
      expenses: [
        { category: "Vehicle & fuel", amount: 62.5 },
        { category: "Tools & equipment", amount: 129.99 }, // Stock
        { category: "Materials & supplies", amount: 11.96, job_id: 126 },
        { category: "Materials & supplies", amount: 21.28, job_id: 126 },
      ],
    });
    expect(s.income).toBe(1716.96);
    expect(s.totalExpenses).toBe(225.73);
    expect(s.jobAssigned).toBe(33.24);
    expect(s.net).toBe(1491.23);
    // categories aggregated (job + stock lines together) and sorted by spend
    expect(s.byCategory).toEqual([
      { category: "Tools & equipment", total: 129.99 },
      { category: "Vehicle & fuel", total: 62.5 },
      { category: "Materials & supplies", total: 33.24 },
    ]);
  });

  it("empty year is all zeros", () => {
    const s = summarizePnl({ paymentCents: [], expenses: [] });
    expect(s).toMatchObject({ income: 0, totalExpenses: 0, jobAssigned: 0, net: 0 });
    expect(s.byCategory).toEqual([]);
  });
});

import { buildExtraInvoiceRows, taxFactor, withoutExtraRows } from "./expenses";

describe("job_extra -> invoice rows (at cost, no markup)", () => {
  it("labels rows, carries exact amounts (no tax data = raw), computes the added total", () => {
    const { rows, addedTotal } = buildExtraInvoiceRows([
      { id: 11, description: "Paint — 2 gal", qty: 2, unit_price: 38, amount: 76 },
      { id: 12, description: "Door lock", qty: 1, unit_price: 45.5, amount: 45.5 },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].description).toBe(
      "Additional materials (at cost, incl. sales tax): Paint — 2 gal",
    );
    expect(rows[0].qtyLabel).toBe("2 × $38.00");
    expect(rows[1].qtyLabel).toBeNull(); // qty 1 needs no label
    expect(rows[0].amount).toBe(76); // AT COST — never marked up
    expect(addedTotal).toBe(121.5);
    expect(rows.every((r) => typeof r.extra_expense_id === "number")).toBe(true);
  });

  it("prorates the receipt's sales tax onto each item (micro-fix 2)", () => {
    // Receipt: subtotal 100, tax 7 -> factor 1.07.
    const { rows, addedTotal } = buildExtraInvoiceRows([
      { id: 21, description: "Paint", qty: 2, unit_price: 38, amount: 76, purchaseTax: 7, purchaseSubtotal: 100 },
      { id: 22, description: "Lock", qty: 1, unit_price: 24, amount: 24, purchaseTax: 7, purchaseSubtotal: 100 },
    ]);
    expect(rows[0].amount).toBe(81.32); // 76 × 1.07
    expect(rows[0].qtyLabel).toBe("2 × $40.66"); // unit prorated too
    expect(rows[1].amount).toBe(25.68); // 24 × 1.07
    expect(addedTotal).toBe(107.0);
  });

  it("taxFactor guards: zero/absent subtotal or missing tax -> raw amount", () => {
    expect(taxFactor(7, 100)).toBeCloseTo(1.07, 10);
    expect(taxFactor(null, 100)).toBe(1);
    expect(taxFactor(7, null)).toBe(1);
    expect(taxFactor(7, 0)).toBe(1); // zero-subtotal guard — never divide by 0
    expect(taxFactor(undefined, undefined)).toBe(1);
    expect(taxFactor(-1, 100)).toBe(1); // garbage tax never discounts
    expect(taxFactor(0, 100)).toBe(1); // explicit zero tax = raw
  });

  it("withoutExtraRows strips only injected rows (refresh = strip + re-add)", () => {
    const base = [
      { description: "Painting", qtyLabel: null, amount: 500 },
      { description: "Additional materials (at cost, incl. sales tax): Paint", qtyLabel: null, amount: 76, extra_expense_id: 11 },
    ];
    const stripped = withoutExtraRows(base);
    expect(stripped).toHaveLength(1);
    expect(stripped[0].description).toBe("Painting");
  });
});

import { knownStockCategory, stockTaxCategory, summarizeStock } from "./expenses";

describe("stock category -> tax category", () => {
  it("tools file under Tools & equipment, consumables under Materials & supplies", () => {
    expect(stockTaxCategory("Tools")).toBe("Tools & equipment");
    expect(stockTaxCategory("consumables")).toBe("Materials & supplies");
    expect(knownStockCategory(" tools ")).toBe("Tools");
  });

  it("any other label leaves the tax category alone", () => {
    expect(stockTaxCategory("Vehicle & fuel")).toBeNull();
    expect(stockTaxCategory("Cleaning Supplies")).toBeNull();
    expect(stockTaxCategory(null)).toBeNull();
  });

  it("re-filing items moves cost between categories; the totals stay the same", () => {
    const before = [
      { category: "Materials & supplies", amount: 249, assignment: "stock" },
      { category: "Materials & supplies", amount: 26.97, assignment: "stock" },
      { category: "Vehicle & fuel", amount: 60, assignment: "stock" },
    ];
    const after = before.map((e, i) => (i === 0 ? { ...e, category: stockTaxCategory("Tools")! } : e));
    const p0 = summarizePnl({ paymentCents: [], expenses: before });
    const p1 = summarizePnl({ paymentCents: [], expenses: after });
    expect(p1.totalExpenses).toBe(p0.totalExpenses);
    expect(p1.byCategory).toEqual(
      expect.arrayContaining([
        { category: "Tools & equipment", total: 249 },
        { category: "Materials & supplies", total: 26.97 },
        { category: "Vehicle & fuel", total: 60 },
      ]),
    );
    expect(summarizeStock(after).total).toBe(summarizeStock(before).total);
  });
});
