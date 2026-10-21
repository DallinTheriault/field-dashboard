import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/permissions/current-role";
import { canViewSettings } from "@/lib/permissions/roles";
import { getTenantFeatureFlags } from "@/lib/features/flags";
import { FeatureDisabledPanel } from "@/components/ui/feature-disabled-panel";
import { StatusChip } from "@/components/ui/status-chip";
import { dayKeyInTz, getTenantTimezone } from "@/lib/dates";
import { jobsWithoutSiteDays } from "@/lib/mileage/catch-up";
import { CatchUpRow } from "./catch-up-row";

/**
 * One-time catch-up: every job in the year with no days on site (no hours
 * logged, no days entered). Fill in the days you were there, or say you
 * weren't; each saved day becomes a trip.
 */
export default async function MileageCatchUpPage({ searchParams }: { searchParams: Promise<{ y?: string }> }) {
  const [session, flags, tz, { y }] = await Promise.all([
    getCurrentUserRole(),
    getTenantFeatureFlags(),
    getTenantTimezone(),
    searchParams,
  ]);
  if (!session) redirect("/login");
  if (!canViewSettings(session.role)) redirect("/app");
  if (!flags.estimator) return <FeatureDisabledPanel featureName="Business" />;
  const year = /^\d{4}$/.test(y ?? "") ? Number(y) : Number(dayKeyInTz(new Date(), tz).slice(0, 4));
  const jobs = await jobsWithoutSiteDays(await createClient(), year, tz);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <Link
        href={`/app/estimator/mileage?y=${year}`}
        className="inline-flex items-center gap-1.5 text-2xs text-bone-400 hover:text-bone-100"
      >
        <ArrowLeft size={12} />
        Mileage
      </Link>
      <header>
        <h1 className="text-xl font-semibold text-bone-50">Days on site, {year}</h1>
        <p className="text-sm text-bone-400 mt-1">
          These jobs have no hours logged, so Field doesn&apos;t know which days you were there. Each day you tick
          becomes one round trip.
        </p>
      </header>
      {jobs.length === 0 ? (
        <p className="panel px-4 py-6 text-sm text-bone-400 text-center">Every {year} job has its days. Nothing to catch up.</p>
      ) : (
        <ul className="space-y-3" data-testid="catch-up">
          {jobs.map((j) => (
            <li key={j.id} className="panel px-4 py-3 space-y-3" data-job={j.id}>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-bone-100 break-words">{j.label}</div>
                  {j.address && <div className="text-2xs text-bone-400 break-words">{j.address}</div>}
                </div>
                <StatusChip status={j.status} />
                {j.archived && <span className="chip normal-case tracking-normal border-line-strong text-bone-500">archived</span>}
              </div>
              <CatchUpRow jobId={j.id} days={j.days} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
