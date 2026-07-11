import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantFeatureFlags } from "@/lib/features/flags";
import { getCurrentUserRole } from "@/lib/permissions/current-role";
import { dayKeyInTz, getTenantTimezone } from "@/lib/dates";
import { FeatureDisabledPanel } from "@/components/ui/feature-disabled-panel";
import { CalendarClient, type CalJob, type PickJob } from "./calendar-client";

/**
 * All calendar-grid math runs on UTC-anchored dates (pure Y/M/D arithmetic,
 * immune to the server's timezone), while JOB timestamps are bucketed and
 * rendered in the TENANT's timezone via lib/dates. The old version grouped
 * by the server's local date — on Netlify (UTC) a 7:00 PM Mountain job
 * rendered on the next day at 1:00 AM.
 *
 * Interactivity (day sheet, event sheet, booking flow) lives in
 * calendar-client.tsx; this page fetches and frames.
 */
function utcDate(y: number, m0: number, d: number) {
  return new Date(Date.UTC(y, m0, d));
}
function fmtMonthYear(y: number, m0: number) {
  return utcDate(y, m0, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const flags = await getTenantFeatureFlags();
  if (!flags.calendar) {
    return (
      <FeatureDisabledPanel
        featureName="Calendar"
        description="Calendar integration is in development and not yet available for your account."
      />
    );
  }

  const supabase = await createClient();
  const [{ m }, tz, session] = await Promise.all([
    searchParams,
    getTenantTimezone(),
    getCurrentUserRole(),
  ]);
  const canWrite =
    session?.role === "owner" || session?.role === "manager";

  // "Today" and the default month are the tenant's, not the server's.
  const todayKey = dayKeyInTz(new Date(), tz);
  const [todayY, todayM] = todayKey.split("-").map(Number);
  let y: number;
  let mo: number; // 1-based month
  if (m && /^\d{4}-\d{2}$/.test(m)) {
    [y, mo] = m.split("-").map(Number);
  } else {
    y = todayY;
    mo = todayM;
  }

  // 6-week grid starting on the Sunday before the 1st (pure UTC calendar math)
  const first = utcDate(y, mo - 1, 1);
  const gridStart = utcDate(y, mo - 1, 1 - first.getUTCDay());
  const cellDates: Date[] = Array.from({ length: 42 }, (_, i) =>
    utcDate(gridStart.getUTCFullYear(), gridStart.getUTCMonth(), gridStart.getUTCDate() + i),
  );

  // Fetch jobs in this window, padded a day each side so timezone offsets
  // can't drop edge events; the client buckets by tenant-timezone date.
  const DAY = 24 * 60 * 60 * 1000;
  const [{ data: rawJobs }, { data: rawUnscheduled }] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, name, address, service, status, start_datetime, end_datetime")
      .is("archived_at", null)
      .gte("start_datetime", new Date(gridStart.getTime() - DAY).toISOString())
      .lte("start_datetime", new Date(cellDates[41].getTime() + 2 * DAY).toISOString())
      .order("start_datetime", { ascending: true }),
    // Bookable backlog for the "Schedule a job → existing" flow.
    supabase
      .from("jobs")
      .select("id, name, address, service, status")
      .is("archived_at", null)
      .is("start_datetime", null)
      .not("status", "in", "(completed,cancelled)")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const jobs = ((rawJobs ?? []) as CalJob[]).filter(
    (j) => j.start_datetime != null,
  );
  const unscheduled = (rawUnscheduled ?? []) as PickJob[];

  // Detect conflicts (same day jobs overlapping in time)
  const byDay = new Map<string, CalJob[]>();
  for (const j of jobs) {
    const key = dayKeyInTz(j.start_datetime, tz);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(j);
  }
  const conflictDays: string[] = [];
  for (const [day, dayJobs] of byDay.entries()) {
    if (dayJobs.length < 2) continue;
    const sorted = [...dayJobs].sort(
      (a, b) =>
        new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime(),
    );
    for (let i = 0; i < sorted.length - 1; i++) {
      const aEnd = sorted[i].end_datetime
        ? new Date(sorted[i].end_datetime!)
        : new Date(new Date(sorted[i].start_datetime).getTime() + 60 * 60 * 1000);
      const bStart = new Date(sorted[i + 1].start_datetime);
      if (aEnd > bStart) {
        conflictDays.push(day);
        break;
      }
    }
  }

  const cells = cellDates.map((d) => ({
    key: d.toISOString().slice(0, 10),
    dayNum: d.getUTCDate(),
    inMonth: d.getUTCMonth() === mo - 1,
  }));

  // Prev/next month nav (pure Y/M arithmetic)
  const prev = utcDate(y, mo - 2, 1);
  const next = utcDate(y, mo, 1);
  const prevHref = `/app/calendar?m=${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
  const nextHref = `/app/calendar?m=${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
  const isCurrentMonth = y === todayY && mo === todayM;

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="label-eyebrow mb-1">Calendar</div>
          <h1 className="text-2xl font-semibold text-bone-50 tracking-tight">
            {fmtMonthYear(y, mo - 1)}
          </h1>
          <p className="text-sm text-bone-300 mt-1">
            {jobs.length} job{jobs.length === 1 ? "" : "s"} this view
            {conflictDays.length > 0 && (
              <span className="text-status-danger ml-2">
                · {conflictDays.length} day{conflictDays.length === 1 ? "" : "s"} with conflicts
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <Link href={prevHref} className="btn-secondary h-8 w-8 px-0" aria-label="Previous month">
            <ChevronLeft size={14} />
          </Link>
          {!isCurrentMonth && (
            <Link href="/app/calendar" className="btn-secondary h-8 px-3 text-xs">
              Today
            </Link>
          )}
          <Link href={nextHref} className="btn-secondary h-8 w-8 px-0" aria-label="Next month">
            <ChevronRight size={14} />
          </Link>
        </div>
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-t border-l border-line bg-ink-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="label-eyebrow text-center py-2 border-r border-b border-line"
          >
            {d}
          </div>
        ))}
      </div>

      <CalendarClient
        cells={cells}
        todayKey={todayKey}
        jobs={jobs}
        conflictDays={conflictDays}
        unscheduled={unscheduled}
        tz={tz}
        canWrite={canWrite}
      />

      <p className="text-2xs text-bone-400 mt-2">
        Tap a day to see its schedule or book a job
        {canWrite ? "; tap an event to reschedule, unschedule, or cancel it." : "."}
      </p>
    </div>
  );
}
