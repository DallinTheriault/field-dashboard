"use client";

import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type Material = {
  id: number;
  name: string;
  unit: string;
  unit_cost: number;
  coverage_sqft_per_unit: number | null;
  purchasable_unit_size: number;
  is_placeholder: boolean;
  active: boolean;
};

type Draft = {
  name: string;
  unit: string;
  unit_cost: string;
  coverage_sqft_per_unit: string;
  purchasable_unit_size: string;
};

const EMPTY: Draft = {
  name: "",
  unit: "gal",
  unit_cost: "",
  coverage_sqft_per_unit: "",
  purchasable_unit_size: "1",
};

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function MaterialsManager({ clientId }: { clientId: number }) {
  const supabase = createClient();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from("materials")
      .select(
        "id, name, unit, unit_cost, coverage_sqft_per_unit, purchasable_unit_size, is_placeholder, active",
      )
      .order("name", { ascending: true });
    setMaterials(
      (data ?? []).map((m) => ({
        ...m,
        unit_cost: Number(m.unit_cost),
        coverage_sqft_per_unit:
          m.coverage_sqft_per_unit === null ? null : Number(m.coverage_sqft_per_unit),
        purchasable_unit_size: Number(m.purchasable_unit_size),
      })),
    );
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startEdit(m: Material) {
    setEditing(m.id);
    setDraft({
      name: m.name,
      unit: m.unit,
      unit_cost: String(m.unit_cost),
      coverage_sqft_per_unit: m.coverage_sqft_per_unit?.toString() ?? "",
      purchasable_unit_size: String(m.purchasable_unit_size),
    });
    setErr(null);
  }

  async function save() {
    setErr(null);
    const name = draft.name.trim();
    const unitCost = parseFloat(draft.unit_cost);
    const coverage = draft.coverage_sqft_per_unit.trim()
      ? parseFloat(draft.coverage_sqft_per_unit)
      : null;
    const step = parseFloat(draft.purchasable_unit_size) || 1;
    if (!name) return setErr("Name is required.");
    if (!Number.isFinite(unitCost) || unitCost < 0)
      return setErr("Unit cost must be a number ≥ 0.");
    if (coverage !== null && !(coverage > 0))
      return setErr("Coverage must be blank or > 0.");
    setSaving(true);
    const row = {
      name,
      unit: draft.unit.trim() || "each",
      unit_cost: unitCost,
      coverage_sqft_per_unit: coverage,
      purchasable_unit_size: step,
      // Any hand-saved row is real, not a seed.
      is_placeholder: false,
    };
    const { error } =
      editing === "new"
        ? await supabase.from("materials").insert({ client_id: clientId, ...row })
        : await supabase.from("materials").update(row).eq("id", editing);
    setSaving(false);
    if (error) return setErr(error.message);
    setEditing(null);
    load();
  }

  async function remove(m: Material) {
    if (!confirm(`Delete "${m.name}"?`)) return;
    const { error } = await supabase.from("materials").delete().eq("id", m.id);
    if (error) {
      // Referenced by catalog links or estimates — deactivate instead.
      await supabase.from("materials").update({ active: false }).eq("id", m.id);
    }
    load();
  }

  if (loading) {
    return <div className="px-4 py-4 text-2xs text-bone-400">Loading…</div>;
  }

  const form = (
    <div className="bg-ink-2 border border-line rounded-sm p-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="field-group col-span-2 sm:col-span-1">
          <span className="field-label">Name</span>
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Interior paint"
            className="w-full"
          />
        </label>
        <label className="field-group">
          <span className="field-label">Unit</span>
          <select
            value={draft.unit}
            onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
            className="w-full"
          >
            {["gal", "each", "tube", "sheet", "lb"].map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <label className="field-group">
          <span className="field-label">Cost per unit</span>
          <input
            inputMode="decimal"
            value={draft.unit_cost}
            onChange={(e) => setDraft({ ...draft, unit_cost: e.target.value })}
            placeholder="38"
            className="w-full"
          />
        </label>
        <label className="field-group">
          <span className="field-label">Coverage sqft / unit</span>
          <input
            inputMode="decimal"
            value={draft.coverage_sqft_per_unit}
            onChange={(e) =>
              setDraft({ ...draft, coverage_sqft_per_unit: e.target.value })
            }
            placeholder="350 (paint only)"
            className="w-full"
          />
          <span className="field-hint">Blank for non-coverage items.</span>
        </label>
        <label className="field-group">
          <span className="field-label">Buy in multiples of</span>
          <input
            inputMode="decimal"
            value={draft.purchasable_unit_size}
            onChange={(e) =>
              setDraft({ ...draft, purchasable_unit_size: e.target.value })
            }
            className="w-full"
          />
          <span className="field-hint">Estimates always round quantities up to this.</span>
        </label>
      </div>
      {err && <div className="form-error">{err}</div>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setEditing(null)}
          className="btn-ghost text-sm"
        >
          <X size={13} />
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="btn-primary text-sm"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : "Save material"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="px-4 py-4 space-y-3">
      <ul className="space-y-1.5">
        {materials.map((m) =>
          editing === m.id ? (
            <li key={m.id}>{form}</li>
          ) : (
            <li
              key={m.id}
              className={`flex items-center gap-2.5 px-3 py-2 bg-ink-2 rounded-sm shadow-inset-line ${
                m.active ? "" : "opacity-50"
              }`}
            >
              <div className="flex-1 min-w-0">
                <span className="text-sm text-bone-100 truncate">{m.name}</span>
                {m.is_placeholder && (
                  <span className="ml-2 chip border-status-lead/40 text-status-lead">
                    placeholder
                  </span>
                )}
                {!m.active && (
                  <span className="ml-2 text-2xs text-bone-500 uppercase">inactive</span>
                )}
              </div>
              <span className="num text-sm text-bone-300 shrink-0">
                {usd.format(m.unit_cost)}/{m.unit}
                {m.coverage_sqft_per_unit ? ` · ${m.coverage_sqft_per_unit} sqft` : ""}
              </span>
              <button
                type="button"
                onClick={() => startEdit(m)}
                className="text-bone-400 hover:text-bone-100 p-1"
                aria-label={`Edit ${m.name}`}
              >
                <Pencil size={13} />
              </button>
              <button
                type="button"
                onClick={() => remove(m)}
                className="text-bone-500 hover:text-status-danger p-1"
                aria-label={`Delete ${m.name}`}
              >
                <Trash2 size={13} />
              </button>
            </li>
          ),
        )}
        {materials.length === 0 && editing !== "new" && (
          <li className="text-2xs text-bone-400">
            No materials yet. Paint, primer, patch compound, caulk, sundries…
          </li>
        )}
      </ul>

      {editing === "new" ? (
        form
      ) : (
        <button
          type="button"
          onClick={() => {
            setEditing("new");
            setDraft(EMPTY);
            setErr(null);
          }}
          className="btn-secondary text-sm"
        >
          <Plus size={13} />
          Add material
        </button>
      )}
    </div>
  );
}
