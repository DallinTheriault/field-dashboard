/**
 * Assembly layer between DB rows and the pricing engine. Pure functions —
 * the builder runs them client-side for live totals, and the save action
 * runs the SAME code server-side to produce the authoritative snapshot
 * (the client never sends prices, only raw inputs).
 */
import {
  allocateClientRows,
  priceJob,
  type EngineLineInput,
  type EngineMaterialInput,
  type EngineSettings,
  type JobPricingResult,
  type ClientRow,
} from "./engine";
import { loadedLaborRate, monthlyBillableHours } from "./rates";

export type PricingSettingsRow = {
  desired_annual_owner_pay: number;
  hours_worked_per_week: number;
  utilization_pct: number;
  margin_pct: number;
  material_markup_pct: number;
  minimum_job_charge: number;
  rounding_increment: number;
};

export type ServiceRow = {
  id: number;
  name: string;
  type: "MEASURED" | "TASK";
  unit: string | null;
  labor_hours_per_unit: number | null;
  flat_labor_hours: number | null;
  is_placeholder: boolean;
  active: boolean;
};

export type MaterialRow = {
  id: number;
  name: string;
  unit: string;
  unit_cost: number;
  coverage_sqft_per_unit: number | null;
  purchasable_unit_size: number;
  active: boolean;
};

export type ServiceMaterialRow = {
  id: number;
  service_id: number;
  material_id: number;
  basis: "COVERAGE" | "PER_UNIT" | "FLAT";
  coats: number | null;
  qty_per_unit: number | null;
  flat_qty: number | null;
};

export type ModifierRow = {
  id: number;
  name: string;
  scope: "LINE" | "JOB";
  math: "MULTIPLIER" | "FLAT_ADD";
  value: number;
  active: boolean;
};

export type ZoneRow = {
  id: number;
  label: string;
  flat_fee: number;
  active: boolean;
};

export type EntityRow = {
  id: number;
  name: string;
  invoice_prefix: string;
  is_default: boolean;
  active: boolean;
};

export type EstimatorBundle = {
  settings: PricingSettingsRow | null;
  monthlyOverhead: number;
  services: ServiceRow[];
  materials: MaterialRow[];
  links: ServiceMaterialRow[];
  modifiers: ModifierRow[];
  zones: ZoneRow[];
  entities: EntityRow[];
};

/**
 * A line as the builder edits it — raw inputs only, no prices. This is also
 * exactly what gets persisted alongside the frozen snapshot, so an estimate
 * can be re-priced from its raw inputs later.
 */
export type RawLine = {
  key: string;
  serviceId: number | null; // null = ad-hoc line
  description: string;
  type: "MEASURED" | "TASK";
  qty: number;
  unit: string | null;
  /** Ad-hoc lines only: hours per unit (TASK: per repeat). Catalog lines resolve from the service. */
  hoursPerUnit: number | null;
  prepModifierId: number | null;
  /** Hardware lines: priced from a unit cost, not hours. */
  isHardware?: boolean;
  /** Hardware only: model / SKU (free text, optional). */
  sku?: string | null;
  /** Hardware only: what the part costs the owner, per unit. */
  unitPrice?: number | null;
  /** Hardware only: true = mark up by job margin; false = pass through at cost. */
  hardwareMarkup?: boolean;
};

export function buildEngineSettings(bundle: EstimatorBundle): EngineSettings {
  const s = bundle.settings;
  if (!s) {
    return {
      loadedLaborRate: 0,
      marginPct: 0.4,
      materialMarkupPct: 0,
      minimumJobCharge: 150,
      roundingIncrement: 5,
    };
  }
  const mbh = monthlyBillableHours(s.hours_worked_per_week, s.utilization_pct);
  return {
    loadedLaborRate: loadedLaborRate(
      s.desired_annual_owner_pay,
      bundle.monthlyOverhead,
      mbh,
    ),
    marginPct: s.margin_pct,
    materialMarkupPct: s.material_markup_pct,
    minimumJobCharge: s.minimum_job_charge,
    roundingIncrement: s.rounding_increment,
  };
}

export function prepMultiplierFor(
  prepModifierId: number | null,
  bundle: EstimatorBundle,
): number {
  if (!prepModifierId) return 1;
  const m = bundle.modifiers.find((x) => x.id === prepModifierId);
  return m && m.scope === "LINE" && m.math === "MULTIPLIER" && m.value > 0
    ? m.value
    : 1;
}

/** Resolve one raw line to an engine line input (index used as the key). */
export function toEngineLine(
  raw: RawLine,
  index: number,
  bundle: EstimatorBundle,
): EngineLineInput {
  // Hardware: a part priced from unit cost. passThrough = at-cost (no
  // margin); markup = margined like a material.
  if (raw.isHardware) {
    return {
      key: index,
      type: "TASK",
      kind: "hardware",
      qty: raw.qty,
      hardwareUnitCost: raw.unitPrice ?? 0,
      passThrough: !raw.hardwareMarkup,
      materials: [],
    };
  }

  const service = raw.serviceId
    ? bundle.services.find((s) => s.id === raw.serviceId)
    : undefined;

  const materials: EngineMaterialInput[] = service
    ? bundle.links
        .filter((l) => l.service_id === service.id)
        .flatMap((l) => {
          const mat = bundle.materials.find((m) => m.id === l.material_id);
          if (!mat) return [];
          return [
            {
              materialId: mat.id,
              name: mat.name,
              basis: l.basis,
              coats: l.coats,
              coverageSqftPerUnit: mat.coverage_sqft_per_unit,
              qtyPerUnit: l.qty_per_unit,
              flatQty: l.flat_qty,
              unitCost: mat.unit_cost,
              purchasableUnitSize: mat.purchasable_unit_size,
            },
          ];
        })
    : [];

  if (service) {
    return service.type === "MEASURED"
      ? {
          key: index,
          type: "MEASURED",
          qty: raw.qty,
          laborHoursPerUnit: service.labor_hours_per_unit ?? 0,
          prepMultiplier: prepMultiplierFor(raw.prepModifierId, bundle),
          materials,
        }
      : {
          key: index,
          type: "TASK",
          qty: raw.qty,
          flatLaborHours: service.flat_labor_hours ?? 0,
          prepMultiplier: prepMultiplierFor(raw.prepModifierId, bundle),
          materials,
        };
  }

  // Ad-hoc: first-class. Hours entered directly; TASK semantics (qty repeats).
  return {
    key: index,
    type: "TASK",
    qty: raw.qty,
    flatLaborHours: raw.hoursPerUnit ?? 0,
    prepMultiplier: prepMultiplierFor(raw.prepModifierId, bundle),
    materials: [],
  };
}

export type PricedEstimate = {
  result: JobPricingResult;
  rows: ClientRow[];
  settings: EngineSettings;
  travelFee: number;
};

export function priceEstimate(
  rawLines: RawLine[],
  travelZoneId: number | null,
  bundle: EstimatorBundle,
): PricedEstimate {
  const settings = buildEngineSettings(bundle);
  const zone = travelZoneId
    ? bundle.zones.find((z) => z.id === travelZoneId)
    : undefined;
  const travelFee = zone?.flat_fee ?? 0;
  const result = priceJob(
    {
      lines: rawLines.map((l, i) => toEngineLine(l, i, bundle)),
      travelFee,
    },
    settings,
  );
  const { rows } = allocateClientRows(result);
  return { result, rows, settings, travelFee };
}

/**
 * The exact jsonb payload for the estimator_save_estimate RPC — every
 * resolved_* value the Snapshot Rule requires, frozen from the engine run.
 */
export function buildSavePayload(args: {
  estimateId?: number | null;
  clientId: number;
  jobId: number;
  billingEntityId: number | null;
  travelZoneId: number | null;
  notes: string | null;
  overridePrice: number | null;
  overrideReason: string | null;
  rawLines: RawLine[];
  priced: PricedEstimate;
}) {
  const { priced, rawLines } = args;
  const { result, rows, settings } = priced;

  const lines = rawLines.map((raw, i) => {
    const r = result.lines[i];
    const clientAmount =
      rows.find((x) => x.kind === "line" && x.key === i)?.amount ?? 0;
    if (raw.isHardware) {
      return {
        service_id: null,
        description: raw.description,
        type: "TASK",
        qty: raw.qty,
        unit: null,
        prep_modifier_id: null,
        sort_order: i,
        resolved_prep_multiplier: 1,
        resolved_hours_per_unit: null,
        resolved_labor_hours: 0,
        resolved_loaded_rate: 0,
        resolved_labor_cost: 0,
        resolved_material_cost: 0,
        resolved_line_cost: r.lineCost,
        resolved_client_amount: clientAmount,
        is_hardware: true,
        sku: raw.sku ?? null,
        resolved_unit_price: raw.unitPrice ?? 0,
        hardware_markup: !!raw.hardwareMarkup,
      };
    }
    const hoursPerUnit = raw.serviceId
      ? (r.baseHours && raw.qty > 0 ? r.baseHours / raw.qty : null)
      : raw.hoursPerUnit;
    return {
      service_id: raw.serviceId,
      description: raw.description,
      type: raw.serviceId ? raw.type : "TASK",
      qty: raw.qty,
      unit: raw.unit,
      prep_modifier_id: raw.prepModifierId,
      sort_order: i,
      resolved_prep_multiplier:
        r.baseHours > 0 ? r.laborHours / r.baseHours : 1,
      resolved_hours_per_unit: hoursPerUnit,
      resolved_labor_hours: r.laborHours,
      resolved_loaded_rate: settings.loadedLaborRate,
      resolved_labor_cost: r.laborCost,
      resolved_material_cost: r.materialCost,
      resolved_line_cost: r.lineCost,
      resolved_client_amount: clientAmount,
      is_hardware: false,
      sku: null,
      resolved_unit_price: null,
      hardware_markup: null,
    };
  });

  const materials = result.lines.flatMap((r, i) =>
    r.materials
      .filter((m) => m.unitsPurchased > 0)
      .map((m) => ({
        line_index: i,
        material_id: m.materialId ?? null,
        description: m.name ?? "Material",
        qty: m.unitsPurchased,
        resolved_unit_cost: m.unitCost,
        resolved_total: m.total,
      })),
  );

  return {
    estimate_id: args.estimateId ?? null,
    estimate: {
      client_id: args.clientId,
      job_id: args.jobId,
      billing_entity_id: args.billingEntityId,
      travel_zone_id: args.travelZoneId,
      resolved_loaded_rate: settings.loadedLaborRate,
      resolved_margin_pct: result.marginPct,
      resolved_material_markup_pct: settings.materialMarkupPct,
      resolved_minimum_job_charge: settings.minimumJobCharge,
      resolved_rounding_increment: settings.roundingIncrement,
      resolved_travel_fee: result.travelFee,
      computed_cost: result.jobCost,
      computed_price: result.price,
      manual_override_price: args.overridePrice,
      override_reason: args.overrideReason,
      notes: args.notes,
    },
    lines,
    materials,
  };
}
