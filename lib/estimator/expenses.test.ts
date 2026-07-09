import { describe, expect, it } from "vitest";
import { summarizePnl } from "./expenses";

describe("summarizePnl (unified expenses)", () => {
  it("income − all expense lines = net; job-assigned tracked", () => {
    const s = summarizePnl({
      paidInvoiceCents: [154000, 17696], // $1,540 + $176.96
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
    const s = summarizePnl({ paidInvoiceCents: [], expenses: [] });
    expect(s).toMatchObject({ income: 0, totalExpenses: 0, jobAssigned: 0, net: 0 });
    expect(s.byCategory).toEqual([]);
  });
});
