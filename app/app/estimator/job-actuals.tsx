"use client";

import { useEffect, useState } from "react";
import { Clock, Package, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type TimeEntry = {
  id: number;
  entry_date: string;
  hours: number;
  note: string | null;
};

type ActualMaterial = {
  id: number;
  description: string;
  actual_cost: number;
};

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
}: {
  clientId: number;
  jobId: number;
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
  const [matDesc, setMatDesc] = useState("");
  const [matCost, setMatCost] = useState("");

  async function load() {
    const [{ data: time }, { data: mats }, { data: est }] = await Promise.all([
      supabase
        .from("time_entries")
        .select("id, entry_date, hours, note")
        .eq("job_id", jobId)
        .order("entry_date", { ascending: false })
        .order("id", { ascending: false }),
      supabase
        .from("actual_materials")
        .select("id, description, actual_cost")
        .eq("job_id", jobId)
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
      (mats ?? []).map((m) => ({ ...m, actual_cost: Number(m.actual_cost) })),
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
  }

  async function addMaterial() {
    setErr(null);
    const cost = parseFloat(matCost);
    const description = matDesc.trim();
    if (!description) {
      setErr("Describe the material.");
      return;
    }
    if (!Number.isFinite(cost) || cost < 0) {
      setErr("Cost must be ≥ 0.");
      return;
    }
    const { error } = await supabase.from("actual_materials").insert({
      client_id: clientId,
      job_id: jobId,
      description,
      actual_cost: cost,
    });
    if (error) {
      setErr(error.message);
      return;
    }
    setMatDesc("");
    setMatCost("");
    load();
  }

  async function removeTime(id: number) {
    await supabase.from("time_entries").delete().eq("id", id);
    load();
  }

  async function removeMaterial(id: number) {
    await supabase.from("actual_materials").delete().eq("id", id);
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

      {/* Time quick-entry — one thumb: date defaults to today */}
      <div className="space-y-1.5">
        <div className="flex gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-36"
          />
          <input
            inputMode="decimal"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="hrs"
            className="w-20"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            className="flex-1 min-w-0"
          />
          <button
            type="button"
            onClick={addTime}
            className="btn-secondary shrink-0 min-h-[42px]"
            aria-label="Log time"
          >
            <Plus size={13} />
            <Clock size={13} />
          </button>
        </div>
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

      {/* Materials used */}
      <div className="space-y-1.5 pt-2 border-t border-line-subtle">
        <div className="flex gap-2">
          <input
            value={matDesc}
            onChange={(e) => setMatDesc(e.target.value)}
            placeholder="Material (e.g. 2 gal paint)"
            className="flex-1 min-w-0"
          />
          <input
            inputMode="decimal"
            value={matCost}
            onChange={(e) => setMatCost(e.target.value)}
            placeholder="$"
            className="w-24"
          />
          <button
            type="button"
            onClick={addMaterial}
            className="btn-secondary shrink-0 min-h-[42px]"
            aria-label="Log material"
          >
            <Plus size={13} />
            <Package size={13} />
          </button>
        </div>
        {materials.length > 0 && (
          <ul className="space-y-1">
            {materials.map((m) => (
              <li key={m.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 text-bone-100 truncate">
                  {m.description}
                </span>
                <span className="num text-bone-300">
                  {usd.format(m.actual_cost)}
                </span>
                <button
                  type="button"
                  onClick={() => removeMaterial(m.id)}
                  className="text-bone-500 hover:text-status-danger p-1"
                  aria-label="Delete material"
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
