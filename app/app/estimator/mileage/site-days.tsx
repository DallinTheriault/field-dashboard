"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { markNoSiteDays, setJobSiteDays } from "./mileage-actions";

const fmtDay = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });

/**
 * The days on site for a job, starting from its scheduled days, every one
 * checked: untick the days you weren't there, add any that are missing.
 * Saving works out that day's trips.
 */
export function SiteDaysForm({
  jobId,
  initialDays,
  onDone,
  allowNone = false,
}: {
  jobId: number;
  initialDays: string[];
  onDone: () => void;
  /** Catch-up: offer "I wasn't on site". */
  allowNone?: boolean;
}) {
  const [days, setDays] = useState<string[]>(initialDays);
  const [checked, setChecked] = useState<Set<string>>(new Set(initialDays));
  const [adding, setAdding] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const add = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(adding)) return;
    setDays((prev) => [...new Set([...prev, adding])].sort());
    setChecked((prev) => new Set(prev).add(adding));
    setAdding("");
  };
  const save = (none = false) =>
    start(async () => {
      setErr(null);
      const picked = days.filter((d) => checked.has(d));
      if (!none && picked.length === 0) return setErr("Tick at least one day, or add one.");
      const r = none ? await markNoSiteDays(jobId) : await setJobSiteDays(jobId, picked);
      if (!r.ok) return setErr(r.error);
      onDone();
    });

  return (
    <div className="space-y-3" data-testid="site-days">
      {days.length > 0 && (
        <ul className="grid grid-cols-2 gap-1.5">
          {days.map((d) => (
            <li key={d}>
              <label className="flex items-center gap-2 text-sm text-bone-100 min-h-[44px] px-2 rounded-sm bg-ink-2 shadow-inset-line">
                <input
                  type="checkbox"
                  className="w-5 h-5"
                  checked={checked.has(d)}
                  onChange={(e) =>
                    setChecked((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(d);
                      else next.delete(d);
                      return next;
                    })
                  }
                  aria-label={d}
                />
                {fmtDay(d)}
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          aria-label="Add a day"
          className="min-h-[44px] flex-1"
        />
        <button type="button" onClick={add} disabled={!adding} className="btn-secondary text-xs min-h-[44px]">
          <Plus size={12} />
          Add day
        </button>
      </div>
      {err && <div className="form-error">{err}</div>}
      <div className="flex flex-wrap items-center gap-2">
        {allowNone && (
          <button type="button" onClick={() => save(true)} disabled={pending} className="btn-ghost text-xs min-h-[44px]">
            I wasn&apos;t on site
          </button>
        )}
        <button type="button" onClick={() => save(false)} disabled={pending} className="btn-primary text-sm min-h-[44px] ml-auto">
          {pending ? <Loader2 size={13} className="animate-spin" /> : "Save days"}
        </button>
      </div>
    </div>
  );
}

/** Asked when a job is completed with no hours logged. */
export function SiteDaysDialog({ jobId, days, closeHref }: { jobId: number; days: string[]; closeHref: string }) {
  const router = useRouter();
  const close = () => router.replace(closeHref, { scroll: false });
  return (
    <div
      className="fixed inset-0 z-50 bg-ink-0/70 flex items-end sm:items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Which days were you there?"
    >
      <div className="panel w-full max-w-md p-4 space-y-3">
        <div className="flex items-start gap-2">
          <h2 className="text-base font-semibold text-bone-50 flex-1">Which days were you there?</h2>
          <button type="button" onClick={close} className="btn-ghost min-h-[44px] min-w-[44px] -mt-2 -mr-2" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <p className="text-sm text-bone-300">
          No hours are logged on this job, so Field doesn&apos;t know the days. Each day you were on site counts as one round
          trip for mileage.
        </p>
        <SiteDaysForm
          jobId={jobId}
          initialDays={days}
          onDone={() => {
            close();
            router.refresh();
          }}
        />
        <button type="button" onClick={close} className="btn-ghost text-xs min-h-[44px]">
          Skip for now
        </button>
      </div>
    </div>
  );
}
