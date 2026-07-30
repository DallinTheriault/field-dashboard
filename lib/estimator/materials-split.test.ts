import { describe, it, expect } from "vitest";
import { splitMaterials, summarizeStock } from "./expenses";

describe("splitMaterials — absorbed vs recovered (§6.2)", () => {
  const items = [
    { assignment: "job_in_bid", amount: 40 },
    { assignment: "job_in_bid", amount: 10.5 },
    { assignment: "job_extra", amount: 25 },
    { assignment: "job_internal", amount: 12.25 },
    { assignment: "stock", amount: 999 },      // excluded: business asset
    { assignment: "unassigned", amount: 500 }, // excluded: not yet a job cost
  ];

  it("splits the three job buckets and excludes stock + unassigned", () => {
    expect(splitMaterials(items)).toEqual({
      inBid: 50.5,
      billed: 25,
      absorbed: 12.25,
    });
  });

  it("reports zeros rather than hiding them, so absence is visible", () => {
    expect(splitMaterials([])).toEqual({ inBid: 0, billed: 0, absorbed: 0 });
    expect(splitMaterials([{ assignment: "stock", amount: 10 }])).toEqual({
      inBid: 0,
      billed: 0,
      absorbed: 0,
    });
  });

  it("tolerates string amounts and ignores junk", () => {
    expect(
      splitMaterials([
        { assignment: "job_internal", amount: "5.25" },
        { assignment: "job_internal", amount: "not a number" },
        { assignment: null, amount: 3 },
      ]),
    ).toEqual({ inBid: 0, billed: 0, absorbed: 5.25 });
  });

  it("does not conflate absorbed with billed", () => {
    const s = splitMaterials([
      { assignment: "job_internal", amount: 100 },
      { assignment: "job_extra", amount: 1 },
    ]);
    expect(s.absorbed).toBe(100);
    expect(s.billed).toBe(1);
  });
});

describe("summarizeStock", () => {
  it("totals only stock rows, broken out by existing category", () => {
    const r = summarizeStock([
      { assignment: "stock", amount: 20, category: "Tools & equipment" },
      { assignment: "stock", amount: 5, category: "Materials & supplies" },
      { assignment: "stock", amount: 10, category: "Tools & equipment" },
      { assignment: "job_in_bid", amount: 999, category: "Materials & supplies" },
    ]);
    expect(r.total).toBe(35);
    expect(r.byCategory).toEqual([
      { category: "Tools & equipment", total: 30 },
      { category: "Materials & supplies", total: 5 },
    ]);
  });

  it("falls back to Other when a row has no category", () => {
    const r = summarizeStock([{ assignment: "stock", amount: 7, category: null }]);
    expect(r.byCategory).toEqual([{ category: "Other", total: 7 }]);
  });

  it("is empty when there is no stock spend", () => {
    expect(summarizeStock([{ assignment: "job_extra", amount: 50 }])).toEqual({
      total: 0,
      byCategory: [],
    });
  });
});
