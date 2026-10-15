import { describe, expect, it } from "vitest";
import {
  LABOR_HOURLY,
  SKILLED_HOURLY,
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
  it("flags billable lines without a price, never reminders or lines marked not billable", () => {
    expect(needsPrice({ billable: true, unit_price: null })).toBe(true);
    expect(needsPrice({ billable: true, unit_price: 0 })).toBe(false);
    expect(needsPrice({ billable: false, unit_price: null })).toBe(false);
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

describe("formatQty", () => {
  it("drops the unit for plain counts", () => {
    expect(formatQty(3, "each")).toBe("3");
    expect(formatQty(1.5, "hour")).toBe("1.5 hr");
    expect(formatQty(400, "sqft")).toBe("400 sqft");
    expect(formatQty(1, null)).toBe("1");
  });
});

describe("picker", () => {
  const cat = { labor_hours_per_unit: null, flat_labor_hours: null, typical_hours: null, rate_type: "general" as const };
  const rows = [
    { ...cat, id: 1, name: "Walls - 2 coats", type: "MEASURED" as const, unit: "sqft" as const, unit_price: null, labor_hours_per_unit: 0.01 },
    { ...cat, id: 2, name: "Toilet swap", type: "TASK" as const, unit: null, unit_price: 180, flat_labor_hours: 1.5 },
    { ...cat, id: 3, name: "Patch drywall, small", type: "PRICED" as const, unit: "each" as const, unit_price: 95 },
    { ...cat, id: 4, name: "Door rehang", type: "PRICED" as const, unit: "each" as const, unit_price: null, typical_hours: 2, rate_type: "skilled" as const },
  ];
  const entries = pickerEntries(rows, { general: 85, skilled: 125 });

  it("leads with the two built-in hourly lines at their rates", () => {
    expect(entries[0]).toEqual({ id: null, name: LABOR_HOURLY, unit: "hour", unit_price: 85 });
    expect(entries[1]).toEqual({ id: null, name: SKILLED_HOURLY, unit: "hour", unit_price: 125 });
    expect(entries.find((e) => e.id === 2)?.unit).toBe("each");
  });

  it("prices rows at their own price, else hours × their rate", () => {
    expect(entries.find((e) => e.id === 2)?.unit_price).toBe(180);
    expect(entries.find((e) => e.id === 4)?.unit_price).toBe(250);
    expect(entries.find((e) => e.id === 1)?.unit_price).toBe(0.85);
  });

  it("matches every typed word and puts recent entries first", () => {
    expect(rankEntries(entries, "patch sm", []).map((e) => e.id)).toEqual([3]);
    expect(rankEntries(entries, "", [4, 2]).map((e) => e.id ?? e.name)).toEqual([4, 2, LABOR_HOURLY, 3, SKILLED_HOURLY, 1]);
  });

  it("derives recent ids newest first, once each", () => {
    expect(recentServiceIds([{ service_id: 4 }, { service_id: null }, { service_id: 2 }, { service_id: 4 }])).toEqual([4, 2]);
  });
});

describe("new lines", () => {
  it("one tap adds a billable line at qty 1; an unpriced entry needs a price", () => {
    expect(lineFromEntry({ id: 3, name: "Patch", unit: "each", unit_price: 95 })).toMatchObject({
      service_id: 3, qty: 1, unit_price: 95, billable: true,
    });
    expect(lineFromEntry({ id: 1, name: "Walls", unit: "sqft", unit_price: null })).toMatchObject({ unit_price: null, billable: true });
  });

  it("custom lines: flat price, hours at the hourly rate, or a reminder", () => {
    expect(customLine("Haul debris", "price", 60, 85)).toMatchObject({ qty: 1, unit: "each", unit_price: 60, billable: true });
    expect(customLine("Extra labor", "hours", 2.5, 85)).toMatchObject({ qty: 2.5, unit: "hour", unit_price: 85, billable: true });
    expect(customLine("Extra labor", "hours", 2, null)).toMatchObject({ unit: "hour", unit_price: null, billable: true });
    expect(customLine("Bring ladder", "price", null, 85)).toMatchObject({ unit: null, unit_price: null, billable: false });
  });
});
