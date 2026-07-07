import type { SupabaseClient } from "@supabase/supabase-js";
import type { EstimatorBundle } from "./assemble";

/**
 * Fetch everything the pricing engine needs for a tenant in one parallel
 * round-trip. RLS scopes every table to the caller's tenant. Used by the
 * builder page (props for live client-side totals) and by the save action
 * (authoritative server-side re-price of the same inputs).
 */
export async function getEstimatorBundle(
  supabase: SupabaseClient,
): Promise<EstimatorBundle> {
  const [settings, overhead, services, materials, links, modifiers, zones, entities] =
    await Promise.all([
      supabase
        .from("pricing_settings")
        .select(
          "desired_annual_owner_pay, hours_worked_per_week, utilization_pct, margin_pct, material_markup_pct, minimum_job_charge, rounding_increment",
        )
        .maybeSingle(),
      supabase
        .from("overhead_items")
        .select("monthly_amount")
        .eq("active", true),
      supabase
        .from("service_catalog")
        .select(
          "id, name, type, unit, labor_hours_per_unit, flat_labor_hours, is_placeholder, active",
        )
        .eq("active", true)
        .order("name"),
      supabase
        .from("materials")
        .select(
          "id, name, unit, unit_cost, coverage_sqft_per_unit, purchasable_unit_size, active",
        )
        .eq("active", true),
      supabase
        .from("service_materials")
        .select("id, service_id, material_id, basis, coats, qty_per_unit, flat_qty"),
      supabase
        .from("price_modifiers")
        .select("id, name, scope, math, value, active")
        .eq("active", true)
        .order("value"),
      supabase
        .from("travel_zones")
        .select("id, label, flat_fee, active")
        .eq("active", true)
        .order("flat_fee"),
      supabase
        .from("billing_entities")
        .select("id, name, invoice_prefix, is_default, active")
        .eq("active", true)
        .order("created_at"),
    ]);

  const s = settings.data;
  return {
    settings: s
      ? {
          desired_annual_owner_pay: Number(s.desired_annual_owner_pay),
          hours_worked_per_week: Number(s.hours_worked_per_week),
          utilization_pct: Number(s.utilization_pct),
          margin_pct: Number(s.margin_pct),
          material_markup_pct: Number(s.material_markup_pct),
          minimum_job_charge: Number(s.minimum_job_charge),
          rounding_increment: Number(s.rounding_increment),
        }
      : null,
    monthlyOverhead: (overhead.data ?? []).reduce(
      (sum, o) => sum + Number(o.monthly_amount || 0),
      0,
    ),
    services: (services.data ?? []).map((x) => ({
      ...x,
      labor_hours_per_unit:
        x.labor_hours_per_unit === null ? null : Number(x.labor_hours_per_unit),
      flat_labor_hours:
        x.flat_labor_hours === null ? null : Number(x.flat_labor_hours),
    })),
    materials: (materials.data ?? []).map((x) => ({
      ...x,
      unit_cost: Number(x.unit_cost),
      coverage_sqft_per_unit:
        x.coverage_sqft_per_unit === null ? null : Number(x.coverage_sqft_per_unit),
      purchasable_unit_size: Number(x.purchasable_unit_size),
    })),
    links: (links.data ?? []).map((x) => ({
      ...x,
      coats: x.coats === null ? null : Number(x.coats),
      qty_per_unit: x.qty_per_unit === null ? null : Number(x.qty_per_unit),
      flat_qty: x.flat_qty === null ? null : Number(x.flat_qty),
    })),
    modifiers: (modifiers.data ?? []).map((x) => ({
      ...x,
      value: Number(x.value),
    })),
    zones: (zones.data ?? []).map((x) => ({
      ...x,
      flat_fee: Number(x.flat_fee),
    })),
    entities: entities.data ?? [],
  };
}
