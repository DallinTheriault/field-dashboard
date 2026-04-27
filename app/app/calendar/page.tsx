import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/cn";

type Job = {
  id: number;
  name: string | null;
  address: string | null;
  service: string | null;
  status: string;
  start_datetime: string | null;
  end_datetime: string | null;
};

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
}
function startOfGrid(d: Date) {
  // First day of week containing the first of the month (Sun start)
  const s = startOfMonth(d);
  const dow = s.getDay();
  return new Date(s.getFullYear(), s.getMonth(), s.getDate() - dow);
}
function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function fmtMonthYear(d: Date) {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
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
  const supabase = await createClient();
  const { m } = await searchParams;

  // Determine the month to render
  const today = new Date();
  let cursor: Date;
  if (m && /^\d{4}-\d{2}$/.test(m)) {
    const [y, mo] = m.split("-").map(Number);
    cursor = new Date(y, mo - 1, 1);
  } else {
    cursor = startOfMonth(today);
  }

  const gridStart = startOfGrid(cursor);
  const gridEnd = addDays(gridStart, 41); // 6 weeks

  // Fetch jobs in this window
  const { data: rawJobs } = await supabase
    .from("jobs")
    .select("id, name, address, service, status, start_datetime, end_datetime")
    .gte("start_datetime", gridStart.toISOString())
    .lte("start_datetime", gridEnd.toISOString())
    .order("start_datetime", { ascending: true });

  const jobs: Job[] = (rawJobs ?? []).filter((j) => j.start_datetime != null);

  // Group jobs by date
  const byDay = new Map<string, Job[]>();
  for (const j of jobs) {
    const key = new Date(j.start_datetime!).toDateString();
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
  const days: { date: Date; jobs: Job[] }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i);
    days.push({ date: d, jobs: byDay.get(d.toDateString()) ?? [] });
  }

  // Prev/next month nav
  const prev = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
  const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  const prevHref = `/app/calendar?m=${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  const nextHref = `/app/calendar?m=${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
  const isCurrentMonth = sameDay(cursor, startOfMonth(today));

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="label-eyebrow mb-1">Calendar</div>
          <h1 className="text-2xl font-semibold text-bone-50 tracking-tight">
            {fmtMonthYear(cursor)}
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
        {days.map(({ date, jobs }, i) => {
          const isCurMonth = date.getMonth() === cursor.getMonth();
          const isToday = sameDay(date, today);
          const hasConflict = conflictDays.has(date.toDateString());
          return (
            <div
              key={i}
              className={cn(
                "border-r border-b border-line min-h-[112px] p-1.5 relative",
                !isCurMonth && "bg-ink-1/30",
                isToday && "ring-1 ring-inset ring-salmon-500/40",
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={cn(
                    "num text-2xs",
                    isCurMonth ? "text-bone-300" : "text-bone-500",
                    isToday && "text-salmon-500 font-semibold",
                  )}
                >
                  {date.getDate()}
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
                          {fmtTime(new Date(j.start_datetime!))}
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
