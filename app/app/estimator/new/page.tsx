import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/permissions/current-role";
import { canViewSettings } from "@/lib/permissions/roles";
import { getTenantFeatureFlags } from "@/lib/features/flags";
import { FeatureDisabledPanel } from "@/components/ui/feature-disabled-panel";
import { getEstimatorBundle } from "@/lib/estimator/queries";
import { EstimateBuilder } from "../estimate-builder";

/**
 * New estimate for an existing job — `?job=<id>` is required. Jobs are the
 * root object: there is no standalone-estimate path. Create the job first
 * (name/phone/address is enough), then estimate it.
 */
export default async function NewEstimatePage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string }>;
}) {
  const [session, flags] = await Promise.all([
    getCurrentUserRole(),
    getTenantFeatureFlags(),
  ]);
  if (!session) redirect("/login");
  if (!canViewSettings(session.role)) redirect("/app");
  if (!flags.estimator) {
    return <FeatureDisabledPanel featureName="Estimator" />;
  }

  const { job: jobParam } = await searchParams;
  const jobId = Number(jobParam);
  if (!jobParam || !Number.isInteger(jobId)) redirect("/app/jobs");

  const supabase = await createClient();
  const [bundle, { data: job }, { data: tasks }] = await Promise.all([
    getEstimatorBundle(supabase),
    supabase
      .from("jobs")
      .select("id, name, address")
      .eq("id", jobId)
      .maybeSingle(),
    supabase
      .from("tasks")
      .select("id, title, status")
      .eq("job_id", jobId)
      .order("sort_order")
      .order("id"),
  ]);
  if (!job) redirect("/app/jobs");

  return (
    <EstimateBuilder
      bundle={bundle}
      job={job}
      tasks={(tasks ?? []) as Array<{ id: number; title: string; status: "open" | "done" }>}
      existing={null}
    />
  );
}
