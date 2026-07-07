"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Modifier = {
  id: number;
  name: string;
  scope: "LINE" | "JOB";
  math: "MULTIPLIER" | "FLAT_ADD";
  value: number;
  active: boolean;
};

const PREP_DEFAULTS = [
  { name: "Prep — Light", value: 1.0 },
  { name: "Prep — Medium", value: 1.25 },
  { name: "Prep — Heavy", value: 1.6 },
];

export function ModifiersManager({ clientId }: { clientId: number }) {
  const supabase = createClient();
  const [modifiers, setModifiers] = useState<Modifier[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");

  async function load() {
    const { data } = await supabase
      .from("price_modifiers")
      .select("id, name, scope, math, value, active")
      .order("value", { ascending: true });
    setModifiers((data ?? []).map((m) => ({ ...m, value: Number(m.value) })));
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function seedDefaults() {
    setSeeding(true);
    setErr(null);
    const { error } = await supabase.from("price_modifiers").insert(
      PREP_DEFAULTS.map((p) => ({
        client_id: clientId,
        name: p.name,
        scope: "LINE",
        math: "MULTIPLIER",
        value: p.value,
      })),
    );
    if (error) setErr(error.message);
    setSeeding(false);
    load();
  }

  async function add() {
    setErr(null);
    const name = newName.trim();
    const value = parseFloat(newValue);
    if (!name) return setErr("Name is required.");
    if (!Number.isFinite(value) || value <= 0)
      return setErr("Multiplier must be > 0 (1.25 = +25% labor).");
    const { error } = await supabase.from("price_modifiers").insert({
      client_id: clientId,
      name,
      scope: "LINE",
      math: "MULTIPLIER",
      value,
    });
    if (error) return setErr(error.message);
    setNewName("");
    setNewValue("");
    load();
  }

  async function remove(m: Modifier) {
    if (!confirm(`Delete "${m.name}"? Saved estimates keep their frozen multiplier.`))
      return;
    const { error } = await supabase.from("price_modifiers").delete().eq("id", m.id);
    if (error) {
      await supabase.from("price_modifiers").update({ active: false }).eq("id", m.id);
    }
    load();
  }

  if (loading) {
    return <div className="px-4 py-4 text-2xs text-bone-400">Loading…</div>;
  }

  return (
    <div className="px-4 py-4 space-y-3">
      <ul className="space-y-1.5">
        {modifiers.map((m) => (
          <li
            key={m.id}
            className={`flex items-center gap-2.5 px-3 py-2 bg-ink-2 rounded-sm shadow-inset-line ${
              m.active ? "" : "opacity-50"
            }`}
          >
            <span className="flex-1 text-sm text-bone-100 truncate">{m.name}</span>
            <span className="num text-sm text-bone-300">
              {m.math === "MULTIPLIER" ? `×${m.value}` : `+$${m.value}`}
            </span>
            <button
              type="button"
              onClick={() => remove(m)}
              className="text-bone-500 hover:text-status-danger p-1"
              aria-label={`Delete ${m.name}`}
            >
              <Trash2 size={13} />
            </button>
          </li>
        ))}
        {modifiers.length === 0 && (
          <li className="text-2xs text-bone-400">
            No modifiers yet.{" "}
            <button
              type="button"
              onClick={seedDefaults}
              disabled={seeding}
              className="text-field-500 hover:text-field-400 font-medium"
            >
              {seeding ? "Adding…" : "Add the standard prep levels (×1.0 / ×1.25 / ×1.6)"}
            </button>
          </li>
        )}
      </ul>

      {err && <div className="form-error">{err}</div>}

      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Name (e.g. Prep — Medium)"
          className="flex-1 min-w-0"
        />
        <input
          inputMode="decimal"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          placeholder="×1.25"
          className="w-24"
        />
        <button type="button" onClick={add} className="btn-secondary shrink-0">
          <Plus size={13} />
          Add
        </button>
      </div>
    </div>
  );
}
