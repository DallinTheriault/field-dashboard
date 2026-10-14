import { priceBookUnit, type CatalogType, type PriceBookUnit } from "@/lib/estimator/price-book";

/**
 * Job lines are the job's tasks with a price (v095). Pure helpers shared by
 * the scope builder and, later, invoice creation. Money stays in dollars to
 * match the price book; totals are rounded to the cent per line.
 */

export type LineUnit = PriceBookUnit;

export type LinePrice = {
  qty: number;
  unit_price: number | null;
  billable: boolean;
};

/** qty × unit price, to the cent. Null when the line has no price. */
export function lineTotal(qty: number, unitPrice: number | null): number | null {
  if (unitPrice === null) return null;
  return Math.round(qty * unitPrice * 100) / 100;
}

/** The running total: billable lines that have a price. */
export function jobTotal(lines: LinePrice[]): number {
  const cents = lines.reduce((sum, l) => {
    const t = l.billable ? lineTotal(l.qty, l.unit_price) : null;
    return t === null ? sum : sum + Math.round(t * 100);
  }, 0);
  return cents / 100;
}

/**
 * A line with a unit is meant to be sold; without a price it can't bill yet.
 * A plain reminder ("bring ladder") has no unit and never needs a price.
 */
export function needsPrice(line: { unit: LineUnit | null; unit_price: number | null }): boolean {
  return line.unit !== null && line.unit_price === null;
}

/** Hours step by half an hour; everything else by one. */
export function qtyStep(unit: LineUnit | null): number {
  return unit === "hour" ? 0.5 : 1;
}

/** One stepper tap. Never goes to zero; remove the line instead. */
export function stepQty(qty: number, dir: 1 | -1, unit: LineUnit | null): number {
  const step = qtyStep(unit);
  const next = Math.round((qty + dir * step) * 1000) / 1000;
  return next >= step ? next : qty;
}

/** "$1,250.50", "1250.5", " 95 " → number; blank → null; junk → NaN. */
export function parseMoney(input: string): number | null {
  const s = input.replace(/[$,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : Number.NaN;
}

/**
 * Setting a line's price. The first price on an unpriced line also makes it
 * billable: a line only exists unpriced because it couldn't bill yet.
 * Clearing the price makes it non-billable, which the database requires.
 */
export function withPrice<T extends LinePrice>(line: T, price: number | null): T {
  if (price === null) return { ...line, unit_price: null, billable: false };
  return { ...line, unit_price: price, billable: line.unit_price === null ? true : line.billable };
}

export const UNIT_SHORT: Record<LineUnit, string> = {
  each: "ea",
  hour: "hr",
  sqft: "sqft",
  lnft: "lnft",
};

/** "3", "1.5 hr", "400 sqft". A count of "each" needs no unit. */
export function formatQty(qty: number, unit: LineUnit | null): string {
  const n = Number.isInteger(qty) ? String(qty) : String(Math.round(qty * 1000) / 1000);
  return !unit || unit === "each" ? n : `${n} ${UNIT_SHORT[unit]}`;
}

// --- Picking from the price book -----------------------------------------------

export type PriceBookEntry = {
  /** null for the built-in "Labor, hourly". */
  id: number | null;
  name: string;
  unit: LineUnit;
  unit_price: number | null;
};

export const LABOR_HOURLY = "Labor, hourly";

/** The picker's list: the built-in hourly line plus active price-book rows. */
export function pickerEntries(
  rows: Array<{ id: number; name: string; type: CatalogType; unit: LineUnit | null; unit_price: number | null }>,
  hourlyRate: number | null,
): PriceBookEntry[] {
  return [
    { id: null, name: LABOR_HOURLY, unit: "hour" as const, unit_price: hourlyRate },
    ...rows.map((r) => ({ id: r.id, name: r.name, unit: priceBookUnit(r), unit_price: r.unit_price })),
  ];
}

/**
 * Entries matching every word typed, recently used first (most recent
 * first), then alphabetical. An empty query lists everything that way.
 */
export function rankEntries(
  entries: PriceBookEntry[],
  query: string,
  recentIds: number[],
): PriceBookEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const rank = new Map(recentIds.map((id, i) => [id, i]));
  return entries
    .filter((e) => words.every((w) => e.name.toLowerCase().includes(w)))
    .sort((a, b) => {
      const ra = a.id === null ? undefined : rank.get(a.id);
      const rb = b.id === null ? undefined : rank.get(b.id);
      if (ra !== undefined || rb !== undefined) {
        if (ra === undefined) return 1;
        if (rb === undefined) return -1;
        return ra - rb;
      }
      return a.name.localeCompare(b.name);
    });
}

/** Most recent first, each id once, from tasks newest-first. */
export function recentServiceIds(rows: Array<{ service_id: number | null }>, limit = 8): number[] {
  const out: number[] = [];
  for (const r of rows) {
    if (r.service_id !== null && !out.includes(r.service_id)) out.push(r.service_id);
    if (out.length === limit) break;
  }
  return out;
}

export type NewLine = {
  title: string;
  service_id: number | null;
  qty: number;
  unit: LineUnit | null;
  unit_price: number | null;
  billable: boolean;
};

/** One tap on an entry: qty 1 at the entry's price, billable when priced. */
export function lineFromEntry(e: PriceBookEntry): NewLine {
  return {
    title: e.name,
    service_id: e.id,
    qty: 1,
    unit: e.unit,
    unit_price: e.unit_price,
    billable: e.unit_price !== null,
  };
}

/**
 * A one-off line: a flat price, hours at the default hourly rate, or with no
 * amount a reminder that never bills.
 */
export function customLine(
  title: string,
  mode: "price" | "hours",
  amount: number | null,
  hourlyRate: number | null,
): NewLine {
  if (amount === null) {
    return { title, service_id: null, qty: 1, unit: null, unit_price: null, billable: false };
  }
  if (mode === "hours") {
    return {
      title,
      service_id: null,
      qty: amount,
      unit: "hour",
      unit_price: hourlyRate,
      billable: hourlyRate !== null,
    };
  }
  return { title, service_id: null, qty: 1, unit: "each", unit_price: amount, billable: true };
}
