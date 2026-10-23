"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Loader2, X } from "lucide-react";
import { whenError, type When } from "@/lib/schedule";

/**
 * When a job happens: a date, an optional time (none: all day) and an
 * optional end date (a job over several days). Used by the status picker,
 * the job form, New job and the calendar, so a scheduled job always lands
 * on the calendar.
 */
export function WhenFields({
  value,
  onChange,
  disabled,
}: {
  value: When;
  onChange: (w: When) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-3 gap-2">
        <label className="block">
          <span className="label-eyebrow block mb-1">Date</span>
          <input
            type="date"
            aria-label="Date"
            value={value.date ?? ""}
            onChange={(e) => onChange({ ...value, date: e.target.value || null })}
            disabled={disabled}
            className="!bg-ink-2 w-full text-sm h-9 font-mono"
          />
        </label>
        <label className="block">
          <span className="label-eyebrow block mb-1">Time</span>
          <input
            type="time"
            aria-label="Time"
            value={value.time ?? ""}
            onChange={(e) => onChange({ ...value, time: e.target.value || null })}
            disabled={disabled}
            className="!bg-ink-2 w-full text-sm h-9 font-mono"
          />
        </label>
        <label className="block">
          <span className="label-eyebrow block mb-1">End date</span>
          <input
            type="date"
            aria-label="End date"
            value={value.endDate ?? ""}
            min={value.date ?? undefined}
            onChange={(e) => onChange({ ...value, endDate: e.target.value || null })}
            disabled={disabled}
            className="!bg-ink-2 w-full text-sm h-9 font-mono"
          />
        </label>
      </div>
      <p className="text-2xs text-bone-500">No time: all day. End date: a job over several days.</p>
    </div>
  );
}

/** "When?" for a job being set to Scheduled. Saving needs a date; "No date yet" saves without one. */
export function WhenDialog({
  initial,
  busy,
  error,
  onSave,
  onNoDate,
  onClose,
}: {
  initial: When;
  busy: boolean;
  error: string | null;
  onSave: (w: When) => void;
  onNoDate: () => void;
  onClose: () => void;
}) {
  const [when, setWhen] = useState<When>(initial);
  const problem = when.date ? whenError(when) : null;

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [busy, onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]" onClick={() => !busy && onClose()} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="When?"
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 pointer-events-none"
      >
        <div className="bg-ink-1 border border-line-strong rounded-t-md sm:rounded-md w-full sm:max-w-md pointer-events-auto shadow-xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line">
            <h2 className="text-sm font-semibold text-bone-50">When?</h2>
            <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="btn-ghost h-8 w-8 px-0">
              <X size={15} strokeWidth={1.8} />
            </button>
          </div>
          <div className="px-4 py-4 space-y-3">
            <WhenFields value={when} onChange={setWhen} disabled={busy} />
            {(problem || error) && <div className="text-2xs text-status-danger">{problem ?? error}</div>}
            <div className="flex items-center gap-2">
              <button type="button" onClick={onNoDate} disabled={busy} className="btn-ghost text-sm h-10">
                No date yet
              </button>
              <button
                type="button"
                onClick={() => onSave(when)}
                disabled={busy || !when.date || !!problem}
                className="btn-primary text-sm h-10 flex-1"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <CalendarClock size={13} />}
                Schedule
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
