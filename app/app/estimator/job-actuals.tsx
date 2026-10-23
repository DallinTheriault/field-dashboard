"use client";

import { useEffect, useState } from "react";
import { Clock, Lock, Plus, Trash2 } from "lucide-react";
import { browserSupabase } from "@/lib/supabase/lazy-client";
import { syncTripsNow } from "./mileage/mileage-actions";

type TimeEntry = {
  id: number;
  entry_date: string;
  hours: number;
  note: string | null;
  /** Where the hours stand on invoices: final once their invoice went out. */
  billing: { label: string; locked: boolean } | null;
};

type EntryInvoice = { invoice_number: string | null; status: string; stripe_invoice_id: string | null } | null;

function billingOf(invoiceId: number | null, coveredAt: string | null, inv: EntryInvoice): TimeEntry["billing"] {
  if (!invoiceId) return coveredAt ? { label: "settled", locked: false } : null;
  const number = inv?.invoice_number ?? "an invoice";
  const wentOut = !!inv && inv.status !== "voided" && (inv.status !== "draft" || !!inv.stripe_invoice_id);
  if (!wentOut) return { label: `on draft ${number}`, locked: false };
  return { label: coveredAt ? `covered by ${number}` : `billed on ${number}`, locked: true };
}

export type ActualsTimeRow = {
  id: number;
  entry_date: string;
  hours: number | string;
  note: string | null;
  invoice_id: number | null;
  covered_at: string | null;
  invoice: unknown;
};
export type ActualsMaterialRow = {
  id: number;
  description: string;
  qty: number | string | null;
  amount: number | string;
  assignment: string | null;
  invoiced_on: unknown;
};
export type ActualsInitial = {
  time: ActualsTimeRow[];
  materials: ActualsMaterialRow[];
  /** The latest estimate's line hours; null without an estimate. */
  estimateHours: Array<number | string> | null;
};

const toEntries = (time: ActualsTimeRow[]): TimeEntry[] =>
  time.map((t) => ({
    id: t.id,
    entry_date: t.entry_date,
    note: t.note,
    hours: Number(t.hours),
    billing: billingOf(t.invoice_id, t.covered_at, t.invoice as EntryInvoice),
  }));
const toMaterials = (mats: ActualsMaterialRow[]): ActualMaterial[] =>
  mats
    .filter((m) => m.assignment !== "stock")
    .map((m) => ({
      id: m.id,
      description: m.description,
      qty: m.qty === null ? null : Number(m.qty),
      actual_cost: Number(m.amount),
      assignment: m.assignment ?? "job_in_bid",
      invoiced: m.invoiced_on !== null && m.invoiced_on !== undefined,
    }));
const toEstHours = (hours: Array<number | string> | null) =>
  hours === null || hours.length === 0 ? null : hours.reduce<number>((s, h) => s + Number(h), 0);

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
 * One-thumb actuals logging on a job: hours (date defaults today) and
 * materials with real dollars spent. Feeds the Insights variance loop.
 * Owner/manager only — hours and costs are pricing internals.
 */
export function JobActuals({
  clientId,
  jobId,
  initial,
}: {
  clientId: number;
  jobId: number;
  /** Rendered with the page (no load after it shows); reloads after edits. */
  initial?: ActualsInitial;
}) {
  const [loading, setLoading] = useState(!initial);
  const [entries, setEntries] = useState<TimeEntry[]>(initial ? toEntries(initial.time) : []);
  const [materials, setMaterials] = useState<ActualMaterial[]>(initial ? toMaterials(initial.materials) : []);
  const [estHours, setEstHours] = useState<number | null>(initial ? toEstHours(initial.estimateHours) : null);
  const [err, setErr] = useState<string | null>(null);
  // Quick-entry state
  const [date, setDate] = useState(todayISO());
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");

  async function load() {
    const supabase = await browserSupabase();
    const [{ data: time }, { data: mats }, { data: est }] = await Promise.all([
      supabase
        .from("time_entries")
        .select("id, entry_date, hours, note, invoice_id, covered_at, invoice:invoices!time_entries_invoice_same_tenant(invoice_number, status, stripe_invoice_id)")
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
    setEntries(toEntries((time ?? []) as ActualsTimeRow[]));
    setMaterials(toMaterials((mats ?? []) as ActualsMaterialRow[]));
    const lines = (est?.estimate_line_items ?? []) as Array<{ resolved_labor_hours: number }>;
    setEstHours(est ? toEstHours(lines.map((l) => l.resolved_labor_hours)) : null);
    setLoading(false);
  }

  // The page renders the first load; fetch here only without it.
  useEffect(() => {
    if (!initial) load();
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
    const supabase = await browserSupabase();
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
    setHours("");
    setNote("");
    load();
    // A day on site is a round trip: mileage follows the hours on its own.
    void syncTripsNow();
  }

  async function removeTime(id: number) {
    setErr(null);
    const supabase = await browserSupabase();
    const { error } = await supabase.from("time_entries").delete().eq("id", id);
    if (error) setErr(error.message);
    load();
    void syncTripsNow();
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
                {e.billing && (
                  <span className="flex items-center gap-1 text-2xs text-bone-500 shrink-0" data-testid="hours-billing">
                    {e.billing.locked && <Lock size={9} />}
                    {e.billing.label}
                  </span>
                )}
                {!e.billing?.locked && (
                  <button
                    type="button"
                    onClick={() => removeTime(e.id)}
                    className="text-bone-500 hover:text-status-danger p-1"
                    aria-label="Delete entry"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {err && <div className="form-error">{err}</div>}
    </div>
  );
}
