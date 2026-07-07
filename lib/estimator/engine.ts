/**
 * PRICING ENGINE — the product. Implements EXACTLY the spec math
 * (Docs/ESTIMATOR_SPEC.md → "Pricing engine"). Pure functions, no I/O:
 * the server builds inputs from the DB, the estimate builder runs the same
 * code client-side for the live running total. Every branch is unit-tested;
 * a silent regression here destroys the app's reason to exist.
 */

export type EngineBasis = "COVERAGE" | "PER_UNIT" | "FLAT";

export interface EngineSettings {
  loadedLaborRate: number;
  /** 0–1. price = cost / (1 − margin). MARGIN math — cost × (1+m) is WRONG. */
  marginPct: number;
  /** 0 = margin applies uniformly to total cost (spec default). */
  materialMarkupPct: number;
  minimumJobCharge: number;
  /** Final price rounds UP to nearest increment. */
  roundingIncrement: number;
}

export interface EngineMaterialInput {
  /** For display/snapshot mapping only — engine does not resolve IDs. */
  materialId?: number | null;
  name?: string;
  basis: EngineBasis;
  /** COVERAGE */
  coats?: number | null;
  coverageSqftPerUnit?: number | null;
  /** PER_UNIT */
  qtyPerUnit?: number | null;
  /** FLAT */
  flatQty?: number | null;
  unitCost: number;
  /** Purchase granularity; qty rounds UP to multiples of this. Default 1. */
  purchasableUnitSize?: number | null;
}

export interface EngineLineInput {
  /** For snapshot mapping only. */
  key?: string | number;
  type: "MEASURED" | "TASK";
  /**
   * MEASURED: measured quantity (sqft/lnft/each).
   * TASK: count of the task (2 × toilet swap). Spec formula is qty-less for
   * TASK; qty=1 reproduces it exactly, qty>1 = repeat the task.
   */
  qty: number;
  /** MEASURED only. */
  laborHoursPerUnit?: number | null;
  /** TASK only. */
  flatLaborHours?: number | null;
  /** Prep applies to LABOR ONLY, never materials. Default 1. */
  prepMultiplier?: number | null;
  materials: EngineMaterialInput[];
}

export interface EngineMaterialResult {
  materialId?: number | null;
  name?: string;
  /** Exact consumption before purchase rounding. */
  unitsRaw: number;
  /** What actually gets bought — ALWAYS rounded up to purchasable units. */
  unitsPurchased: number;
  unitCost: number;
  total: number;
}

export interface EngineLineResult {
  key?: string | number;
  baseHours: number;
  laborHours: number;
  laborCost: number;
  materials: EngineMaterialResult[];
  materialCost: number;
  lineCost: number;
}

export interface JobPricingInput {
  lines: EngineLineInput[];
  /** Materials added at job level, already expressed as raw units. */
  extraMaterials?: EngineMaterialInput[];
  travelFee: number;
}

export interface JobPricingResult {
  lines: EngineLineResult[];
  extraMaterials: EngineMaterialResult[];
  laborCost: number;
  /** Before material markup. */
  materialCost: number;
  /** After material markup (identical when markup = 0). */
  materialCostMarked: number;
  travelFee: number;
  jobCost: number;
  rawPrice: number;
  /** Final: max(raw, minimum) rounded UP to increment. */
  price: number;
  minimumApplied: boolean;
  marginPct: number;
  /** price / cost − 1 — shown in owner view next to margin. */
  effectiveMarkupPct: number;
}

const EPS = 1e-9;

/** Round up to a multiple of `step` (float-safe: 3.0000000001 → 3, not 3+step). */
export function roundUpTo(value: number, step: number): number {
  if (step <= 0) return value;
  const scaled = value / step;
  return Math.ceil(scaled - EPS) * step;
}

function round2(n: number): number {
  return Math.round((n + EPS) * 100) / 100;
}

export function priceMaterial(
  m: EngineMaterialInput,
  lineQty: number,
  lineType: "MEASURED" | "TASK",
): EngineMaterialResult {
  let unitsRaw = 0;
  switch (m.basis) {
    case "COVERAGE": {
      // units = qty × coats / coverage — sqft-measured lines only in practice
      const coverage = m.coverageSqftPerUnit ?? 0;
      const coats = Math.max(1, m.coats ?? 1);
      unitsRaw = coverage > 0 ? (lineQty * coats) / coverage : 0;
      break;
    }
    case "PER_UNIT":
      unitsRaw = lineQty * (m.qtyPerUnit ?? 0);
      break;
    case "FLAT":
      // Flat per line; for TASK lines the count repeats the task, so flat
      // materials repeat with it. MEASURED flat = once per line.
      unitsRaw = (m.flatQty ?? 0) * (lineType === "TASK" ? lineQty : 1);
      break;
  }

  const step = m.purchasableUnitSize && m.purchasableUnitSize > 0 ? m.purchasableUnitSize : 1;
  const unitsPurchased = unitsRaw > 0 ? roundUpTo(unitsRaw, step) : 0;
  return {
    materialId: m.materialId,
    name: m.name,
    unitsRaw,
    unitsPurchased,
    unitCost: m.unitCost,
    total: round2(unitsPurchased * m.unitCost),
  };
}

export function priceLine(
  line: EngineLineInput,
  settings: Pick<EngineSettings, "loadedLaborRate">,
): EngineLineResult {
  const baseHours =
    line.type === "MEASURED"
      ? line.qty * (line.laborHoursPerUnit ?? 0)
      : (line.flatLaborHours ?? 0) * (line.qty || 1);

  const prep = line.prepMultiplier && line.prepMultiplier > 0 ? line.prepMultiplier : 1;
  const laborHours = baseHours * prep; // prep applies to labor ONLY
  const laborCost = round2(laborHours * settings.loadedLaborRate);

  const materials = line.materials.map((m) => priceMaterial(m, line.qty, line.type));
  const materialCost = round2(materials.reduce((s, m) => s + m.total, 0));

  return {
    key: line.key,
    baseHours,
    laborHours,
    laborCost,
    materials,
    materialCost,
    lineCost: round2(laborCost + materialCost),
  };
}

export function priceJob(
  input: JobPricingInput,
  settings: EngineSettings,
): JobPricingResult {
  const lines = input.lines.map((l) => priceLine(l, settings));
  const extraMaterials = (input.extraMaterials ?? []).map((m) =>
    priceMaterial(m, 1, "MEASURED"),
  );

  const laborCost = round2(lines.reduce((s, l) => s + l.laborCost, 0));
  const materialCost = round2(
    lines.reduce((s, l) => s + l.materialCost, 0) +
      extraMaterials.reduce((s, m) => s + m.total, 0),
  );
  const materialCostMarked = round2(materialCost * (1 + (settings.materialMarkupPct || 0)));
  const travelFee = round2(input.travelFee || 0);

  const jobCost = round2(laborCost + materialCostMarked + travelFee);

  const margin = Math.min(Math.max(settings.marginPct, 0), 0.95);
  const rawPrice = round2(jobCost / (1 - margin));

  const afterMin = Math.max(rawPrice, settings.minimumJobCharge);
  const price = round2(roundUpTo(afterMin, settings.roundingIncrement || 1));

  return {
    lines,
    extraMaterials,
    laborCost,
    materialCost,
    materialCostMarked,
    travelFee,
    jobCost,
    rawPrice,
    price,
    minimumApplied: rawPrice < settings.minimumJobCharge,
    marginPct: margin,
    effectiveMarkupPct: jobCost > 0 ? price / jobCost - 1 : 0,
  };
}

export interface ClientRow {
  kind: "line" | "extras" | "travel";
  /** Present for kind "line" — matches EngineLineInput.key. */
  key?: string | number;
  amount: number;
}

/**
 * Client-facing amounts: each scope line at margin, plus an extras row and a
 * travel row when present. The min-charge/rounding delta is folded into the
 * LARGEST row so the rows sum EXACTLY to the final price. No internals leak
 * (hours, rates, margin, cost stay owner-only).
 */
export function allocateClientRows(result: JobPricingResult): {
  rows: ClientRow[];
  total: number;
} {
  const margin = result.marginPct;
  const rows: ClientRow[] = result.lines.map((l) => ({
    kind: "line" as const,
    key: l.key,
    amount: round2(l.lineCost / (1 - margin)),
  }));

  const extrasCost = result.extraMaterials.reduce((s, m) => s + m.total, 0);
  if (extrasCost > 0) {
    rows.push({ kind: "extras", amount: round2(extrasCost / (1 - margin)) });
  }
  if (result.travelFee > 0) {
    rows.push({ kind: "travel", amount: round2(result.travelFee / (1 - margin)) });
  }

  const sum = round2(rows.reduce((s, r) => s + r.amount, 0));
  const delta = round2(result.price - sum);
  if (rows.length > 0 && Math.abs(delta) > 0.004) {
    const largest = rows.reduce((a, b) => (b.amount > a.amount ? b : a));
    largest.amount = round2(largest.amount + delta);
  }

  return { rows, total: result.price };
}
