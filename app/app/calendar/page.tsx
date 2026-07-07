import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/cn";
import { getTenantFeatureFlags } from "@/lib/features/flags";
import { dayKeyInTz, fmtTime, getTenantTimezone } from "@/lib/dates";
import { FeatureDisabledPanel } from "@/components/ui/feature-disabled-panel";

type Job = {
  id: number;
  name: string | null;
  address: string | null;
  service: string | null;
  status: string;
  start_datetime: string | null;
  end_datetime: string | null;
};

/**
 * All calendar-grid math runs on UTC-anchored dates (pure Y/M/D arithmetic,
 * immune to the server's timezone), while JOB timestamps are bucketed and
 * rendered in the TENANT's timezone via lib/dates. The old version grouped
 * by the server's local date — on Netlify (UTC) a 7:00 PM Mountain job
 * rendered on the next day at 1:00 AM.
 */
function utcDate(y: number, m0: number, d: number) {
  return new Date(Date.UTC(y, m0, d));
}
function cellKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function fmtMonthYear(y: number, m0: number) {
  return utcDate(y, m0, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

const STATUS_BG: Record<string, string> = {
  lead: "bg-status-lead/20 text-status-lead border-status-lead/30",
  estimated: "bg-status-estimated/20 text-status-estimated border-status-estimated/30",
  scheduled: "bg-status-scheduled/20 text-status-scheduled border-status-scheduled/30",
  in_progress: "bg-status-progress/20 text-status-progress border-status-progress/30",
  completed: "bg-status-completed/20 text-status-completed border-status-completed/30",
  cancelled: "bg-status-cancelled/15 text-status-cancelled border-status-cancelled/30 line-through",
};

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
  const [{ m }, tz] = await Promise.all([searchParams, getTenantTimezone()]);

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
  const cells: Date[] = Array.from({ length: 42 }, (_, i) =>
    utcDate(gridStart.getUTCFullYear(), gridStart.getUTCMonth(), gridStart.getUTCDate() + i),
  );

  // Fetch jobs in this window, padded a day each side so timezone offsets
  // can't drop edge events, then bucket by tenant-timezone date.
  const DAY = 24 * 60 * 60 * 1000;
  const { data: rawJobs } = await supabase
    .from("jobs")
    .select("id, name, address, service, status, start_datetime, end_datetime")
    .is("archived_at", null)
    .gte("start_datetime", new Date(gridStart.getTime() - DAY).toISOString())
    .lte("start_datetime", new Date(cells[41].getTime() + 2 * DAY).toISOString())
    .order("start_datetime", { ascending: true });

  const jobs: Job[] = (rawJobs ?? []).filter((j) => j.start_datetime != null);

  // Group jobs by tenant-timezone date
  const byDay = new Map<string, Job[]>();
  for (const j of jobs) {
    const key = dayKeyInTz(j.start_datetime!, tz);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(j);
  }

  // Detect conflicts (same day jobs overlapping in time)
  const conflictDays = new Set<string>();
  for (const [day, dayJobs] of byDay.entries()) {
    if (dayJobs.length < 2) continue;
    const sorted = [...dayJobs].sort(
      (a, b) =>
        new Date(a.start_datetime!).getTime() -
        new Date(b.start_datetime!).getTime(),
    );
    for (let i = 0; i < sorted.length - 1; i++) {
      const aEnd = sorted[i].end_datetime
        ? new Date(sorted[i].end_datetime!)
        : new Date(new Date(sorted[i].start_datetime!).getTime() + 60 * 60 * 1000);
      const bStart = new Date(sorted[i + 1].start_datetime!);
      if (aEnd > bStart) {
        conflictDays.add(day);
        break;
      }
    }
  }

  // Build day cells
  const days: { date: Date; key: string; jobs: Job[] }[] = cells.map((d) => ({
    date: d,
    key: cellKey(d),
    jobs: byDay.get(cellKey(d)) ?? [],
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
            {conflictDays.size > 0 && (
              <span className="text-status-danger ml-2">
                · {conflictDays.size} day{conflictDays.size === 1 ? "" : "s"} with conflicts
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

      {/* Day grid */}
      <div className="grid grid-cols-7 border-l border-line bg-ink-0">
        {days.map(({ date, key, jobs }, i) => {
          const isCurMonth = date.getUTCMonth() === mo - 1;
          const isToday = key === todayKey;
          const hasConflict = conflictDays.has(key);
          return (
            <div
              key={i}
              className={cn(
                "border-r border-b border-line p-1 sm:p-1.5 relative",
                "min-h-[64px] sm:min-h-[88px] md:min-h-[112px]",
                !isCurMonth && "bg-ink-1/30",
                isToday && "ring-1 ring-inset ring-field-500/40",
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={cn(
                    "num text-2xs",
                    isCurMonth ? "text-bone-300" : "text-bone-500",
                    isToday && "text-field-500 font-semibold",
                  )}
                >
                  {date.getUTCDate()}
                </span>
                {hasConflict && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-status-danger"
                    title="Conflict"
                  />
                )}
              </div>
              <ul className="space-y-1">
                {jobs.slice(0, 3).map((j) => {
                  const cls = STATUS_BG[j.status] ?? STATUS_BG.scheduled;
                  return (
                    <li key={j.id}>
                      <Link
                        href={`/app/jobs/${j.id}`}
                        className={cn(
                          "block text-2xs leading-tight border rounded-xs px-1.5 py-0.5 truncate hover:opacity-80 transition-opacity",
                          cls,
                        )}
                        title={`${j.name ?? "—"} · ${j.address ?? ""}`}
                      >
                        <span className="num font-medium mr-1">
                          {fmtTime(j.start_datetime!, tz)}
                        </span>
                        {j.name || j.service || "—"}
                      </Link>
                    </li>
                  );
                })}
                {jobs.length > 3 && (
                  <li className="text-2xs text-bone-400 pl-1.5">
                    +{jobs.length - 3} more
                  </li>
                )}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap mt-4 text-2xs">
        <span className="label-eyebrow">Legend:</span>
        {Object.entries(STATUS_BG).map(([key, cls]) => (
          <span key={key} className={cn("chip text-2xs", cls)}>
            {key.replace(/_/g, " ")}
          </span>
        ))}
        <span className="ml-auto text-2xs text-bone-400 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-status-danger" />
          Conflict on day
        </span>
      </div>
    </div>
  );
}
