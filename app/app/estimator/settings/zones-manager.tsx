"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Zone = {
  id: number;
  label: string;
  flat_fee: number;
  active: boolean;
};

const ZONE_DEFAULTS = [
  { label: "0–15 mi", flat_fee: 0 },
  { label: "15–30 mi", flat_fee: 35 },
  { label: "30–50 mi", flat_fee: 75 },
  { label: "50+ mi", flat_fee: 125 },
];

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function ZonesManager({ clientId }: { clientId: number }) {
  const supabase = createClient();
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newFee, setNewFee] = useState("");

  async function load() {
    const { data } = await supabase
      .from("travel_zones")
      .select("id, label, flat_fee, active")
      .order("flat_fee", { ascending: true });
    setZones((data ?? []).map((z) => ({ ...z, flat_fee: Number(z.flat_fee) })));
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function seedDefaults() {
    setSeeding(true);
    setErr(null);
    const { error } = await supabase
      .from("travel_zones")
      .insert(ZONE_DEFAULTS.map((z) => ({ client_id: clientId, ...z })));
    if (error) setErr(error.message);
    setSeeding(false);
    load();
  }

  async function add() {
    setErr(null);
    const label = newLabel.trim();
    const fee = parseFloat(newFee);
    if (!label) return setErr("Label is required.");
    if (!Number.isFinite(fee) || fee < 0) return setErr("Fee must be ≥ 0.");
    const { error } = await supabase
      .from("travel_zones")
      .insert({ client_id: clientId, label, flat_fee: fee });
    if (error) return setErr(error.message);
    setNewLabel("");
    setNewFee("");
    load();
  }

  async function remove(z: Zone) {
    if (!confirm(`Delete "${z.label}"? Saved estimates keep their frozen fee.`)) return;
    const { error } = await supabase.from("travel_zones").delete().eq("id", z.id);
    if (error) {
      await supabase.from("travel_zones").update({ active: false }).eq("id", z.id);
    }
    load();
  }

  if (loading) {
    return <div className="px-4 py-4 text-2xs text-bone-400">Loading…</div>;
  }

  return (
    <div className="px-4 py-4 space-y-3">
      <ul className="space-y-1.5">
        {zones.map((z) => (
          <li
            key={z.id}
            className={`flex items-center gap-2.5 px-3 py-2 bg-ink-2 rounded-sm shadow-inset-line ${
              z.active ? "" : "opacity-50"
            }`}
          >
            <span className="flex-1 text-sm text-bone-100 truncate">{z.label}</span>
            <span className="num text-sm text-bone-300">{usd.format(z.flat_fee)}</span>
            <button
              type="button"
              onClick={() => remove(z)}
              className="text-bone-500 hover:text-status-danger p-1"
              aria-label={`Delete ${z.label}`}
            >
              <Trash2 size={13} />
            </button>
          </li>
        ))}
        {zones.length === 0 && (
          <li className="text-2xs text-bone-400">
            No zones yet.{" "}
            <button
              type="button"
              onClick={seedDefaults}
              disabled={seeding}
              className="text-field-500 hover:text-field-400 font-medium"
            >
              {seeding ? "Adding…" : "Add starter zones ($0 / $35 / $75 / $125)"}
            </button>
          </li>
        )}
      </ul>

      {err && <div className="form-error">{err}</div>}

      <div className="flex gap-2">
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Label (e.g. 15–30 mi)"
          className="flex-1 min-w-0"
        />
        <input
          inputMode="decimal"
          value={newFee}
          onChange={(e) => setNewFee(e.target.value)}
          placeholder="$"
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
