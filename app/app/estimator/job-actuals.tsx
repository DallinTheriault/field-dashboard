"use client";

import { useEffect, useState } from "react";
import { Clock, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { syncTripsNow } from "./mileage/mileage-actions";

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
 * One-thumb actuals logging on a job: hours (date defaults today) and
 * materials with real dollars spent. Feeds the Insights variance loop.
 * Owner/manager only — hours and costs are pricing internals.
 */
export function JobActuals({ clientId, jobId }: { clientId: number; jobId: number }) {
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
    setHours("");
    setNote("");
    load();
    // A day on site is a round trip: mileage follows the hours on its own.
    void syncTripsNow();
  }

  async function removeTime(id: number) {
    await supabase.from("time_entries").delete().eq("id", id);
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
