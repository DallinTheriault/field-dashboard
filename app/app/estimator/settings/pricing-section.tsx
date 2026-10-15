"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export const PRICING_SAVED_EVENT = "field:pricing-settings-saved";

type Form = { general: string; skilled: string; minimum: string; markup: string };

/** Blank is allowed for the rates (not set: lines need a price). */
function money(v: string, label: string, blank: "null" | "zero"): number | null | string {
  if (v.trim() === "") return blank === "null" ? null : 0;
  const n = Number(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : `${label} must be a number, 0 or more.`;
}

/**
 * Your rates: the four numbers pricing runs on. Saving writes only these
 * columns; the old calculator's columns (owner pay, hours, utilization,
 * margin, rounding, overhead) are kept for the old estimate builder.
 */
export function PricingSection({ clientId }: { clientId: number }) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Form>({ general: "", skilled: "", minimum: "150", markup: "0" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase
        .from("pricing_settings")
        .select("default_hourly_rate, skilled_hourly_rate, minimum_job_charge, material_markup_pct")
        .maybeSingle();
      if (s) {
        const str = (v: unknown) => (v === null || v === undefined ? "" : String(Number(v)));
        setForm({
          general: str(s.default_hourly_rate),
          skilled: str(s.skilled_hourly_rate),
          minimum: str(s.minimum_job_charge),
          // Stored as a fraction (0.2); shown as a percent (20).
          markup: String(Math.round(Number(s.material_markup_pct) * 10000) / 100),
        });
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    setErr(null);
    setSaved(false);
    const general = money(form.general, "General rate", "null");
    const skilled = money(form.skilled, "Skilled rate", "null");
    const minimum = money(form.minimum, "Minimum job charge", "zero");
    const markup = money(form.markup.replace("%", ""), "Material markup", "zero");
    const bad = [general, skilled, minimum, markup].find((v) => typeof v === "string");
    if (bad) return setErr(bad as string);
    setSaving(true);
    const { error } = await supabase.from("pricing_settings").upsert(
      {
        client_id: clientId,
        default_hourly_rate: general,
        skilled_hourly_rate: skilled,
        minimum_job_charge: minimum,
        material_markup_pct: Math.round(((markup as number) / 100) * 1e6) / 1e6,
      },
      { onConflict: "client_id" },
    );
    setSaving(false);
    if (error) return setErr(error.message);
    // The price book on this page prices rows from these rates.
    window.dispatchEvent(new Event(PRICING_SAVED_EVENT));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) {
    return <div className="px-4 py-4 text-2xs text-bone-400">Loading…</div>;
  }

  const field = (key: keyof Form, label: string, hint: string, prefix: string, suffix: string) => (
    <label className="field-group">
      <span className="field-label">{label}</span>
      <span className="flex items-center gap-1.5">
        {prefix && <span className="text-bone-400 text-sm">{prefix}</span>}
        <input
          inputMode="decimal"
          value={form[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          className="w-full min-h-[44px]"
          aria-label={label}
        />
        {suffix && <span className="text-bone-400 text-sm whitespace-nowrap">{suffix}</span>}
      </span>
      <span className="field-hint">{hint}</span>
    </label>
  );

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {field("general", "General hourly rate", "“Labor, hourly” on job lines, and price book work set to general.", "$", "/ hr")}
        {field("skilled", "Skilled hourly rate", "“Skilled labor, hourly” on job lines, and price book work set to skilled.", "$", "/ hr")}
        {field("minimum", "Minimum job charge", "The least you charge for a job. An invoice under it gets a warning.", "$", "")}
        {field("markup", "Material markup", "Added to a job’s materials when you tick “Bill marked up” on them. 0% bills them at cost.", "", "%")}
      </div>

      {err && <div className="form-error">{err}</div>}

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-line-subtle">
        {saved && <span className="text-2xs text-field-500">Saved.</span>}
        <button type="button" onClick={save} disabled={saving} className="btn-primary text-sm min-h-[44px]">
          {saving ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              Saving…
            </>
          ) : (
            "Save rates"
          )}
        </button>
      </div>
    </div>
  );
}
