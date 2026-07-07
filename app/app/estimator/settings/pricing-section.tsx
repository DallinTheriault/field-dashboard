"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  effectiveSellRate,
  loadedLaborRate,
  monthlyBillableHours,
} from "@/lib/estimator/rates";

type Settings = {
  desired_annual_owner_pay: number;
  hours_worked_per_week: number;
  utilization_pct: number;
  margin_pct: number;
  material_markup_pct: number;
  minimum_job_charge: number;
  rounding_increment: number;
};

type OverheadItem = {
  id: number;
  name: string;
  monthly_amount: number;
  active: boolean;
};

const DEFAULTS: Settings = {
  desired_annual_owner_pay: 0,
  hours_worked_per_week: 40,
  utilization_pct: 0.55,
  margin_pct: 0.4,
  material_markup_pct: 0,
  minimum_job_charge: 150,
  rounding_increment: 5,
};

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/**
 * Pay/hours/margin settings + overhead worksheet in one component so the
 * derived rates (the whole point of this screen) recompute live as either
 * side changes. Same math the estimate builder uses (lib/estimator/rates).
 */
export function PricingSection({ clientId }: { clientId: number }) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Settings>(DEFAULTS);
  const [items, setItems] = useState<OverheadItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");

  useEffect(() => {
    (async () => {
      const [{ data: s }, { data: o }] = await Promise.all([
        supabase
          .from("pricing_settings")
          .select(
            "desired_annual_owner_pay, hours_worked_per_week, utilization_pct, margin_pct, material_markup_pct, minimum_job_charge, rounding_increment",
          )
          .maybeSingle(),
        supabase
          .from("overhead_items")
          .select("id, name, monthly_amount, active")
          .order("created_at", { ascending: true }),
      ]);
      if (s) {
        setForm({
          desired_annual_owner_pay: Number(s.desired_annual_owner_pay),
          hours_worked_per_week: Number(s.hours_worked_per_week),
          utilization_pct: Number(s.utilization_pct),
          margin_pct: Number(s.margin_pct),
          material_markup_pct: Number(s.material_markup_pct),
          minimum_job_charge: Number(s.minimum_job_charge),
          rounding_increment: Number(s.rounding_increment),
        });
      }
      setItems(
        (o ?? []).map((i) => ({ ...i, monthly_amount: Number(i.monthly_amount) })),
      );
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const monthlyOverhead = useMemo(
    () =>
      items
        .filter((i) => i.active)
        .reduce((s, i) => s + (i.monthly_amount || 0), 0),
    [items],
  );

  const mbh = monthlyBillableHours(
    form.hours_worked_per_week,
    form.utilization_pct,
  );
  const rate = loadedLaborRate(
    form.desired_annual_owner_pay,
    monthlyOverhead,
    mbh,
  );
  const sellRate = effectiveSellRate(rate, form.margin_pct);

  function num(v: string): number {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }

  async function saveSettings() {
    setSaving(true);
    setErr(null);
    setSaved(false);
    const { error } = await supabase
      .from("pricing_settings")
      .upsert({ client_id: clientId, ...form }, { onConflict: "client_id" });
    if (error) setErr(error.message);
    else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  async function addItem() {
    const name = newName.trim();
    const amount = num(newAmount);
    if (!name || amount < 0) return;
    const { data, error } = await supabase
      .from("overhead_items")
      .insert({ client_id: clientId, name, monthly_amount: amount })
      .select("id, name, monthly_amount, active")
      .single();
    if (error) {
      setErr(error.message);
      return;
    }
    setItems([...items, { ...data, monthly_amount: Number(data.monthly_amount) }]);
    setNewName("");
    setNewAmount("");
  }

  async function toggleItem(it: OverheadItem) {
    const { error } = await supabase
      .from("overhead_items")
      .update({ active: !it.active })
      .eq("id", it.id);
    if (!error) {
      setItems(items.map((i) => (i.id === it.id ? { ...i, active: !i.active } : i)));
    }
  }

  async function removeItem(id: number) {
    if (!confirm("Remove this overhead item?")) return;
    const { error } = await supabase.from("overhead_items").delete().eq("id", id);
    if (!error) setItems(items.filter((i) => i.id !== id));
  }

  if (loading) {
    return <div className="px-4 py-4 text-2xs text-bone-400">Loading…</div>;
  }

  return (
    <div className="px-4 py-4 space-y-5">
      {/* Derived rates — live gut-check */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Billable hrs / mo", value: mbh.toFixed(1) },
          { label: "Loaded rate", value: `${usd.format(rate)}/hr` },
          { label: "Effective sell rate", value: `${usd.format(sellRate)}/hr` },
        ].map((m) => (
          <div key={m.label} className="bg-ink-2 rounded-sm px-3 py-2.5 shadow-inset-line">
            <div className="label-eyebrow">{m.label}</div>
            <div className="num text-base text-bone-50 mt-0.5">{m.value}</div>
          </div>
        ))}
      </div>
      <p className="text-2xs text-bone-400 -mt-2">
        Sell rate = loaded rate ÷ (1 − margin). Gut-check it against market
        $/hr — if it looks wrong, the inputs below are wrong.
      </p>

      {/* Pay & hours */}
      <div className="grid grid-cols-2 gap-3">
        <label className="field-group">
          <span className="field-label">What this business pays you / yr</span>
          <input
            inputMode="decimal"
            value={form.desired_annual_owner_pay || ""}
            onChange={(e) =>
              setForm({ ...form, desired_annual_owner_pay: num(e.target.value) })
            }
            placeholder="60000"
            className="w-full"
          />
        </label>
        <label className="field-group">
          <span className="field-label">Hours worked / week</span>
          <input
            inputMode="decimal"
            value={form.hours_worked_per_week || ""}
            onChange={(e) =>
              setForm({ ...form, hours_worked_per_week: num(e.target.value) })
            }
            className="w-full"
          />
          <span className="field-hint">
            Hours you actually put into this business — part-time is fine.
          </span>
        </label>
        <label className="field-group">
          <span className="field-label">Utilization %</span>
          <input
            inputMode="decimal"
            value={Math.round(form.utilization_pct * 100) || ""}
            onChange={(e) =>
              setForm({ ...form, utilization_pct: num(e.target.value) / 100 })
            }
            className="w-full"
          />
          <span className="field-hint">
            Share of worked hours that are billable. Solo operators typically
            bill 50–65% — the rest is driving, quoting, admin.
          </span>
        </label>
        <label className="field-group">
          <span className="field-label">Margin %</span>
          <input
            inputMode="decimal"
            value={Math.round(form.margin_pct * 100) || ""}
            onChange={(e) =>
              setForm({ ...form, margin_pct: num(e.target.value) / 100 })
            }
            className="w-full"
          />
        </label>
        <label className="field-group">
          <span className="field-label">Minimum job charge</span>
          <input
            inputMode="decimal"
            value={form.minimum_job_charge || ""}
            onChange={(e) =>
              setForm({ ...form, minimum_job_charge: num(e.target.value) })
            }
            className="w-full"
          />
        </label>
        <label className="field-group">
          <span className="field-label">Round price up to nearest</span>
          <input
            inputMode="decimal"
            value={form.rounding_increment || ""}
            onChange={(e) =>
              setForm({ ...form, rounding_increment: num(e.target.value) || 1 })
            }
            className="w-full"
          />
        </label>
      </div>

      {/* Overhead worksheet */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <span className="field-label">Monthly overhead</span>
          <span className="num text-sm text-bone-100">
            {usd.format(monthlyOverhead)}/mo
          </span>
        </div>
        <ul className="space-y-1.5 mb-2">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={it.active}
                onChange={() => toggleItem(it)}
                className="w-4 h-4 shrink-0"
                title={it.active ? "Counted in overhead" : "Excluded"}
              />
              <span
                className={`flex-1 text-sm truncate ${
                  it.active ? "text-bone-100" : "text-bone-500 line-through"
                }`}
              >
                {it.name}
              </span>
              <span className="num text-sm text-bone-300">
                {usd.format(it.monthly_amount)}
              </span>
              <button
                type="button"
                onClick={() => removeItem(it.id)}
                className="text-bone-500 hover:text-status-danger p-1"
                aria-label={`Remove ${it.name}`}
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
          {items.length === 0 && (
            <li className="text-2xs text-bone-400">
              Insurance, fuel baseline, software, tool fund, license renewal
              (÷12)… everything it costs monthly just to be in business.
            </li>
          )}
        </ul>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Item (e.g. Liability insurance)"
            className="flex-1 min-w-0"
          />
          <input
            inputMode="decimal"
            value={newAmount}
            onChange={(e) => setNewAmount(e.target.value)}
            placeholder="$/mo"
            className="w-24"
          />
          <button type="button" onClick={addItem} className="btn-secondary shrink-0">
            <Plus size={13} />
            Add
          </button>
        </div>
      </div>

      {err && <div className="form-error">{err}</div>}

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-line-subtle">
        {saved && <span className="text-2xs text-field-500">Saved.</span>}
        <button
          type="button"
          onClick={saveSettings}
          disabled={saving}
          className="btn-primary text-sm"
        >
          {saving ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              Saving…
            </>
          ) : (
            "Save pricing settings"
          )}
        </button>
      </div>
    </div>
  );
}
