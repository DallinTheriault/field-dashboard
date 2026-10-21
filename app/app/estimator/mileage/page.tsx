import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/permissions/current-role";
import { canViewSettings } from "@/lib/permissions/roles";
import { getTenantFeatureFlags } from "@/lib/features/flags";
import { FeatureDisabledPanel } from "@/components/ui/feature-disabled-panel";
import { dayKeyInTz, getTenantTimezone } from "@/lib/dates";
import { syncDayTrips } from "@/lib/mileage/sync";
import { loadBases, loadRatePeriods, loadTrips } from "@/lib/mileage/trips";
import { yearTotals } from "@/lib/mileage/plan";
import { jobsWithoutSiteDays } from "@/lib/mileage/catch-up";
import { MileageClient } from "./mileage-client";

/**
 * Mileage, for taxes only: one round trip per day on site, worked out from
 * the hours logged (or the days entered), from the base in effect that day.
 * Never on an estimate or invoice, never in the P&L net.
 */
export default async function MileagePage({ searchParams }: { searchParams: Promise<{ y?: string }> }) {
  const [session, flags, tz, { y: yParam }] = await Promise.all([
    getCurrentUserRole(),
    getTenantFeatureFlags(),
    getTenantTimezone(),
    searchParams,
  ]);
  if (!session) redirect("/login");
  if (!canViewSettings(session.role)) redirect("/app");
  if (!flags.estimator) return <FeatureDisabledPanel featureName="Business" />;

  const today = dayKeyInTz(new Date(), tz);
  const currentYear = Number(today.slice(0, 4));
  const year = /^\d{4}$/.test(yParam ?? "") ? Number(yParam) : currentYear;

  // Bring the automatic trips up to date from what's cached; anything that
  // needs a lookup is worked out by the page right after it loads.
  await syncDayTrips(createAdminClient(), session.clientId, { network: false, tz });

  const supabase = await createClient();
  const [trips, bases, rates, catchUp] = await Promise.all([
    loadTrips(supabase, year, { includeRemoved: true }),
    loadBases(supabase),
    loadRatePeriods(supabase),
    jobsWithoutSiteDays(supabase, year, tz),
  ]);
  const totals = yearTotals(
    trips.filter((t) => t.kind !== "removed"),
    rates,
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <Link href="/app/estimator" className="inline-flex items-center gap-1.5 text-2xs text-bone-400 hover:text-bone-100">
        <ArrowLeft size={12} />
        Business
      </Link>

      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-bone-50">Mileage</h1>
          <p className="text-sm text-bone-400 mt-1">
            One round trip for each day on site, from the hours you log. For taxes only: never on an estimate or invoice.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Link href={`/app/estimator/mileage?y=${year - 1}`} className="btn-secondary h-8 w-8 px-0" aria-label="Previous year">
            <ChevronLeft size={14} />
          </Link>
          <span className="num text-sm text-bone-100 px-2">{year}</span>
          <Link href={`/app/estimator/mileage?y=${year + 1}`} className="btn-secondary h-8 w-8 px-0" aria-label="Next year">
            <ChevronRight size={14} />
          </Link>
        </div>
      </header>

      <MileageClient
        year={year}
        today={today}
        trips={trips}
        totals={totals}
        bases={bases}
        rates={rates}
        catchUpCount={catchUp.length}
      />
    </div>
  );
}
