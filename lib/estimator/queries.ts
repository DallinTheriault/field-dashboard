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
  const [settings, services, materials, links, modifiers, entities] =
    await Promise.all([
      // The same pricing settings as the rest of Field (Business › Pricing).
      supabase
        .from("pricing_settings")
        .select("default_hourly_rate, skilled_hourly_rate, material_markup_pct, minimum_job_charge")
        .maybeSingle().throwOnError(),
      supabase
        .from("service_catalog")
        .select(
          "id, name, type, unit, labor_hours_per_unit, flat_labor_hours, is_placeholder, active, rate_type",
        )
        // PRICED rows sell at a fixed price; the engine only prices from hours.
        .in("type", ["MEASURED", "TASK"])
        .eq("active", true)
        .order("name").throwOnError(),
      supabase
        .from("materials")
        .select(
          "id, name, unit, unit_cost, coverage_sqft_per_unit, purchasable_unit_size, active",
        )
        .eq("active", true).throwOnError(),
      supabase
        .from("service_materials")
        .select("id, service_id, material_id, basis, coats, qty_per_unit, flat_qty").throwOnError(),
      supabase
        .from("price_modifiers")
        .select("id, name, scope, math, value, active")
        .eq("active", true)
        .order("value").throwOnError(),
      supabase
        .from("billing_entities")
        .select("id, name, invoice_prefix, is_default, active")
        .eq("active", true)
        .order("created_at").throwOnError(),
    ]);

  const s = settings.data;
  return {
    settings: s
      ? {
          default_hourly_rate: s.default_hourly_rate === null ? null : Number(s.default_hourly_rate),
          skilled_hourly_rate: s.skilled_hourly_rate === null ? null : Number(s.skilled_hourly_rate),
          material_markup_pct: Number(s.material_markup_pct ?? 0),
          minimum_job_charge: Number(s.minimum_job_charge ?? 0),
        }
      : null,
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
    entities: entities.data ?? [],
  };
}
