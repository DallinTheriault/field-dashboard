import { describe, expect, it } from "vitest";
import {
  LABOR_HOURLY,
  customLine,
  formatQty,
  jobTotal,
  lineFromEntry,
  lineTotal,
  needsPrice,
  parseMoney,
  pickerEntries,
  rankEntries,
  recentServiceIds,
  stepQty,
  withPrice,
} from "./lines";

describe("lineTotal / jobTotal", () => {
  it("multiplies to the cent", () => {
    expect(lineTotal(3, 19.99)).toBe(59.97);
    expect(lineTotal(400, 1.07)).toBe(428);
    expect(lineTotal(1.5, 95)).toBe(142.5);
    expect(lineTotal(2, null)).toBeNull();
  });

  it("sums only billable, priced lines without float drift", () => {
    const lines = [
      { qty: 3, unit_price: 0.1, billable: true },
      { qty: 1, unit_price: 0.2, billable: true },
      { qty: 1, unit_price: 500, billable: false },
      { qty: 1, unit_price: null, billable: false },
    ];
    expect(jobTotal(lines)).toBe(0.5);
  });
});

describe("needsPrice", () => {
  it("flags sold lines without a price, never reminders", () => {
    expect(needsPrice({ unit: "each", unit_price: null })).toBe(true);
    expect(needsPrice({ unit: "each", unit_price: 0 })).toBe(false);
    expect(needsPrice({ unit: null, unit_price: null })).toBe(false);
  });
});

describe("stepQty", () => {
  it("steps whole units, half hours, and never reaches zero", () => {
    expect(stepQty(1, 1, "each")).toBe(2);
    expect(stepQty(1, -1, "each")).toBe(1);
    expect(stepQty(2, -1, "hour")).toBe(1.5);
    expect(stepQty(0.5, -1, "hour")).toBe(0.5);
    expect(stepQty(400, 1, "sqft")).toBe(401);
    expect(stepQty(1, 1, null)).toBe(2);
  });
});

describe("parseMoney", () => {
  it("reads what people type", () => {
    expect(parseMoney("$1,250.50")).toBe(1250.5);
    expect(parseMoney(" 95 ")).toBe(95);
    expect(parseMoney("0")).toBe(0);
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("abc")).toBeNaN();
    expect(parseMoney("-5")).toBeNaN();
  });
});

describe("withPrice", () => {
  const unpriced = { qty: 1, unit_price: null, billable: false };
  it("makes a line billable when it first gets a price", () => {
    expect(withPrice(unpriced, 120)).toEqual({ qty: 1, unit_price: 120, billable: true });
  });
  it("keeps a priced line's billable choice on a price change", () => {
    expect(withPrice({ qty: 1, unit_price: 100, billable: false }, 120).billable).toBe(false);
  });
  it("clearing the price stops it billing", () => {
    expect(withPrice({ qty: 1, unit_price: 100, billable: true }, null)).toEqual(unpriced);
  });
});

describe("formatQty", () => {
  it("drops the unit for plain counts", () => {
    expect(formatQty(3, "each")).toBe("3");
    expect(formatQty(1.5, "hour")).toBe("1.5 hr");
    expect(formatQty(400, "sqft")).toBe("400 sqft");
    expect(formatQty(1, null)).toBe("1");
  });
});

describe("picker", () => {
  const rows = [
    { id: 1, name: "Walls - 2 coats", type: "MEASURED" as const, unit: "sqft" as const, unit_price: null },
    { id: 2, name: "Toilet swap", type: "TASK" as const, unit: null, unit_price: 180 },
    { id: 3, name: "Patch drywall, small", type: "PRICED" as const, unit: "each" as const, unit_price: 95 },
    { id: 4, name: "Door rehang", type: "PRICED" as const, unit: "each" as const, unit_price: 140 },
  ];
  const entries = pickerEntries(rows, 85);

  it("leads with the built-in hourly line at the default rate", () => {
    expect(entries[0]).toEqual({ id: null, name: LABOR_HOURLY, unit: "hour", unit_price: 85 });
    expect(entries.find((e) => e.id === 2)?.unit).toBe("each");
  });

  it("matches every typed word and puts recent entries first", () => {
    expect(rankEntries(entries, "patch sm", []).map((e) => e.id)).toEqual([3]);
    expect(rankEntries(entries, "", [4, 2]).map((e) => e.id)).toEqual([4, 2, null, 3, 1]);
  });

  it("derives recent ids newest first, once each", () => {
    expect(recentServiceIds([{ service_id: 4 }, { service_id: null }, { service_id: 2 }, { service_id: 4 }])).toEqual([4, 2]);
  });
});

describe("new lines", () => {
  it("one tap adds qty 1, billable when the entry has a price", () => {
    expect(lineFromEntry({ id: 3, name: "Patch", unit: "each", unit_price: 95 })).toMatchObject({
      service_id: 3, qty: 1, unit_price: 95, billable: true,
    });
    expect(lineFromEntry({ id: 1, name: "Walls", unit: "sqft", unit_price: null }).billable).toBe(false);
  });

  it("custom lines: flat price, hours at the hourly rate, or a reminder", () => {
    expect(customLine("Haul debris", "price", 60, 85)).toMatchObject({ qty: 1, unit: "each", unit_price: 60, billable: true });
    expect(customLine("Extra labor", "hours", 2.5, 85)).toMatchObject({ qty: 2.5, unit: "hour", unit_price: 85, billable: true });
    expect(customLine("Extra labor", "hours", 2, null)).toMatchObject({ unit: "hour", unit_price: null, billable: false });
    expect(customLine("Bring ladder", "price", null, 85)).toMatchObject({ unit: null, unit_price: null, billable: false });
  });
});
