import { describe, expect, it } from "vitest";
import {
  EMPTY_DRAFT,
  draftToRow,
  hoursPerUnit,
  priceBookUnit,
  rowToDraft,
  suggestedUnitPrice,
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
};
const task: CatalogRow = {
  type: "TASK",
  unit: null,
  labor_hours_per_unit: null,
  flat_labor_hours: 1.5,
  typical_hours: null,
  unit_price: 120,
};
const priced: CatalogRow = {
  type: "PRICED",
  unit: "each",
  labor_hours_per_unit: null,
  flat_labor_hours: null,
  typical_hours: 2,
  unit_price: 250,
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

describe("suggestedUnitPrice", () => {
  it("is hours × sell rate, to the cent", () => {
    expect(suggestedUnitPrice(1.5, 106.84)).toBe(160.26);
    expect(suggestedUnitPrice(0.01, 92.59)).toBe(0.93);
  });

  it("is null without hours or a sell rate", () => {
    expect(suggestedUnitPrice(null, 100)).toBeNull();
    expect(suggestedUnitPrice(2, 0)).toBeNull();
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
