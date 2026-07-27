import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/permissions/current-role";
import { canViewSettings } from "@/lib/permissions/roles";
import { getTenantFeatureFlags } from "@/lib/features/flags";
import { FeatureDisabledPanel } from "@/components/ui/feature-disabled-panel";
import { dayKeyInTz, getTenantTimezone } from "@/lib/dates";
import { buildRateMap, summarizeMileage } from "@/lib/estimator/mileage";
import { MileageClient, type TripRow } from "./mileage-client";

/**
 * Mileage — the contemporaneous log. Business tab, owner/manager gate.
 * Standard-mileage figures live here and are never summed with actual
 * vehicle expenses (§6.3); the Money page states both separately.
 */
export default async function MileagePage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string }>;
}) {
  const [session, flags, tz, { y: yParam }] = await Promise.all([
    getCurrentUserRole(),
    getTenantFeatureFlags(),
    getTenantTimezone(),
    searchParams,
  ]);
  if (!session) redirect("/login");
  if (!canViewSettings(session.role)) redirect("/app");
  if (!flags.estimator) return <FeatureDisabledPanel featureName="Business" />;

  const currentYear = Number(dayKeyInTz(new Date(), tz).slice(0, 4));
  const year = /^\d{4}$/.test(yParam ?? "") ? Number(yParam) : currentYear;

  const supabase = await createClient();
  const [{ data: tripRows }, { data: rateRows }, { data: settings }, { data: jobRows }] =
    await Promise.all([
      supabase
        .from("mileage_entries")
        .select("id, trip_date, job_id, destination, purpose, miles, vehicle, source, created_at, jobs(job_number, name)")
        .gte("trip_date", `${year}-01-01`)
        .lte("trip_date", `${year}-12-31`)
        .order("trip_date", { ascending: false })
        .order("id", { ascending: false }),
      supabase.from("mileage_rates").select("year, rate_per_mile"),
      supabase.from("pricing_settings").select("mileage_base_address").maybeSingle(),
      supabase
        .from("jobs")
        .select("id, name, job_number, address, status")
        .is("archived_at", null)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

  const trips: TripRow[] = (tripRows ?? []).map((t) => {
    const job = t.jobs as unknown as { job_number: string | null; name: string | null } | null;
    return {
      id: t.id as number,
      trip_date: String(t.trip_date).slice(0, 10),
      jobId: (t.job_id as number | null) ?? null,
      jobNumber: job?.job_number ?? null,
      jobName: job?.name ?? null,
      destination: t.destination as string,
      purpose: t.purpose as string,
      miles: Number(t.miles),
      vehicle: (t.vehicle as string | null) ?? null,
      source: t.source as "manual" | "proposed",
      createdAt: String(t.created_at),
    };
  });

  const rates = buildRateMap(rateRows ?? []);
  const total = summarizeMileage(trips, year, rates);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <Link
        href="/app/estimator"
        className="inline-flex items-center gap-1.5 text-2xs text-bone-400 hover:text-bone-100"
      >
        <ArrowLeft size={12} />
        Business
      </Link>

      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-bone-50">Mileage</h1>
          <p className="text-sm text-bone-400 mt-1">
            Log the drive the day you make it — miles can&apos;t be
            reconstructed later.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={`/app/estimator/mileage?y=${year - 1}`}
            className="btn-secondary h-8 w-8 px-0"
            aria-label="Previous year"
          >
            <ChevronLeft size={14} />
          </Link>
          <span className="num text-sm text-bone-100 px-2">{year}</span>
          <Link
            href={`/app/estimator/mileage?y=${year + 1}`}
            className="btn-secondary h-8 w-8 px-0"
            aria-label="Next year"
          >
            <ChevronRight size={14} />
          </Link>
        </div>
      </header>

      <MileageClient
        year={year}
        trips={trips}
        total={total}
        jobs={(jobRows ?? []).map((j) => ({
          id: j.id as number,
          name: (j.name as string | null) ?? `Job #${j.id}`,
          jobNumber: (j.job_number as string | null) ?? null,
          address: (j.address as string | null) ?? null,
        }))}
        baseAddress={(settings?.mileage_base_address as string | null) ?? null}
        rateForYear={rates.get(year) ?? null}
        todayISO={dayKeyInTz(new Date(), tz)}
      />
    </div>
  );
}
