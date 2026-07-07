"use server";

import { revalidatePath } from "next/cache";
import { requireWriter } from "@/lib/estimator/auth";
import { getInsightsData } from "@/lib/estimator/insights-data";
import { isApplyWorthy } from "@/lib/estimator/insights";

type Result = { ok: true; newRate?: number } | { ok: false; error: string };

/**
 * One-click "Apply to catalog": recomputes the suggestion SERVER-SIDE (a
 * client-passed rate is never trusted) and writes it as the new production
 * rate. A Settings change — saved estimates keep their frozen snapshots;
 * only future estimates price with the corrected rate.
 */
export async function applySuggestedRate(serviceId: number): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const { catalogRows } = await getInsightsData(supabase);
  const row = catalogRows.find((r) => r.service.id === Number(serviceId));
  if (!row) return { ok: false, error: "No variance data for that catalog item." };
  if (!isApplyWorthy(row)) {
    return { ok: false, error: "Variance is under 10% — not worth changing the rate." };
  }

  const values =
    row.service.type === "MEASURED"
      ? { labor_hours_per_unit: row.suggestedRate }
      : { flat_labor_hours: row.suggestedRate };
  const { error } = await supabase
    .from("service_catalog")
    .update({ ...values, is_placeholder: false })
    .eq("id", row.service.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/estimator/insights");
  revalidatePath("/app/estimator/settings");
  return { ok: true, newRate: row.suggestedRate };
}
