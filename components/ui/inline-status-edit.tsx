"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import { browserSupabase } from "@/lib/supabase/lazy-client";
import { StatusChip } from "@/components/ui/status-chip";
import { WhenDialog } from "@/components/ui/when-fields";
import { applyWhen, columnsToWhen, type ScheduleColumns, type When } from "@/lib/schedule";

const STATUSES = [
  "lead",
  "estimated",
  "accepted",
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
] as const;

type Status = (typeof STATUSES)[number];

/**
 * Click to edit status inline. Renders the StatusChip with a chevron
 * affordance to signal it's interactive. Clicking opens a dropdown of
 * statuses; selecting one saves immediately and closes.
 *
 * Mobile/touch: chevron is always visible. Desktop: hover reveals a
 * subtle border lift.
 *
 * Scheduled asks "When?" first (given the job's schedule), so the job lands
 * on the calendar; "No date yet" schedules it without one.
 */
export function InlineStatusEdit({
  jobId,
  currentStatus,
  schedule,
  tz,
}: {
  jobId: number | string;
  currentStatus: string;
  schedule?: ScheduleColumns;
  tz?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function setStatus(next: Status, when?: When | null) {
    if (next === currentStatus) {
      setOpen(false);
      return;
    }
    if (next === "scheduled" && schedule && tz && when === undefined) {
      setOpen(false);
      setErr(null);
      setAsking(true);
      return;
    }
    setSaving(true);
    setErr(null);
    const cols =
      when !== undefined && schedule && tz
        ? applyWhen(schedule, when ?? { date: null, time: null, endDate: null }, tz)
        : null;
    const supabase = await browserSupabase();
    const { error } = await supabase
      .from("jobs")
      .update({
        status: next,
        ...(cols ?? {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    setSaving(false);
    setOpen(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setAsking(false);
    // Completed: the job page asks which days you were there if no hours
    // are logged (mileage). Otherwise refresh so the timeline picks up the
    // new status_log row.
    if (next === "completed") router.replace(`${pathname}?days=ask`, { scroll: false });
    else router.refresh();
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={saving}
        className="inline-flex items-center gap-1 group rounded hover:bg-ink-2 px-1 -mx-1 py-0.5 transition-colors"
        aria-label="Change status"
      >
        <StatusChip status={currentStatus} />
        {saving ? (
          <Loader2 size={11} className="animate-spin text-bone-400" />
        ) : (
          <ChevronDown
            size={12}
            className="text-bone-500 group-hover:text-bone-300 transition-colors"
          />
        )}
      </button>

      {open && !saving && (
        <div className="absolute z-20 left-0 top-full mt-1 min-w-[160px] rounded-md border border-line-strong bg-ink-2 shadow-lg py-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-ink-3 transition-colors"
            >
              <StatusChip status={s} />
              {s === currentStatus && (
                <span className="ml-auto text-2xs text-bone-500">current</span>
              )}
            </button>
          ))}
        </div>
      )}

      {asking && schedule && tz && (
        <WhenDialog
          initial={columnsToWhen(schedule.start_datetime, schedule.end_datetime, schedule.all_day, tz)}
          busy={saving}
          error={err}
          onSave={(w) => setStatus("scheduled", w)}
          onNoDate={() => setStatus("scheduled", null)}
          onClose={() => setAsking(false)}
        />
      )}

      {err && !asking && (
        <div className="absolute top-full mt-1 text-2xs text-status-danger">
          {err}
        </div>
      )}
    </div>
  );
}
