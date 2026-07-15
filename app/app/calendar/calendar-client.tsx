"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Ban,
  CalendarClock,
  CalendarX2,
  Loader2,
  Plus,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";
import { createJobManual } from "../jobs/_components/actions";

export type CalJob = {
  id: number;
  name: string | null;
  address: string | null;
  service: string | null;
  status: string;
  start_datetime: string;
  end_datetime: string | null;
};

export type PickJob = {
  id: number;
  name: string | null;
  address: string | null;
  service: string | null;
  status: string;
};

type Cell = { key: string; dayNum: number; inMonth: boolean };

const STATUS_BG: Record<string, string> = {
  lead: "bg-status-lead/20 text-status-lead border-status-lead/30",
  estimated: "bg-status-estimated/20 text-status-estimated border-status-estimated/30",
  accepted: "bg-status-completed/20 text-status-completed border-status-completed/30",
  scheduled: "bg-status-scheduled/20 text-status-scheduled border-status-scheduled/30",
  in_progress: "bg-status-progress/20 text-status-progress border-status-progress/30",
  completed: "bg-status-completed/20 text-status-completed border-status-completed/30",
  callback: "bg-status-lead/20 text-status-lead border-status-lead/30",
  callback_complete: "bg-status-completed/20 text-status-completed border-status-completed/30",
  cancelled: "bg-status-cancelled/15 text-status-cancelled border-status-cancelled/30 line-through",
};

const DURATIONS = [
  { hours: 0.5, label: "30 min" },
  { hours: 1, label: "1 hr" },
  { hours: 1.5, label: "1.5 hrs" },
  { hours: 2, label: "2 hrs" },
  { hours: 3, label: "3 hrs" },
  { hours: 4, label: "4 hrs" },
  { hours: 6, label: "6 hrs" },
  { hours: 8, label: "8 hrs" },
];

/* Display always uses the TENANT timezone (matches the server-rendered
 * grid). Date/time INPUTS use the browser's timezone — same convention as
 * the job edit form, and for a local crew those are the same clock. */
function fmtTimeTz(iso: string, tz: string): string {
  return new Date(iso).toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  });
}

function fmtRange(job: CalJob, tz: string): string {
  const start = fmtTimeTz(job.start_datetime, tz);
  return job.end_datetime ? `${start} – ${fmtTimeTz(job.end_datetime, tz)}` : start;
}

/** "Friday, Jul 11" from a YYYY-MM-DD key (pure — no timezone math). */
function dayLabel(key: string): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** ISO → browser-local "YYYY-MM-DD" / "HH:mm" for date+time inputs. */
function isoToLocalParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function localPartsToIso(date: string, time: string): string | null {
  const d = new Date(`${date}T${time}`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function durationOf(job: CalJob): number {
  if (!job.end_datetime) return 2;
  const h =
    (new Date(job.end_datetime).getTime() - new Date(job.start_datetime).getTime()) /
    3600000;
  return h > 0 && h <= 24 ? Math.round(h * 2) / 2 : 2;
}

function statusChip(status: string) {
  return (
    <span
      className={cn(
        "chip text-2xs shrink-0",
        STATUS_BG[status] ?? STATUS_BG.scheduled,
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

/* ---------- Sheet shell (bottom sheet on phones, modal on desktop) ---------- */

function Sheet({
  title,
  onClose,
  onBack,
  children,
}: {
  title: React.ReactNode;
  onClose: () => void;
  onBack?: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 pointer-events-none"
      >
        <div className="bg-ink-1 border border-line-strong rounded-t-md sm:rounded-md w-full sm:max-w-md max-h-[88vh] overflow-y-auto pointer-events-auto shadow-xl">
          <div className="sticky top-0 bg-ink-1 flex items-center gap-2 px-4 py-3 border-b border-line z-10">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label="Back"
                className="btn-ghost h-8 w-8 px-0 -ml-1.5"
              >
                <ArrowLeft size={15} strokeWidth={1.8} />
              </button>
            )}
            <h2 className="text-sm font-semibold text-bone-50 flex-1 min-w-0 truncate">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="btn-ghost h-8 w-8 px-0"
            >
              <X size={15} strokeWidth={1.8} />
            </button>
          </div>
          <div className="px-4 py-4">{children}</div>
        </div>
      </div>
    </>
  );
}

/* ---------- Schedule form (shared by add + reschedule) ---------- */

function ScheduleForm({
  initialDate,
  initialTime,
  initialDuration,
  excludeJobId,
  allJobs,
  tz,
  busy,
  submitLabel,
  onSubmit,
}: {
  initialDate: string;
  initialTime: string;
  initialDuration: number;
  excludeJobId?: number;
  allJobs: CalJob[];
  tz: string;
  busy: boolean;
  submitLabel: string;
  onSubmit: (startIso: string, endIso: string) => void;
}) {
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const [duration, setDuration] = useState(initialDuration);

  const startIso = localPartsToIso(date, time);
  const endIso = startIso
    ? new Date(new Date(startIso).getTime() + duration * 3600000).toISOString()
    : null;

  // Booking-style heads-up: does this overlap another job on the calendar?
  const overlap = useMemo(() => {
    if (!startIso || !endIso) return null;
    const s = new Date(startIso).getTime();
    const e = new Date(endIso).getTime();
    for (const j of allJobs) {
      if (j.id === excludeJobId || j.status === "cancelled") continue;
      const js = new Date(j.start_datetime).getTime();
      const je = j.end_datetime ? new Date(j.end_datetime).getTime() : js + 3600000;
      if (s < je && js < e) return j;
    }
    return null;
  }, [startIso, endIso, allJobs, excludeJobId]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label-eyebrow block mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="!bg-ink-2 w-full text-sm h-9 font-mono"
          />
        </div>
        <div>
          <label className="label-eyebrow block mb-1">Start time</label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="!bg-ink-2 w-full text-sm h-9 font-mono"
          />
        </div>
      </div>
      <div>
        <label className="label-eyebrow block mb-1">Duration</label>
        <div className="flex flex-wrap gap-1.5">
          {DURATIONS.map((d) => (
            <button
              key={d.hours}
              type="button"
              onClick={() => setDuration(d.hours)}
              className={cn(
                "chip text-2xs cursor-pointer transition-colors",
                duration === d.hours
                  ? "border-field-500/60 text-field-400 bg-field-500/10"
                  : "border-line-strong text-bone-300 hover:text-bone-100",
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {overlap && (
        <div className="flex items-start gap-2 p-2 rounded-xs bg-status-lead/[0.08] border border-status-lead/25">
          <AlertTriangle size={12} className="text-status-lead shrink-0 mt-0.5" />
          <span className="text-2xs text-bone-100 leading-relaxed">
            Overlaps {overlap.name || "another job"} ({fmtRange(overlap, tz)}). You
            can still book it.
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={() => startIso && endIso && onSubmit(startIso, endIso)}
        disabled={busy || !startIso}
        className="btn-primary text-sm h-10 w-full"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <CalendarClock size={13} />}
        {submitLabel}
      </button>
    </div>
  );
}

/* ---------- Phone formatting (same behavior as Add job) ---------- */

function formatPhoneAsTyped(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/* ---------- Main component ---------- */

export function CalendarClient({
  cells,
  todayKey,
  jobs,
  conflictDays,
  unscheduled,
  tz,
  canWrite,
}: {
  cells: Cell[];
  todayKey: string;
  jobs: CalJob[];
  conflictDays: string[];
  unscheduled: PickJob[];
  tz: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();

  // One sheet at a time; the day sheet stays "underneath" so back works.
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [eventJob, setEventJob] = useState<CalJob | null>(null);
  const [addDay, setAddDay] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reschedOpen, setReschedOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  // Add flow state
  const [addMode, setAddMode] = useState<"existing" | "new">("existing");
  const [pickSearch, setPickSearch] = useState("");
  const [pickedJob, setPickedJob] = useState<PickJob | null>(null);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newService, setNewService] = useState("");

  const conflictSet = useMemo(() => new Set(conflictDays), [conflictDays]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalJob[]>();
    for (const j of jobs) {
      const key = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(j.start_datetime));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(j);
    }
    return map;
  }, [jobs, tz]);

  const anySheet = dayKey !== null || eventJob !== null || addDay !== null;

  function closeAll() {
    setDayKey(null);
    setEventJob(null);
    setAddDay(null);
    setErr(null);
    setReschedOpen(false);
    setConfirmCancel(false);
    setPickedJob(null);
    setPickSearch("");
    setAddMode("existing");
    setNewName("");
    setNewPhone("");
    setNewAddress("");
    setNewService("");
  }

  useEffect(() => {
    if (!anySheet) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) closeAll();
    }
    window.addEventListener("keydown", handler);
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = original;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anySheet, busy]);

  function openEvent(job: CalJob) {
    setEventJob(job);
    setErr(null);
    setReschedOpen(false);
    setConfirmCancel(false);
  }

  function done() {
    closeAll();
    router.refresh();
  }

  async function saveSchedule(jobId: number, startIso: string, endIso: string, promote: boolean) {
    setErr(null);
    setBusy(true);
    const update: Record<string, unknown> = {
      start_datetime: startIso,
      end_datetime: endIso,
      updated_at: new Date().toISOString(),
    };
    if (promote) update.status = "scheduled";
    const { error } = await supabase.from("jobs").update(update).eq("id", jobId);
    setBusy(false);
    if (error) return setErr(error.message);
    done();
  }

  async function unschedule(job: CalJob) {
    setErr(null);
    setBusy(true);
    // Drop a 'scheduled' job back to where it came from: accepted if any
    // estimate version is accepted, estimated if one merely exists,
    // otherwise lead. Other statuses keep their status.
    let status = job.status;
    if (job.status === "scheduled") {
      const { data } = await supabase
        .from("estimates")
        .select("id, status")
        .eq("job_id", job.id);
      const ests = data ?? [];
      status = ests.some((e) => e.status === "accepted")
        ? "accepted"
        : ests.length > 0
          ? "estimated"
          : "lead";
    }
    const { error } = await supabase
      .from("jobs")
      .update({
        start_datetime: null,
        end_datetime: null,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    setBusy(false);
    if (error) return setErr(error.message);
    done();
  }

  async function cancelJob(job: CalJob) {
    setErr(null);
    setBusy(true);
    const { error } = await supabase
      .from("jobs")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", job.id);
    setBusy(false);
    if (error) return setErr(error.message);
    done();
  }

  async function createAndSchedule(startIso: string, endIso: string) {
    setErr(null);
    setBusy(true);
    const result = await createJobManual({
      name: newName,
      phone: newPhone,
      address: newAddress,
      status: "scheduled",
    });
    if (!result.ok) {
      setBusy(false);
      return setErr(result.error);
    }
    const { error } = await supabase
      .from("jobs")
      .update({
        start_datetime: startIso,
        end_datetime: endIso,
        service: newService.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", result.jobId);
    setBusy(false);
    if (error) return setErr(error.message);
    done();
  }

  const filteredPicks = useMemo(() => {
    const q = pickSearch.trim().toLowerCase();
    if (!q) return unscheduled;
    return unscheduled.filter((j) =>
      [j.name, j.address, j.service]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    );
  }, [unscheduled, pickSearch]);

  const errBox = err && (
    <div className="flex items-start gap-2 p-2 mt-3 rounded-xs bg-status-danger/[0.08] border border-status-danger/20">
      <AlertCircle size={12} className="text-status-danger shrink-0 mt-0.5" />
      <span className="text-2xs text-bone-100 leading-relaxed">{err}</span>
    </div>
  );

  /* ---------- Render ---------- */

  return (
    <>
      {/* Day grid */}
      <div className="grid grid-cols-7 border-l border-line bg-ink-0">
        {cells.map((cell, i) => {
          const dayJobs = byDay.get(cell.key) ?? [];
          const isToday = cell.key === todayKey;
          const hasConflict = conflictSet.has(cell.key);
          return (
            <div
              key={i}
              role="button"
              tabIndex={0}
              onClick={() => {
                setDayKey(cell.key);
                setErr(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") setDayKey(cell.key);
              }}
              className={cn(
                "border-r border-b border-line p-1 sm:p-1.5 relative cursor-pointer",
                "min-h-[64px] sm:min-h-[88px] md:min-h-[112px]",
                "hover:bg-ink-1/60 transition-colors",
                !cell.inMonth && "bg-ink-1/30",
                isToday && "ring-1 ring-inset ring-field-500/40",
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={cn(
                    "num text-2xs",
                    cell.inMonth ? "text-bone-300" : "text-bone-500",
                    isToday && "text-field-500 font-semibold",
                  )}
                >
                  {cell.dayNum}
                </span>
                {hasConflict && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-status-danger"
                    title="Conflict"
                  />
                )}
              </div>
              <ul className="space-y-1">
                {dayJobs.slice(0, 3).map((j) => (
                  <li key={j.id}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEvent(j);
                      }}
                      className={cn(
                        "block w-full text-left text-2xs leading-tight border rounded-xs px-1.5 py-0.5 truncate hover:opacity-80 transition-opacity",
                        STATUS_BG[j.status] ?? STATUS_BG.scheduled,
                      )}
                      title={`${j.name ?? "—"} · ${j.address ?? ""}`}
                    >
                      <span className="num font-medium mr-1">
                        {fmtTimeTz(j.start_datetime, tz)}
                      </span>
                      {j.name || j.service || "—"}
                    </button>
                  </li>
                ))}
                {dayJobs.length > 3 && (
                  <li className="text-2xs text-bone-400 pl-1.5">
                    +{dayJobs.length - 3} more
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
        {["lead", "estimated", "scheduled", "in_progress", "completed", "cancelled"].map(
          (key) => (
            <span key={key} className={cn("chip text-2xs", STATUS_BG[key])}>
              {key.replace(/_/g, " ")}
            </span>
          ),
        )}
        <span className="ml-auto text-2xs text-bone-400 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-status-danger" />
          Conflict on day
        </span>
      </div>

      {/* ---------- Event sheet (on top of everything) ---------- */}
      {eventJob && (
        <Sheet
          title={eventJob.name || eventJob.service || "Job"}
          onClose={closeAll}
          onBack={dayKey ? () => setEventJob(null) : undefined}
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              {statusChip(eventJob.status)}
              <span className="num text-sm text-bone-100">
                {fmtRange(eventJob, tz)}
              </span>
              <span className="text-2xs text-bone-400">
                {dayLabel(
                  new Intl.DateTimeFormat("en-CA", {
                    timeZone: tz,
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                  }).format(new Date(eventJob.start_datetime)),
                )}
              </span>
            </div>
            {(eventJob.address || eventJob.service) && (
              <div className="text-xs text-bone-300 space-y-0.5">
                {eventJob.service && <div>{eventJob.service}</div>}
                {eventJob.address && <div>{eventJob.address}</div>}
              </div>
            )}

            {canWrite && reschedOpen ? (
              <div className="pt-2 border-t border-line-subtle">
                <ScheduleForm
                  initialDate={isoToLocalParts(eventJob.start_datetime).date}
                  initialTime={isoToLocalParts(eventJob.start_datetime).time}
                  initialDuration={durationOf(eventJob)}
                  excludeJobId={eventJob.id}
                  allJobs={jobs}
                  tz={tz}
                  busy={busy}
                  submitLabel="Save new time"
                  onSubmit={(s, e) => saveSchedule(eventJob.id, s, e, false)}
                />
              </div>
            ) : canWrite ? (
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-line-subtle">
                <button
                  type="button"
                  onClick={() => setReschedOpen(true)}
                  disabled={busy}
                  className="btn-secondary text-xs h-10"
                >
                  <CalendarClock size={13} />
                  Reschedule
                </button>
                <button
                  type="button"
                  onClick={() => unschedule(eventJob)}
                  disabled={busy}
                  className="btn-secondary text-xs h-10"
                >
                  {busy ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <CalendarX2 size={13} />
                  )}
                  Unschedule
                </button>
                {confirmCancel ? (
                  <button
                    type="button"
                    onClick={() => cancelJob(eventJob)}
                    disabled={busy}
                    className="btn-secondary text-xs h-10 !border-status-danger/40 !text-status-danger"
                  >
                    {busy ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Ban size={13} />
                    )}
                    Confirm cancel
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmCancel(true)}
                    disabled={busy}
                    className="btn-secondary text-xs h-10 text-status-danger"
                  >
                    <Ban size={13} />
                    Cancel job
                  </button>
                )}
                <Link
                  href={`/app/jobs/${eventJob.id}`}
                  className="btn-secondary text-xs h-10"
                >
                  <ArrowUpRight size={13} />
                  Open job
                </Link>
              </div>
            ) : (
              <div className="pt-2 border-t border-line-subtle">
                <Link
                  href={`/app/jobs/${eventJob.id}`}
                  className="btn-secondary text-xs h-10 w-full"
                >
                  <ArrowUpRight size={13} />
                  Open job details
                </Link>
              </div>
            )}
            {confirmCancel && !busy && (
              <p className="text-2xs text-bone-400 leading-relaxed">
                Marks the job cancelled — it stays on the calendar crossed out,
                and on your Jobs list for your records.
              </p>
            )}
            {errBox}
          </div>
        </Sheet>
      )}

      {/* ---------- Add sheet ---------- */}
      {!eventJob && addDay && (
        <Sheet
          title={`Schedule — ${dayLabel(addDay)}`}
          onClose={closeAll}
          onBack={() => {
            setAddDay(null);
            setPickedJob(null);
            setErr(null);
          }}
        >
          <div className="space-y-3">
            {/* Existing vs new */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-ink-2 rounded-sm">
              {(
                [
                  ["existing", "Existing job"],
                  ["new", "New job"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setAddMode(mode);
                    setPickedJob(null);
                    setErr(null);
                  }}
                  className={cn(
                    "text-xs h-8 rounded-xs transition-colors",
                    addMode === mode
                      ? "bg-ink-0 text-bone-50 shadow-inset-line"
                      : "text-bone-400 hover:text-bone-100",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {addMode === "existing" && !pickedJob && (
              <>
                <div className="relative">
                  <Search
                    size={13}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-bone-500"
                  />
                  <input
                    value={pickSearch}
                    onChange={(e) => setPickSearch(e.target.value)}
                    placeholder="Search unscheduled jobs…"
                    className="!bg-ink-2 w-full text-sm h-9 !pl-8"
                  />
                </div>
                {filteredPicks.length === 0 ? (
                  <p className="text-2xs text-bone-400 leading-relaxed py-2">
                    No unscheduled jobs{pickSearch ? " match" : ""}. Every active
                    job already has a date — or create a new one.
                  </p>
                ) : (
                  <ul className="space-y-1 max-h-64 overflow-y-auto">
                    {filteredPicks.map((j) => (
                      <li key={j.id}>
                        <button
                          type="button"
                          onClick={() => setPickedJob(j)}
                          className="w-full text-left bg-ink-2 hover:bg-ink-2/70 rounded-sm px-3 py-2 flex items-center gap-2"
                        >
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm text-bone-100 truncate">
                              {j.name || j.service || `Job #${j.id}`}
                            </span>
                            {j.address && (
                              <span className="block text-2xs text-bone-400 truncate">
                                {j.address}
                              </span>
                            )}
                          </span>
                          {statusChip(j.status)}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {addMode === "existing" && pickedJob && (
              <>
                <div className="bg-ink-2 rounded-sm px-3 py-2 flex items-center gap-2">
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-bone-100 truncate">
                      {pickedJob.name || pickedJob.service || `Job #${pickedJob.id}`}
                    </span>
                    {pickedJob.address && (
                      <span className="block text-2xs text-bone-400 truncate">
                        {pickedJob.address}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPickedJob(null)}
                    className="btn-ghost h-7 w-7 px-0"
                    aria-label="Pick a different job"
                  >
                    <X size={13} />
                  </button>
                </div>
                <ScheduleForm
                  initialDate={addDay}
                  initialTime="09:00"
                  initialDuration={2}
                  allJobs={jobs}
                  tz={tz}
                  busy={busy}
                  submitLabel="Book it"
                  onSubmit={(s, e) =>
                    saveSchedule(
                      pickedJob.id,
                      s,
                      e,
                      ["lead", "estimated", "accepted", "callback"].includes(pickedJob.status),
                    )
                  }
                />
              </>
            )}

            {addMode === "new" && (
              <div className="space-y-3">
                <div>
                  <label className="label-eyebrow block mb-1">
                    Customer name <span className="text-status-danger">*</span>
                  </label>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Brie Anderson"
                    className="!bg-ink-2 w-full text-sm h-9"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label-eyebrow block mb-1">
                      Phone <span className="text-status-danger">*</span>
                    </label>
                    <input
                      type="tel"
                      inputMode="tel"
                      value={newPhone}
                      onChange={(e) => setNewPhone(formatPhoneAsTyped(e.target.value))}
                      placeholder="(801) 555-1234"
                      className="!bg-ink-2 w-full text-sm h-9 font-mono"
                    />
                  </div>
                  <div>
                    <label className="label-eyebrow block mb-1">Service</label>
                    <input
                      value={newService}
                      onChange={(e) => setNewService(e.target.value)}
                      placeholder="e.g. Interior paint"
                      className="!bg-ink-2 w-full text-sm h-9"
                    />
                  </div>
                </div>
                <div>
                  <label className="label-eyebrow block mb-1">
                    Address <span className="text-status-danger">*</span>
                  </label>
                  <input
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                    placeholder="e.g. 123 Main St, Provo UT"
                    className="!bg-ink-2 w-full text-sm h-9"
                  />
                </div>
                <ScheduleForm
                  initialDate={addDay}
                  initialTime="09:00"
                  initialDuration={2}
                  allJobs={jobs}
                  tz={tz}
                  busy={busy}
                  submitLabel="Create & book"
                  onSubmit={createAndSchedule}
                />
              </div>
            )}
            {errBox}
          </div>
        </Sheet>
      )}

      {/* ---------- Day sheet ---------- */}
      {!eventJob && !addDay && dayKey && (
        <Sheet title={dayLabel(dayKey)} onClose={closeAll}>
          <div className="space-y-3">
            {(byDay.get(dayKey) ?? []).length === 0 ? (
              <p className="text-2xs text-bone-400 leading-relaxed">
                Nothing scheduled this day.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {(byDay.get(dayKey) ?? []).map((j) => (
                  <li key={j.id}>
                    <button
                      type="button"
                      onClick={() => openEvent(j)}
                      className="w-full text-left bg-ink-2 hover:bg-ink-2/70 rounded-sm px-3 py-2.5 flex items-center gap-3"
                    >
                      <span className="num text-xs text-bone-100 w-24 shrink-0">
                        {fmtRange(j, tz)}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span
                          className={cn(
                            "block text-sm text-bone-100 truncate",
                            j.status === "cancelled" && "line-through text-bone-400",
                          )}
                        >
                          {j.name || j.service || `Job #${j.id}`}
                        </span>
                        {j.address && (
                          <span className="block text-2xs text-bone-400 truncate">
                            {j.address}
                          </span>
                        )}
                      </span>
                      {statusChip(j.status)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {canWrite && (
              <button
                type="button"
                onClick={() => {
                  setAddDay(dayKey);
                  setErr(null);
                }}
                className="btn-primary text-sm h-10 w-full"
              >
                <Plus size={14} />
                Schedule a job
              </button>
            )}
          </div>
        </Sheet>
      )}
    </>
  );
}
