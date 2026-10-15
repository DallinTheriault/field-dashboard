/**
 * The price book is service_catalog (v093). Three row types share it:
 *   PRICED    job lines only
 *   MEASURED  also the old estimate builder, labor hours per sqft/lnft/each
 *   TASK      also the old estimate builder, flat hours per task
 * Hours live in one column per type, which the helpers below hide from the
 * screen. On a job line every row sells at its own unit_price when set, else
 * at its typical hours × its labor rate (v098: general or skilled).
 */

export type CatalogType = "PRICED" | "MEASURED" | "TASK";
export type PriceBookUnit = "each" | "hour" | "sqft" | "lnft";

export const PRICED_UNITS: PriceBookUnit[] = ["each", "hour", "sqft", "lnft"];
export const MEASURED_UNITS: PriceBookUnit[] = ["sqft", "lnft", "each"];

export type RateType = "general" | "skilled";
export type Rates = { general: number | null; skilled: number | null };
export const RATE_LABEL: Record<RateType, string> = { general: "General", skilled: "Skilled" };

export type CatalogRow = {
  type: CatalogType;
  unit: PriceBookUnit | null;
  labor_hours_per_unit: number | null;
  flat_labor_hours: number | null;
  typical_hours: number | null;
  unit_price: number | null;
  rate_type: RateType;
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

/**
 * Hours × an hourly rate, per unit: to the cent, or to a hundredth of a cent
 * for per-sqft and per-lnft work. Null when hours or the rate are missing.
 */
export function priceFromHours(hours: number | null, rate: number | null, unit: PriceBookUnit): number | null {
  if (hours === null || !(hours > 0) || rate === null || !(rate >= 0)) return null;
  const f = unit === "sqft" || unit === "lnft" ? 10000 : 100;
  return Math.round(hours * rate * f) / f;
}

/** What a row sells for per unit on a job line: its own price, else hours × its rate. */
export function catalogUnitPrice(row: CatalogRow, rates: Rates): number | null {
  if (row.unit_price !== null) return row.unit_price;
  return priceFromHours(hoursPerUnit(row), rates[row.rate_type], priceBookUnit(row));
}

export type PriceBookDraft = {
  name: string;
  type: CatalogType;
  unit: PriceBookUnit;
  rateType: RateType;
  /** Your own price; blank means typical hours × the rate. */
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
  rateType: "general",
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
    rateType: row.rate_type,
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
  if (!name) return { ok: false, error: "Give it a name." };
  if (BUILT_IN_NAMES.includes(name.toLowerCase()))
    return { ok: false, error: `"${name}" is built in. Name the work instead, like "Patch drywall".` };

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
    rate_type: d.rateType,
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
    return { ok: false, error: "Old estimates price this from its hours; enter them." };

  if (d.type === "MEASURED") {
    if (!MEASURED_UNITS.includes(d.unit))
      return { ok: false, error: "Measured work is per sq ft, ln ft or each." };
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

/** The two built-in hourly lines; a price-book row can't take their names. */
export const LABOR_HOURLY = "Labor, hourly";
export const SKILLED_HOURLY = "Skilled labor, hourly";
const BUILT_IN_NAMES = [LABOR_HOURLY.toLowerCase(), SKILLED_HOURLY.toLowerCase()];

/**
 * "Save to price book" from an hourly job line: a job-lines-only row sold
 * each, priced at its hours × the chosen rate.
 */
export function rowFromHourlyLine(input: {
  name: string;
  hours: string;
  rateType: RateType;
}): { ok: true; row: CatalogWrite } | { ok: false; error: string } {
  if (input.hours.trim() === "") return { ok: false, error: "Enter the hours the work usually takes." };
  return draftToRow({ ...EMPTY_DRAFT, name: input.name, hours: input.hours, rateType: input.rateType });
}
