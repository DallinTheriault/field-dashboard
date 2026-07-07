"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Service = {
  id: number;
  name: string;
  type: "MEASURED" | "TASK";
  unit: "sqft" | "lnft" | "each" | null;
  labor_hours_per_unit: number | null;
  flat_labor_hours: number | null;
  notes: string | null;
  is_placeholder: boolean;
  active: boolean;
};

type Link = {
  id: number;
  service_id: number;
  material_id: number;
  basis: "COVERAGE" | "PER_UNIT" | "FLAT";
  coats: number | null;
  qty_per_unit: number | null;
  flat_qty: number | null;
};

type MaterialOption = {
  id: number;
  name: string;
  unit: string;
  coverage_sqft_per_unit: number | null;
};

type Draft = {
  name: string;
  type: "MEASURED" | "TASK";
  unit: "sqft" | "lnft" | "each";
  hours: string;
  notes: string;
};

const EMPTY: Draft = { name: "", type: "MEASURED", unit: "sqft", hours: "", notes: "" };

/**
 * Service catalog CRUD + material links. Two line-item types by design:
 * MEASURED (qty × hrs/unit) for painting, TASK (flat hrs × count) for
 * handyman work. Links tell the engine what materials a service consumes.
 */
export function CatalogManager({ clientId }: { clientId: number }) {
  const supabase = createClient();
  const [services, setServices] = useState<Service[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // New-link draft (scoped to the expanded service)
  const [linkMaterial, setLinkMaterial] = useState("");
  const [linkBasis, setLinkBasis] = useState<Link["basis"]>("COVERAGE");
  const [linkValue, setLinkValue] = useState("");

  async function load() {
    const [{ data: s }, { data: l }, { data: m }] = await Promise.all([
      supabase
        .from("service_catalog")
        .select(
          "id, name, type, unit, labor_hours_per_unit, flat_labor_hours, notes, is_placeholder, active",
        )
        .order("type")
        .order("name"),
      supabase
        .from("service_materials")
        .select("id, service_id, material_id, basis, coats, qty_per_unit, flat_qty"),
      supabase
        .from("materials")
        .select("id, name, unit, coverage_sqft_per_unit")
        .eq("active", true)
        .order("name"),
    ]);
    setServices(
      (s ?? []).map((x) => ({
        ...x,
        labor_hours_per_unit:
          x.labor_hours_per_unit === null ? null : Number(x.labor_hours_per_unit),
        flat_labor_hours:
          x.flat_labor_hours === null ? null : Number(x.flat_labor_hours),
      })),
    );
    setLinks(l ?? []);
    setMaterials(m ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startEdit(s: Service) {
    setEditing(s.id);
    setDraft({
      name: s.name,
      type: s.type,
      unit: s.unit ?? "sqft",
      hours: String(s.type === "MEASURED" ? s.labor_hours_per_unit : s.flat_labor_hours),
      notes: s.notes ?? "",
    });
    setErr(null);
  }

  async function save() {
    setErr(null);
    const name = draft.name.trim();
    const hours = parseFloat(draft.hours);
    if (!name) return setErr("Name is required.");
    if (!Number.isFinite(hours) || hours <= 0)
      return setErr("Labor hours must be > 0.");
    setSaving(true);
    const row =
      draft.type === "MEASURED"
        ? {
            name,
            type: "MEASURED" as const,
            unit: draft.unit,
            labor_hours_per_unit: hours,
            flat_labor_hours: null,
            notes: draft.notes.trim() || null,
            is_placeholder: false,
          }
        : {
            name,
            type: "TASK" as const,
            unit: null,
            labor_hours_per_unit: null,
            flat_labor_hours: hours,
            notes: draft.notes.trim() || null,
            is_placeholder: false,
          };
    const { error } =
      editing === "new"
        ? await supabase.from("service_catalog").insert({ client_id: clientId, ...row })
        : await supabase.from("service_catalog").update(row).eq("id", editing);
    setSaving(false);
    if (error) return setErr(error.message);
    setEditing(null);
    load();
  }

  async function remove(s: Service) {
    if (!confirm(`Delete "${s.name}"? Saved estimates keep their frozen copy.`)) return;
    const { error } = await supabase.from("service_catalog").delete().eq("id", s.id);
    if (error) {
      await supabase.from("service_catalog").update({ active: false }).eq("id", s.id);
    }
    load();
  }

  async function addLink(service: Service) {
    setErr(null);
    const materialId = Number(linkMaterial);
    const value = parseFloat(linkValue);
    if (!materialId) return setErr("Pick a material.");
    if (!Number.isFinite(value) || value <= 0)
      return setErr("Consumption value must be > 0.");
    const row = {
      client_id: clientId,
      service_id: service.id,
      material_id: materialId,
      basis: linkBasis,
      coats: linkBasis === "COVERAGE" ? Math.max(1, Math.round(value)) : null,
      qty_per_unit: linkBasis === "PER_UNIT" ? value : null,
      flat_qty: linkBasis === "FLAT" ? value : null,
    };
    const { error } = await supabase.from("service_materials").insert(row);
    if (error) return setErr(error.message);
    setLinkMaterial("");
    setLinkValue("");
    load();
  }

  async function removeLink(id: number) {
    await supabase.from("service_materials").delete().eq("id", id);
    load();
  }

  if (loading) {
    return <div className="px-4 py-4 text-2xs text-bone-400">Loading…</div>;
  }

  const form = (
    <div className="bg-ink-2 border border-line rounded-sm p-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="field-group col-span-2">
          <span className="field-label">Service name</span>
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Walls — 2 coats"
            className="w-full"
          />
        </label>
        <label className="field-group">
          <span className="field-label">Type</span>
          <select
            value={draft.type}
            onChange={(e) =>
              setDraft({ ...draft, type: e.target.value as Draft["type"] })
            }
            className="w-full"
          >
            <option value="MEASURED">Measured (per sqft/lnft/each)</option>
            <option value="TASK">Task (flat hours)</option>
          </select>
        </label>
        {draft.type === "MEASURED" ? (
          <>
            <label className="field-group">
              <span className="field-label">Unit</span>
              <select
                value={draft.unit}
                onChange={(e) =>
                  setDraft({ ...draft, unit: e.target.value as Draft["unit"] })
                }
                className="w-full"
              >
                <option value="sqft">sqft</option>
                <option value="lnft">lnft</option>
                <option value="each">each</option>
              </select>
            </label>
            <label className="field-group">
              <span className="field-label">Labor hours per {draft.unit}</span>
              <input
                inputMode="decimal"
                value={draft.hours}
                onChange={(e) => setDraft({ ...draft, hours: e.target.value })}
                placeholder="0.010"
                className="w-full"
              />
            </label>
          </>
        ) : (
          <label className="field-group">
            <span className="field-label">Flat labor hours</span>
            <input
              inputMode="decimal"
              value={draft.hours}
              onChange={(e) => setDraft({ ...draft, hours: e.target.value })}
              placeholder="1.5"
              className="w-full"
            />
          </label>
        )}
        <label className="field-group col-span-2">
          <span className="field-label">Notes</span>
          <input
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            className="w-full"
          />
        </label>
      </div>
      {err && <div className="form-error">{err}</div>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setEditing(null)} className="btn-ghost text-sm">
          <X size={13} />
          Cancel
        </button>
        <button type="button" onClick={save} disabled={saving} className="btn-primary text-sm">
          {saving ? <Loader2 size={13} className="animate-spin" /> : "Save service"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="px-4 py-4 space-y-3">
      <ul className="space-y-1.5">
        {services.map((s) => {
          if (editing === s.id) return <li key={s.id}>{form}</li>;
          const serviceLinks = links.filter((l) => l.service_id === s.id);
          const isOpen = expanded === s.id;
          return (
            <li
              key={s.id}
              className={`bg-ink-2 rounded-sm shadow-inset-line ${s.active ? "" : "opacity-50"}`}
            >
              <div className="flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : s.id)}
                  className="text-bone-400 hover:text-bone-100"
                  aria-label={isOpen ? "Collapse" : "Expand materials"}
                >
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-bone-100 truncate">{s.name}</span>
                  {s.is_placeholder && (
                    <span className="ml-2 chip border-status-lead/40 text-status-lead">
                      placeholder
                    </span>
                  )}
                </div>
                <span className="num text-2xs text-bone-400 shrink-0">
                  {s.type === "MEASURED"
                    ? `${s.labor_hours_per_unit} hr/${s.unit}`
                    : `${s.flat_labor_hours} hr flat`}
                  {serviceLinks.length > 0 && (
                    <span className="ml-1.5 text-bone-500">
                      <Link2 size={10} className="inline -mt-0.5" /> {serviceLinks.length}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => startEdit(s)}
                  className="text-bone-400 hover:text-bone-100 p-1"
                  aria-label={`Edit ${s.name}`}
                >
                  <Pencil size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => remove(s)}
                  className="text-bone-500 hover:text-status-danger p-1"
                  aria-label={`Delete ${s.name}`}
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {isOpen && (
                <div className="px-3 pb-3 pt-1 border-t border-line-subtle space-y-2">
                  <div className="label-eyebrow">Linked materials</div>
                  <ul className="space-y-1">
                    {serviceLinks.map((l) => {
                      const mat = materials.find((m) => m.id === l.material_id);
                      const desc =
                        l.basis === "COVERAGE"
                          ? `${l.coats} coat${(l.coats ?? 1) > 1 ? "s" : ""} (by coverage)`
                          : l.basis === "PER_UNIT"
                            ? `${l.qty_per_unit} per ${s.unit ?? "unit"}`
                            : `${l.flat_qty} flat${s.type === "TASK" ? " × task count" : ""}`;
                      return (
                        <li key={l.id} className="flex items-center gap-2 text-sm">
                          <span className="flex-1 text-bone-100 truncate">
                            {mat?.name ?? `Material #${l.material_id}`}
                          </span>
                          <span className="text-2xs text-bone-400">{desc}</span>
                          <button
                            type="button"
                            onClick={() => removeLink(l.id)}
                            className="text-bone-500 hover:text-status-danger p-1"
                            aria-label="Remove link"
                          >
                            <Trash2 size={12} />
                          </button>
                        </li>
                      );
                    })}
                    {serviceLinks.length === 0 && (
                      <li className="text-2xs text-bone-400">
                        No materials linked — labor only.
                      </li>
                    )}
                  </ul>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={linkMaterial}
                      onChange={(e) => setLinkMaterial(e.target.value)}
                      className="flex-1 min-w-32"
                    >
                      <option value="">Material…</option>
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={linkBasis}
                      onChange={(e) => setLinkBasis(e.target.value as Link["basis"])}
                      className="w-32"
                    >
                      <option value="COVERAGE">Coverage</option>
                      <option value="PER_UNIT">Per unit</option>
                      <option value="FLAT">Flat qty</option>
                    </select>
                    <input
                      inputMode="decimal"
                      value={linkValue}
                      onChange={(e) => setLinkValue(e.target.value)}
                      placeholder={linkBasis === "COVERAGE" ? "coats" : "qty"}
                      className="w-20"
                    />
                    <button
                      type="button"
                      onClick={() => addLink(s)}
                      className="btn-secondary text-xs h-9"
                    >
                      <Plus size={12} />
                      Link
                    </button>
                  </div>
                  {err && expanded === s.id && <div className="form-error">{err}</div>}
                </div>
              )}
            </li>
          );
        })}
        {services.length === 0 && editing !== "new" && (
          <li className="text-2xs text-bone-400">
            No services yet. Add the work you quote repeatedly — that&apos;s what
            makes prices consistent job to job.
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
          Add service
        </button>
      )}
    </div>
  );
}
