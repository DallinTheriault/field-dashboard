import { describe, expect, it } from "vitest";
import { summarizePnl } from "./expenses";

describe("summarizePnl", () => {
  it("income − (logged expenses + job materials) = net", () => {
    const s = summarizePnl({
      paidInvoiceCents: [154000, 17696], // $1,540 + $176.96
      expenses: [
        { category: "Vehicle & fuel", amount: 62.5 },
        { category: "Tools & equipment", amount: 129.99 },
        { category: "Vehicle & fuel", amount: 40 },
      ],
      jobMaterialCosts: [18.5, 114],
    });
    expect(s.income).toBe(1716.96);
    expect(s.loggedExpenses).toBe(232.49);
    expect(s.jobMaterials).toBe(132.5);
    expect(s.totalExpenses).toBe(364.99);
    expect(s.net).toBe(1351.97);
    // categories aggregated and sorted by spend
    expect(s.byCategory).toEqual([
      { category: "Tools & equipment", total: 129.99 },
      { category: "Vehicle & fuel", total: 102.5 },
    ]);
  });

  it("empty year is all zeros", () => {
    const s = summarizePnl({ paidInvoiceCents: [], expenses: [], jobMaterialCosts: [] });
    expect(s).toMatchObject({ income: 0, totalExpenses: 0, net: 0 });
    expect(s.byCategory).toEqual([]);
  });
});
