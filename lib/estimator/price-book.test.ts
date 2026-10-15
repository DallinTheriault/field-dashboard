import { describe, expect, it } from "vitest";
import {
  EMPTY_DRAFT,
  catalogUnitPrice,
  draftToRow,
  hoursPerUnit,
  priceBookUnit,
  priceFromHours,
  rowFromHourlyLine,
  rowToDraft,
  unitForType,
  type CatalogRow,
} from "./price-book";

const measured: CatalogRow = {
  type: "MEASURED",
  unit: "sqft",
  labor_hours_per_unit: 0.01,
  flat_labor_hours: null,
  typical_hours: null,
  unit_price: null,
  rate_type: "general",
};
const task: CatalogRow = {
  type: "TASK",
  unit: null,
  labor_hours_per_unit: null,
  flat_labor_hours: 1.5,
  typical_hours: null,
  unit_price: 120,
  rate_type: "general",
};
const priced: CatalogRow = {
  type: "PRICED",
  unit: "each",
  labor_hours_per_unit: null,
  flat_labor_hours: null,
  typical_hours: 2,
  unit_price: 250,
  rate_type: "skilled",
};

describe("priceBookUnit / hoursPerUnit", () => {
  it("reads each type's own hours column", () => {
    expect([priceBookUnit(measured), hoursPerUnit(measured)]).toEqual(["sqft", 0.01]);
    expect([priceBookUnit(task), hoursPerUnit(task)]).toEqual(["each", 1.5]);
    expect([priceBookUnit(priced), hoursPerUnit(priced)]).toEqual(["each", 2]);
  });

  it("treats an hourly item as one hour per unit", () => {
    expect(hoursPerUnit({ ...priced, unit: "hour", typical_hours: null })).toBe(1);
  });
});

describe("priceFromHours / catalogUnitPrice", () => {
  const rates = { general: 95, skilled: 125 };

  it("is hours × rate: to the cent each, finer per sq ft", () => {
    expect(priceFromHours(1.5, 95, "each")).toBe(142.5);
    expect(priceFromHours(0.0125, 95, "sqft")).toBe(1.1875);
    expect(priceFromHours(1 / 3, 95, "each")).toBe(31.67);
  });

  it("is null without hours or a rate", () => {
    expect(priceFromHours(null, 95, "each")).toBeNull();
    expect(priceFromHours(2, null, "each")).toBeNull();
    expect(priceFromHours(0, 95, "each")).toBeNull();
  });

  it("uses your own price when set, else hours × the row's rate", () => {
    expect(catalogUnitPrice(priced, rates)).toBe(250);
    expect(catalogUnitPrice({ ...priced, unit_price: null }, rates)).toBe(250); // 2 hr × $125 skilled
    expect(catalogUnitPrice({ ...priced, unit_price: null, rate_type: "general" }, rates)).toBe(190);
    expect(catalogUnitPrice({ ...task, unit_price: null }, rates)).toBe(142.5);
    expect(catalogUnitPrice(measured, rates)).toBe(0.95);
    expect(catalogUnitPrice({ ...priced, unit: "hour", typical_hours: null, unit_price: null }, rates)).toBe(125);
    expect(catalogUnitPrice({ ...priced, unit_price: null }, { general: 95, skilled: null })).toBeNull();
  });
});

describe("rowFromHourlyLine", () => {
  it("saves job-lines-only work sold each, priced from hours", () => {
    const r = rowFromHourlyLine({ name: "Patch drywall", hours: "3", rateType: "skilled" });
    expect(r.ok && r.row).toMatchObject({
      name: "Patch drywall", type: "PRICED", unit: "each", typical_hours: 3, rate_type: "skilled", unit_price: null, active: true,
    });
  });

  it("needs a real name and hours", () => {
    expect(rowFromHourlyLine({ name: "Labor, hourly", hours: "3", rateType: "general" }).ok).toBe(false);
    expect(rowFromHourlyLine({ name: "skilled labor, HOURLY", hours: "3", rateType: "general" }).ok).toBe(false);
    expect(rowFromHourlyLine({ name: "  ", hours: "3", rateType: "general" }).ok).toBe(false);
    expect(rowFromHourlyLine({ name: "Patch", hours: "", rateType: "general" }).ok).toBe(false);
    expect(rowFromHourlyLine({ name: "Patch", hours: "0", rateType: "general" }).ok).toBe(false);
  });
});

describe("draftToRow", () => {
  it("saves a priced item with no price as needing one", () => {
    const r = draftToRow({ ...EMPTY_DRAFT, name: "  Patch drywall ", hours: "" });
    expect(r).toEqual({
      ok: true,
      row: {
        name: "Patch drywall",
        type: "PRICED",
        unit: "each",
        unit_price: null,
        rate_type: "general",
        labor_hours_per_unit: null,
        flat_labor_hours: null,
        typical_hours: null,
        materials_note: null,
        notes: null,
        active: true,
        is_placeholder: false,
      },
    });
  });

  it("drops typical hours on an hourly item", () => {
    const r = draftToRow({ ...EMPTY_DRAFT, name: "Electrician", unit: "hour", unitPrice: "95", hours: "3" });
    expect(r.ok && r.row.typical_hours).toBeNull();
    expect(r.ok && r.row.unit_price).toBe(95);
  });

  it("keeps builder rows in their hours columns", () => {
    const m = draftToRow({ ...EMPTY_DRAFT, name: "Walls", type: "MEASURED", unit: "sqft", hours: "0.01", unitPrice: "1.25" });
    expect(m.ok && m.row).toMatchObject({ type: "MEASURED", unit: "sqft", labor_hours_per_unit: 0.01, typical_hours: null, unit_price: 1.25 });
    const t = draftToRow({ ...EMPTY_DRAFT, name: "Toilet", type: "TASK", unit: "each", hours: "1.5" });
    expect(t.ok && t.row).toMatchObject({ type: "TASK", unit: null, flat_labor_hours: 1.5, labor_hours_per_unit: null });
  });

  it("clears the old hours column when a builder row becomes priced", () => {
    const d = { ...rowToDraft({ ...task, name: "Toilet", materials_note: null, notes: null, active: true }), type: "PRICED" as const };
    const r = draftToRow(d);
    expect(r.ok && r.row).toMatchObject({ type: "PRICED", unit: "each", flat_labor_hours: null, typical_hours: 1.5, unit_price: 120 });
  });

  it("rejects what the database would", () => {
    expect(draftToRow({ ...EMPTY_DRAFT, name: "" }).ok).toBe(false);
    expect(draftToRow({ ...EMPTY_DRAFT, name: "x", unitPrice: "-1" }).ok).toBe(false);
    expect(draftToRow({ ...EMPTY_DRAFT, name: "x", unitPrice: "abc" }).ok).toBe(false);
    expect(draftToRow({ ...EMPTY_DRAFT, name: "x", hours: "0" }).ok).toBe(false);
    expect(draftToRow({ ...EMPTY_DRAFT, name: "x", type: "TASK", hours: "" }).ok).toBe(false);
    expect(draftToRow({ ...EMPTY_DRAFT, name: "x", type: "MEASURED", unit: "hour", hours: "1" }).ok).toBe(false);
  });
});

describe("rowToDraft / unitForType", () => {
  it("round-trips a builder row", () => {
    const d = rowToDraft({ ...measured, name: "Walls", materials_note: "2 coats", notes: null, active: true });
    expect(d).toMatchObject({ type: "MEASURED", unit: "sqft", hours: "0.01", unitPrice: "", materialsNote: "2 coats" });
  });

  it("moves a draft onto a unit its new type allows", () => {
    expect(unitForType("TASK", "sqft")).toBe("each");
    expect(unitForType("MEASURED", "hour")).toBe("sqft");
    expect(unitForType("PRICED", "hour")).toBe("hour");
  });
});
