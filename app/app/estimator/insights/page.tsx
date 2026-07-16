import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, TrendingDown, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/permissions/current-role";
import { canViewSettings } from "@/lib/permissions/roles";
import { getTenantFeatureFlags } from "@/lib/features/flags";
import { FeatureDisabledPanel } from "@/components/ui/feature-disabled-panel";
import { getInsightsData } from "@/lib/estimator/insights-data";
import { isApplyWorthy } from "@/lib/estimator/insights";
import { ApplyRateButton } from "./apply-rate-button";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function pctLabel(p: number | null): string {
  if (p === null) return "—";
  const sign = p > 0 ? "+" : "";
  return `${sign}${Math.round(p * 100)}%`;
}

function pctTone(p: number | null): string {
  if (p === null) return "text-bone-400";
  if (Math.abs(p) < 0.1) return "text-status-completed";
  return p > 0 ? "text-status-danger" : "text-status-scheduled";
}

/**
 * Insights — estimated vs actual, and the feedback loop that corrects the
 * catalog. Everything here is pricing internals: owner/manager only.
 */
export default async function InsightsPage() {
  const [session, flags] = await Promise.all([
    getCurrentUserRole(),
    getTenantFeatureFlags(),
  ]);
  if (!session) redirect("/login");
  if (!canViewSettings(session.role)) redirect("/app");
  if (!flags.estimator) return <FeatureDisabledPanel featureName="Estimator" />;

  const supabase = await createClient();
  const { jobRows, catalogRows } = await getInsightsData(supabase);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <Link
        href="/app/estimator"
        className="inline-flex items-center gap-1.5 text-2xs text-bone-400 hover:text-bone-100"
      >
        <ArrowLeft size={12} />
        Estimator
      </Link>
      <header>
        <h1 className="text-xl font-semibold text-bone-50">Insights</h1>
        <p className="text-sm text-bone-400 mt-1">
          Log hours and materials on jobs; this page compares them against the
          frozen estimates and suggests corrected catalog rates.
        </p>
      </header>

      {/* Catalog corrections — the payoff */}
      <section className="panel">
        <div className="px-4 py-3 border-b border-line">
          <h2 className="text-sm font-semibold text-bone-100">
            Catalog vs reality
          </h2>
          <p className="text-2xs text-bone-400 mt-0.5">
            Actual hours attributed to catalog items by their estimated share,
            across completed/paid jobs. Applying a suggestion changes future
            estimates only.
          </p>
        </div>
        <div className="px-4 py-3">
          {catalogRows.length === 0 ? (
            <p className="text-xs text-bone-400">
              Nothing to learn from yet — finish a job (completed or paid) with
              logged hours and catalog line items, then check back.
            </p>
          ) : (
            <ul className="space-y-3">
              {catalogRows.map((r) => {
                const over = r.ratio > 1;
                const unitLabel =
                  r.service.type === "MEASURED"
                    ? `hr/${r.service.unit}`
                    : "hr";
                const suggestedLabel = `${r.suggestedRate} ${unitLabel}`;
                return (
                  <li
                    key={r.service.id}
                    className="bg-ink-2 rounded-sm shadow-inset-line px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2">
                      {over ? (
                        <TrendingUp size={14} className="text-status-danger shrink-0" />
                      ) : (
                        <TrendingDown size={14} className="text-status-scheduled shrink-0" />
                      )}
                      <span className="flex-1 text-sm text-bone-100 truncate">
                        {r.service.name}
                      </span>
                      <span className={`num text-sm ${pctTone(r.ratio - 1)}`}>
                        {pctLabel(r.ratio - 1)} hours
                      </span>
                    </div>
                    <div className="text-2xs text-bone-400 mt-1 ml-6">
                      {r.attributedActualHours} actual vs {r.estHours} estimated
                      hrs over {r.jobCount} job{r.jobCount === 1 ? "" : "s"} ·
                      current {r.currentRate} {unitLabel}
                    </div>
                    {isApplyWorthy(r) && (
                      <div className="mt-2 ml-6 flex items-center gap-2">
                        <span className="text-2xs text-bone-300">
                          Suggested: <span className="num">{suggestedLabel}</span>
                        </span>
                        <ApplyRateButton
                          serviceId={r.service.id}
                          suggestedLabel={suggestedLabel}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Per-job variance */}
      <section className="panel">
        <div className="px-4 py-3 border-b border-line">
          <h2 className="text-sm font-semibold text-bone-100">
            Jobs — estimated vs actual
          </h2>
        </div>
        <div className="px-4 py-3">
          {jobRows.length === 0 ? (
            <p className="text-xs text-bone-400">
              No actuals logged yet. Open a job and log hours as you work —
              date defaults to today, one thumb, two taps.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-bone-400 text-2xs uppercase tracking-wide">
                  <th className="text-left font-medium py-1.5">Job</th>
                  <th className="text-right font-medium py-1.5">Hours</th>
                  <th className="text-right font-medium py-1.5">Cost</th>
                  <th className="text-right font-medium py-1.5">Δ</th>
                </tr>
              </thead>
              <tbody>
                {jobRows.map((v) => (
                  <tr key={v.jobId} className="border-t border-line-subtle">
                    <td className="py-2 pr-2">
                      <Link
                        href={`/app/jobs/${v.jobId}`}
                        prefetch={false}
                        className="text-bone-100 hover:text-field-400 truncate"
                      >
                        {v.jobName}
                      </Link>
                      {!v.learnable && (
                        <span className="ml-2 text-2xs text-bone-500">
                          in progress
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right num text-bone-300">
                      {v.actualHours}
                      <span className="text-bone-500"> / {v.estHours}</span>
                    </td>
                    <td className="py-2 text-right num text-bone-300">
                      {usd.format(v.actualCost)}
                      <span className="text-bone-500">
                        {" "}
                        / {usd.format(v.estCost)}
                      </span>
                    </td>
                    <td
                      className={`py-2 text-right num ${pctTone(v.costVariancePct)}`}
                    >
                      {pctLabel(v.costVariancePct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
