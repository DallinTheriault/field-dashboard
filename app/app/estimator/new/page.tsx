import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/permissions/current-role";
import { canViewSettings } from "@/lib/permissions/roles";
import { getTenantFeatureFlags } from "@/lib/features/flags";
import { FeatureDisabledPanel } from "@/components/ui/feature-disabled-panel";
import { getEstimatorBundle } from "@/lib/estimator/queries";
import { EstimateBuilder } from "../estimate-builder";

/**
 * New estimate. `?job=<id>` attaches to an existing Field job (the
 * call → estimate flow); without it, saving creates the job + contact.
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

  const supabase = await createClient();
  const bundle = await getEstimatorBundle(supabase);

  const { job: jobParam } = await searchParams;
  let job: { id: number; name: string | null; address: string | null } | null =
    null;
  if (jobParam) {
    const { data } = await supabase
      .from("jobs")
      .select("id, name, address")
      .eq("id", Number(jobParam))
      .maybeSingle();
    job = data ?? null;
  }

  return <EstimateBuilder bundle={bundle} job={job} existing={null} />;
}
