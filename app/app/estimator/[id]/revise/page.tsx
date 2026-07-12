import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/permissions/current-role";
import { canViewSettings } from "@/lib/permissions/roles";
import { getTenantFeatureFlags } from "@/lib/features/flags";
import { FeatureDisabledPanel } from "@/components/ui/feature-disabled-panel";
import { getEstimatorBundle } from "@/lib/estimator/queries";
import type { RawLine } from "@/lib/estimator/assemble";
import { EstimateBuilder } from "../../estimate-builder";

/**
 * Revise = start a NEW version of this job's estimate, prefilled from an
 * existing one. The source estimate (usually the accepted scope) is never
 * touched — "this is what was agreed, this is what was performed" both stay
 * on the job. Saving creates version max+1 as a fresh draft.
 */
export default async function ReviseEstimatePage({
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
        "service_id, description, type, qty, unit, prep_modifier_id, resolved_hours_per_unit, sort_order, is_hardware, sku, resolved_unit_price, hardware_markup",
      )
      .eq("estimate_id", estimateId)
      .order("sort_order"),
  ]);

  if (!est) notFound();
  // A draft is directly editable — revising it would just make clutter.
  if (est.status === "draft") {
    redirect(`/app/estimator/${estimateId}/edit`);
  }

  const job = est.jobs as unknown as {
    id: number;
    name: string | null;
    address: string | null;
  } | null;

  const rawLines: RawLine[] = (lineRows ?? []).map((r, i) =>
    r.is_hardware
      ? {
          key: String(i),
          serviceId: null,
          description: r.description,
          type: "TASK",
          qty: Number(r.qty),
          unit: null,
          hoursPerUnit: null,
          prepModifierId: null,
          isHardware: true,
          sku: r.sku,
          unitPrice:
            r.resolved_unit_price === null ? 0 : Number(r.resolved_unit_price),
          hardwareMarkup: !!r.hardware_markup,
        }
      : {
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
          isHardware: false,
        },
  );

  return (
    <EstimateBuilder
      bundle={bundle}
      job={job ?? { id: est.job_id, name: null, address: null }}
      existing={{
        estimateId: null, // save as a new version; source stays frozen
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
