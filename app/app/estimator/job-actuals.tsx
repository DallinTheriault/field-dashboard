"use client";

import { useEffect, useState } from "react";
import { Car, Clock, Loader2, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createTrip } from "./mileage/mileage-actions";

type TimeEntry = {
  id: number;
  entry_date: string;
  hours: number;
  note: string | null;
};

type ActualMaterial = {
  id: number;
  description: string;
  qty: number | null;
  actual_cost: number;
  assignment: string;
  invoiced: boolean;
};


const round2 = (n: number) => Math.round((n + 1e-9) * 100) / 100;

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Per-device memory of "no thanks" so the prompt doesn't nag for a day the
 * user already declined. This is a CONVENIENCE only — the guarantee that one
 * job+date can't collect two proposed trips lives server-side (and in a
 * partial unique index), so a cleared browser can't produce a duplicate.
 */
const dismissKey = (jobId: number, date: string) => `mileage-dismissed:${jobId}:${date}`;

function isTripDismissed(jobId: number, date: string): boolean {
  try {
    return window.localStorage.getItem(dismissKey(jobId, date)) === "1";
  } catch {
    return false;
  }
}

function dismissTrip(jobId: number, date: string) {
  try {
    window.localStorage.setItem(dismissKey(jobId, date), "1");
  } catch {
    /* private mode — the prompt simply reappears next time */
  }
}

/**
 * Propose, don't ask (§5.4): base → property and back, prefilled from the
 * cached distance. One tap logs it; Edit opens the miles field (needed the
 * first time a property is visited); No dismisses this day.
 */
function TripProposal({
  jobId,
  date,
  ctx,
  onDone,
  onDismiss,
  onError,
}: {
  jobId: number;
  date: string;
  ctx: MileageContext;
  onDone: () => void;
  onDismiss: () => void;
  onError: (m: string | null) => void;
}) {
  const needsMiles = ctx.cachedMiles === null;
  const [editing, setEditing] = useState(needsMiles);
  const [miles, setMiles] = useState(ctx.cachedMiles === null ? "" : String(ctx.cachedMiles));
  const [destination, setDestination] = useState(ctx.destination ?? "");
  const [saveToProperty, setSaveToProperty] = useState(needsMiles);
  const [busy, setBusy] = useState(false);

  async function log() {
    onError(null);
    setBusy(true);
    const r = await createTrip({
      tripDate: date,
      destination,
      purpose: ctx.purpose,
      miles,
      jobId,
      source: "proposed",
      // Only writes the property cache when the user leaves the box ticked —
      // editing a single trip never silently overwrites the saved distance.
      saveDistanceToPropertyId:
        saveToProperty && ctx.propertyId !== null ? ctx.propertyId : null,
    });
    setBusy(false);
    if (!r.ok) return onError(r.error);
    onDone();
  }

  return (
    <div className="panel px-3 py-2.5 border-field-500/40 bg-field-500/[0.06] space-y-2">
      <div className="flex items-start gap-2">
        <Car size={13} className="text-field-400 shrink-0 mt-0.5" />
        <p className="text-2xs text-bone-100 leading-relaxed">
          Log a trip for {date}?{" "}
          {ctx.baseAddress ? (
            <>
              <span className="text-bone-50">{ctx.baseAddress}</span> →{" "}
            </>
          ) : null}
          <span className="text-bone-50">{destination || "destination"}</span> and
          back
          {ctx.cachedMiles !== null && (
            <>
              , <span className="num">{ctx.cachedMiles}</span> mi
            </>
          )}
          .
        </p>
      </div>

      {editing && (
        <div className="space-y-1.5">
          <input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Destination"
            className="w-full text-sm"
            aria-label="Trip destination"
          />
          <div className="flex items-center gap-2">
            <input
              inputMode="decimal"
              value={miles}
              onChange={(e) => setMiles(e.target.value)}
              placeholder="total miles"
              className="w-28 text-sm"
              aria-label="Trip miles"
            />
            {ctx.propertyId !== null && (
              <label className="flex items-center gap-1.5 text-2xs text-bone-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveToProperty}
                  onChange={(e) => setSaveToProperty(e.target.checked)}
                />
                Save as this property&apos;s distance
              </label>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={log}
          disabled={busy}
          className="btn-primary text-xs h-8"
        >
          {busy ? <Loader2 size={11} className="animate-spin" /> : null}
          Log it
        </button>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="btn-secondary text-xs h-8"
          >
            Edit
          </button>
        )}
        <button type="button" onClick={onDismiss} className="btn-ghost text-xs h-8">
          No
        </button>
      </div>
    </div>
  );
}

/**
 * One-thumb actuals logging on a job: hours (date defaults today) and
 * materials with real dollars spent. Feeds the Insights variance loop.
 * Owner/manager only — hours and costs are pricing internals.
 */
export type MileageContext = {
  /** Origin for the proposed trip; null when the tenant hasn't set one. */
  baseAddress: string | null;
  /** The job's property (or its inline address as a fallback). */
  destination: string | null;
  /** Cached one-property distance; blank means the user enters it once. */
  cachedMiles: number | null;
  /** Only set when the miles came from a property we can update on request. */
  propertyId: number | null;
  /** Seeds the business purpose. */
  purpose: string;
};

export function JobActuals({
  clientId,
  jobId,
  mileage,
}: {
  clientId: number;
  jobId: number;
  /** Passed from the server component — JobActuals never fetches this. */
  mileage?: MileageContext;
}) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [materials, setMaterials] = useState<ActualMaterial[]>([]);
  const [estHours, setEstHours] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Quick-entry state
  const [date, setDate] = useState(todayISO());
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  // Trip proposal: raised right after hours land, for that date only.
  const [proposeFor, setProposeFor] = useState<string | null>(null);

  async function load() {
    const [{ data: time }, { data: mats }, { data: est }] = await Promise.all([
      supabase
        .from("time_entries")
        .select("id, entry_date, hours, note")
        .eq("job_id", jobId)
        .order("entry_date", { ascending: false })
        .order("id", { ascending: false }),
      supabase
        .from("expenses")
        .select("id, description, qty, amount, assignment, invoiced_on")
        .eq("job_id", jobId)
        .neq("assignment", "stock")
        .order("id", { ascending: false }),
      supabase
        .from("estimates")
        .select("id, estimate_line_items(resolved_labor_hours)")
        .eq("job_id", jobId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    setEntries(
      (time ?? []).map((t) => ({ ...t, hours: Number(t.hours) })),
    );
    setMaterials(
      (mats ?? []).map((m) => ({
        id: m.id,
        description: m.description,
        qty: m.qty === null ? null : Number(m.qty),
        actual_cost: Number(m.amount),
        assignment: m.assignment ?? "job_in_bid",
        invoiced: m.invoiced_on !== null && m.invoiced_on !== undefined,
      })),
    );
    const lines = (est?.estimate_line_items ?? []) as Array<{
      resolved_labor_hours: number;
    }>;
    setEstHours(
      lines.length > 0
        ? lines.reduce((s, l) => s + Number(l.resolved_labor_hours), 0)
        : null,
    );
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const loggedHours = entries.reduce((s, e) => s + e.hours, 0);
  const matTotal = materials.reduce((s, m) => s + m.actual_cost, 0);

  async function addTime() {
    setErr(null);
    const h = parseFloat(hours);
    if (!Number.isFinite(h) || h <= 0) {
      setErr("Hours must be > 0.");
      return;
    }
    const { error } = await supabase.from("time_entries").insert({
      client_id: clientId,
      job_id: jobId,
      entry_date: date || todayISO(),
      hours: h,
      note: note.trim() || null,
    });
    if (error) {
      setErr(error.message);
      return;
    }
    const loggedDate = date || todayISO();
    setHours("");
    setNote("");
    load();

    // Propose a trip for the day just logged — unless one already exists for
    // this job + date, or the user dismissed this day on this device. The
    // server enforces the no-duplicate rule regardless of what the client
    // remembers; this check only decides whether to show the prompt.
    if (mileage) {
      const { count } = await supabase
        .from("mileage_entries")
        .select("*", { count: "exact", head: true })
        .eq("job_id", jobId)
        .eq("trip_date", loggedDate);
      if ((count ?? 0) === 0 && !isTripDismissed(jobId, loggedDate)) {
        setProposeFor(loggedDate);
      }
    }
  }

  async function removeTime(id: number) {
    await supabase.from("time_entries").delete().eq("id", id);
    load();
  }

  if (loading) {
    return (
      <div className="panel px-4 py-3 mb-5 text-2xs text-bone-400">
        Loading actuals…
      </div>
    );
  }

  return (
    <div className="panel px-4 py-3 mb-5 space-y-4">
      <div className="flex items-baseline justify-between">
        <div className="label-eyebrow">Actuals</div>
        <div className="text-2xs text-bone-400">
          <span className="num text-bone-100">{loggedHours.toFixed(1)}</span>
          {estHours !== null && (
            <>
              {" "}
              / <span className="num">{estHours.toFixed(1)}</span> est
            </>
          )}{" "}
          hrs
          {matTotal > 0 && (
            <>
              {" · "}
              <span className="num text-bone-100">{usd.format(matTotal)}</span>{" "}
              materials
            </>
          )}
        </div>
      </div>

      {/* Trip proposal (§5.4) — offered right after hours land, one tap. */}
      {mileage && proposeFor && (
        <TripProposal
          jobId={jobId}
          date={proposeFor}
          ctx={mileage}
          onDone={() => setProposeFor(null)}
          onDismiss={() => {
            dismissTrip(jobId, proposeFor);
            setProposeFor(null);
          }}
          onError={setErr}
        />
      )}

      {/* Time quick-entry — one thumb: date defaults to today.
          Stacked rather than one line: at 390px four controls on a row
          squeezed the note down to a single character of its placeholder,
          so nothing after the hours field could be identified. Each control
          now carries a visible label and the note gets the full width. */}
      <div className="space-y-1.5">
        <div className="flex gap-2">
          <label className="flex-1 min-w-0">
            <span className="block text-2xs text-bone-400 mb-0.5">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full"
            />
          </label>
          <label className="w-24 shrink-0">
            <span className="block text-2xs text-bone-400 mb-0.5">Hours</span>
            <input
              inputMode="decimal"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="0.0"
              className="w-full"
            />
          </label>
        </div>
        <label className="block">
          <span className="block text-2xs text-bone-400 mb-0.5">Note (optional)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            className="w-full"
          />
        </label>
        <button
          type="button"
          onClick={addTime}
          className="btn-secondary w-full min-h-[42px]"
          aria-label="Log time"
        >
          <Plus size={13} />
          <Clock size={13} />
          Log time
        </button>
        {entries.length > 0 && (
          <ul className="space-y-1">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center gap-2 text-sm">
                <span className="text-2xs text-bone-400 font-mono w-20 shrink-0">
                  {e.entry_date.slice(5)}
                </span>
                <span className="num text-bone-100 w-14">{e.hours} h</span>
                <span className="flex-1 text-2xs text-bone-400 truncate">
                  {e.note ?? ""}
                </span>
                <button
                  type="button"
                  onClick={() => removeTime(e.id)}
                  className="text-bone-500 hover:text-status-danger p-1"
                  aria-label="Delete entry"
                >
                  <Trash2 size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {err && <div className="form-error">{err}</div>}
    </div>
  );
}
