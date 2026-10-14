/**
 * The price book is service_catalog (v093). Three row types share it:
 *   PRICED    sold at unit_price per unit; typical_hours only suggest a price
 *   MEASURED  estimate-builder rows, priced from labor hours per sqft/lnft/each
 *   TASK      estimate-builder rows, priced from flat hours per task
 * Every type can carry a unit_price for job lines; only MEASURED and TASK are
 * priced by the estimate builder. Hours live in one column per type, which
 * the helpers below hide from the screen.
 */

export type CatalogType = "PRICED" | "MEASURED" | "TASK";
export type PriceBookUnit = "each" | "hour" | "sqft" | "lnft";

export const PRICED_UNITS: PriceBookUnit[] = ["each", "hour", "sqft", "lnft"];
export const MEASURED_UNITS: PriceBookUnit[] = ["sqft", "lnft", "each"];

export type CatalogRow = {
  type: CatalogType;
  unit: PriceBookUnit | null;
  labor_hours_per_unit: number | null;
  flat_labor_hours: number | null;
  typical_hours: number | null;
  unit_price: number | null;
};

/** The unit a row is sold in. A TASK row is sold per task. */
export function priceBookUnit(row: Pick<CatalogRow, "type" | "unit">): PriceBookUnit {
  return row.type === "TASK" ? "each" : (row.unit ?? "each");
}

/** Labor hours behind one unit, from whichever column the row's type uses. */
export function hoursPerUnit(row: CatalogRow): number | null {
  if (row.type === "MEASURED") return row.labor_hours_per_unit;
  if (row.type === "TASK") return row.flat_labor_hours;
  return row.unit === "hour" ? 1 : row.typical_hours;
}

/** Hours × effective sell rate, to the cent. Null when either is missing. */
export function suggestedUnitPrice(hours: number | null, sellRate: number): number | null {
  if (hours === null || !(hours > 0) || !(sellRate > 0)) return null;
  return Math.round(hours * sellRate * 100) / 100;
}

export type PriceBookDraft = {
  name: string;
  type: CatalogType;
  unit: PriceBookUnit;
  unitPrice: string;
  hours: string;
  materialsNote: string;
  notes: string;
  active: boolean;
};

export const EMPTY_DRAFT: PriceBookDraft = {
  name: "",
  type: "PRICED",
  unit: "each",
  unitPrice: "",
  hours: "",
  materialsNote: "",
  notes: "",
  active: true,
};

export function rowToDraft(
  row: CatalogRow & { name: string; materials_note: string | null; notes: string | null; active: boolean },
): PriceBookDraft {
  const hours = row.type === "PRICED" && row.unit === "hour" ? null : hoursPerUnit(row);
  return {
    name: row.name,
    type: row.type,
    unit: priceBookUnit(row),
    unitPrice: row.unit_price === null ? "" : String(row.unit_price),
    hours: hours === null ? "" : String(hours),
    materialsNote: row.materials_note ?? "",
    notes: row.notes ?? "",
    active: row.active,
  };
}

/** The unit a draft can use once its type changes. */
export function unitForType(type: CatalogType, unit: PriceBookUnit): PriceBookUnit {
  if (type === "TASK") return "each";
  if (type === "MEASURED" && unit === "hour") return "sqft";
  return unit;
}

export type CatalogWrite = CatalogRow & {
  name: string;
  materials_note: string | null;
  notes: string | null;
  active: boolean;
  is_placeholder: false;
};

/**
 * Validate a draft and build the full row to write. Every hours column is set
 * explicitly, so changing a row's type clears the columns it no longer uses.
 */
export function draftToRow(
  d: PriceBookDraft,
): { ok: true; row: CatalogWrite } | { ok: false; error: string } {
  const name = d.name.trim();
  if (!name) return { ok: false, error: "Name is required." };

  let unitPrice: number | null = null;
  if (d.unitPrice.trim() !== "") {
    unitPrice = Number(d.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0)
      return { ok: false, error: "Price must be a number, 0 or more." };
  }

  let hours: number | null = null;
  if (d.hours.trim() !== "") {
    hours = Number(d.hours);
    if (!Number.isFinite(hours) || hours <= 0)
      return { ok: false, error: "Hours must be more than 0." };
  }

  const base = {
    name,
    unit_price: unitPrice,
    materials_note: d.materialsNote.trim() || null,
    notes: d.notes.trim() || null,
    active: d.active,
    is_placeholder: false as const,
  };

  if (d.type === "PRICED") {
    if (!PRICED_UNITS.includes(d.unit)) return { ok: false, error: "Pick a unit." };
    return {
      ok: true,
      row: {
        ...base,
        type: "PRICED",
        unit: d.unit,
        labor_hours_per_unit: null,
        flat_labor_hours: null,
        // An hourly item's hours are the quantity itself.
        typical_hours: d.unit === "hour" ? null : hours,
      },
    };
  }

  if (hours === null)
    return { ok: false, error: "The estimate builder prices this from hours; enter them." };

  if (d.type === "MEASURED") {
    if (!MEASURED_UNITS.includes(d.unit))
      return { ok: false, error: "Measured work is per sqft, lnft or each." };
    return {
      ok: true,
      row: {
        ...base,
        type: "MEASURED",
        unit: d.unit,
        labor_hours_per_unit: hours,
        flat_labor_hours: null,
        typical_hours: null,
      },
    };
  }

  return {
    ok: true,
    row: {
      ...base,
      type: "TASK",
      unit: null,
      labor_hours_per_unit: null,
      flat_labor_hours: hours,
      typical_hours: null,
    },
  };
}
