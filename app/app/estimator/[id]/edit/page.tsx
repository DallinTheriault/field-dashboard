import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/permissions/current-role";
import { canViewSettings } from "@/lib/permissions/roles";
import { getTenantFeatureFlags } from "@/lib/features/flags";
import { FeatureDisabledPanel } from "@/components/ui/feature-disabled-panel";
import { getEstimatorBundle } from "@/lib/estimator/queries";
import type { RawLine } from "@/lib/estimator/assemble";
import { EstimateBuilder } from "../../estimate-builder";

/** Edit = the sanctioned re-snapshot path. Raw inputs load; save re-freezes. */
export default async function EditEstimatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [session, flags] = await Promise.all([
    getCurrentUserRole(),
    getTenantFeatureFlags(),
  ]);
  if (!session) redirect("/login");
  if (!canViewSettings(session.role)) redirect("/app");
  if (!flags.estimator) return <FeatureDisabledPanel featureName="Estimator" />;

  const { id } = await params;
  const estimateId = Number(id);
  if (!Number.isInteger(estimateId)) notFound();

  const supabase = await createClient();
  const [bundle, { data: est }, { data: lineRows }] = await Promise.all([
    getEstimatorBundle(supabase),
    supabase
      .from("estimates")
      .select(
        "id, job_id, status, billing_entity_id, travel_zone_id, notes, manual_override_price, override_reason, jobs(id, name, address)",
      )
      .eq("id", estimateId)
      .maybeSingle(),
    supabase
      .from("estimate_line_items")
      .select(
        "service_id, description, type, qty, unit, prep_modifier_id, resolved_hours_per_unit, sort_order",
      )
      .eq("estimate_id", estimateId)
      .order("sort_order"),
  ]);

  if (!est) notFound();
  if (est.status === "accepted" || est.status === "lost") {
    redirect(`/app/estimator/${estimateId}`);
  }

  const job = est.jobs as unknown as {
    id: number;
    name: string | null;
    address: string | null;
  } | null;

  const rawLines: RawLine[] = (lineRows ?? []).map((r, i) => ({
    key: String(i),
    serviceId: r.service_id,
    description: r.description,
    type: r.type as RawLine["type"],
    qty: Number(r.qty),
    unit: r.unit,
    hoursPerUnit:
      r.service_id === null
        ? r.resolved_hours_per_unit === null
          ? null
          : Number(r.resolved_hours_per_unit)
        : null,
    prepModifierId: r.prep_modifier_id,
  }));

  return (
    <EstimateBuilder
      bundle={bundle}
      job={job ?? { id: est.job_id, name: null, address: null }}
      existing={{
        estimateId: est.id,
        billingEntityId: est.billing_entity_id,
        travelZoneId: est.travel_zone_id,
        notes: est.notes ?? "",
        overridePrice:
          est.manual_override_price === null
            ? null
            : Number(est.manual_override_price),
        overrideReason: est.override_reason ?? "",
        rawLines,
      }}
    />
  );
}
