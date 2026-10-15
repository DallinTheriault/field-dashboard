"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  EMPTY_DRAFT,
  LABOR_HOURLY,
  MEASURED_UNITS,
  PRICED_UNITS,
  RATE_LABEL,
  SKILLED_HOURLY,
  catalogUnitPrice,
  draftToRow,
  hoursPerUnit,
  priceBookUnit,
  priceFromHours,
  rowToDraft,
  unitForType,
  type CatalogRow,
  type CatalogType,
  type PriceBookDraft,
  type PriceBookUnit,
  type RateType,
  type Rates,
} from "@/lib/estimator/price-book";
import { PRICING_SAVED_EVENT } from "./pricing-section";

type Service = CatalogRow & {
  id: number;
  name: string;
  materials_note: string | null;
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

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 4,
});

// Rates read in cents; unit prices can go finer (per-sqft work).
const rate = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const UNIT_LABEL: Record<PriceBookUnit, string> = {
  each: "each",
  hour: "hr",
  sqft: "sq ft",
  lnft: "ln ft",
};

const UNIT_NAME: Record<PriceBookUnit, string> = {
  each: "Each (a set price per job or item)",
  hour: "Hour",
  sqft: "Square foot",
  lnft: "Linear foot",
};

const TYPE_LABEL: Record<CatalogType, string> = {
  PRICED: "Job lines",
  MEASURED: "Job lines and old estimates (measured)",
  TASK: "Job lines and old estimates (per task)",
};

/** "3 hr each", "0.012 hr per sq ft". */
function hoursPhrase(hours: number, unit: PriceBookUnit): string {
  return `${hours} hr ${unit === "each" ? "each" : `per ${UNIT_LABEL[unit]}`}`;
}

function num(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

/**
 * The price book: work you sell often. Each row bills at the general or
 * skilled rate: its price is its typical hours × that rate, unless you set
 * your own. Rows the old estimate builder uses (measured/task) stay editable
 * here; their hours and material links still feed it. "Labor, hourly" and
 * "Skilled labor, hourly" are built in; their rates are under Your rates.
 */
export function CatalogManager({ clientId }: { clientId: number }) {
  const supabase = createClient();
  const [services, setServices] = useState<Service[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [rates, setRates] = useState<Rates>({ general: null, skilled: null });
  // The price input shows once you choose your own price (or a row has one).
  const [ownPrice, setOwnPrice] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<PriceBookDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // New-link draft (scoped to the row being edited)
  const [linkMaterial, setLinkMaterial] = useState("");
  const [linkBasis, setLinkBasis] = useState<Link["basis"]>("COVERAGE");
  const [linkValue, setLinkValue] = useState("");

  async function load() {
    const [{ data: s }, { data: l }, { data: m }, { data: p }] =
      await Promise.all([
        supabase
          .from("service_catalog")
          .select(
            "id, name, type, unit, unit_price, typical_hours, labor_hours_per_unit, flat_labor_hours, rate_type, materials_note, notes, is_placeholder, active",
          )
          .order("active", { ascending: false })
          .order("name"),
        supabase
          .from("service_materials")
          .select("id, service_id, material_id, basis, coats, qty_per_unit, flat_qty"),
        supabase
          .from("materials")
          .select("id, name, unit, coverage_sqft_per_unit")
          .eq("active", true)
          .order("name"),
        supabase
          .from("pricing_settings")
          .select("default_hourly_rate, skilled_hourly_rate")
          .maybeSingle(),
      ]);
    setServices(
      (s ?? []).map((x) => ({
        ...x,
        unit_price: num(x.unit_price),
        typical_hours: num(x.typical_hours),
        labor_hours_per_unit: num(x.labor_hours_per_unit),
        flat_labor_hours: num(x.flat_labor_hours),
      })),
    );
    setLinks(l ?? []);
    setMaterials(m ?? []);
    setRates({ general: num(p?.default_hourly_rate), skilled: num(p?.skilled_hourly_rate) });
    setLoading(false);
  }

  useEffect(() => {
    load();
    const reload = () => load();
    window.addEventListener(PRICING_SAVED_EVENT, reload);
    return () => window.removeEventListener(PRICING_SAVED_EVENT, reload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startEdit(s: Service) {
    setEditing(s.id);
    setDraft(rowToDraft(s));
    setOwnPrice(s.unit_price !== null);
    setErr(null);
  }

  async function save() {
    setErr(null);
    const result = draftToRow(ownPrice ? draft : { ...draft, unitPrice: "" });
    if (!result.ok) return setErr(result.error);
    setSaving(true);
    const { error } =
      editing === "new"
        ? await supabase.from("service_catalog").insert({ client_id: clientId, ...result.row })
        : await supabase.from("service_catalog").update(result.row).eq("id", editing);
    if (error) {
      setSaving(false);
      return setErr(error.message);
    }
    // Reload before closing the editor so the row never flashes its old values.
    await load();
    setSaving(false);
    setEditing(null);
  }

  async function remove(s: Service) {
    if (!confirm(`Delete "${s.name}"? Jobs, estimates and invoices that use it keep their own copy.`)) return;
    const { error } = await supabase.from("service_catalog").delete().eq("id", s.id);
    if (error) {
      await supabase.from("service_catalog").update({ active: false }).eq("id", s.id);
    }
    await load();
    setEditing(null);
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

  const editingService = services.find((s) => s.id === editing) ?? null;
  const editingBuilderRow = editingService !== null && editingService.type !== "PRICED";
  const editingLinks = links.filter((l) => l.service_id === editing);
  const draftUnit = priceBookUnit(draft);
  const draftHours =
    draft.type === "PRICED" && draft.unit === "hour" ? 1 : draft.hours.trim() === "" ? null : Number(draft.hours);
  const draftRate = rates[draft.rateType];
  const fromHours = priceFromHours(draftHours, draftRate, draftUnit);
  const unitOptions = draft.type === "MEASURED" ? MEASURED_UNITS : PRICED_UNITS;
  const showHours = !(draft.type === "PRICED" && draft.unit === "hour");
  const hoursLabel = `Typical hours ${draftUnit === "each" ? "each" : `per ${UNIT_LABEL[draftUnit]}`}`;

  const form = (
    <div className="bg-ink-2 border border-line rounded-sm p-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="field-group col-span-2">
          <span className="field-label">Name</span>
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Patch and paint drywall"
            className="w-full"
          />
        </label>
        <label className="field-group col-span-2">
          <span className="field-label">Used on</span>
          <select
            value={draft.type}
            onChange={(e) => {
              const type = e.target.value as CatalogType;
              setDraft({ ...draft, type, unit: unitForType(type, draft.unit) });
            }}
            className="w-full"
          >
            {(Object.keys(TYPE_LABEL) as CatalogType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        {editingBuilderRow && draft.type === "PRICED" && (
          <p className="col-span-2 text-2xs text-status-lead">
            Old estimates stop offering this once it&apos;s for job lines only.
          </p>
        )}
        {draft.type !== "TASK" && (
          <label className="field-group col-span-2">
            <span className="field-label">Charged by the</span>
            <select
              value={draft.unit}
              onChange={(e) => setDraft({ ...draft, unit: e.target.value as PriceBookUnit })}
              className="w-full"
            >
              {unitOptions.map((u) => (
                <option key={u} value={u}>
                  {UNIT_NAME[u]}
                </option>
              ))}
            </select>
          </label>
        )}
        <fieldset className="field-group col-span-2">
          <legend className="field-label">Labor rate</legend>
          <div className="flex flex-wrap gap-x-4">
            {(["general", "skilled"] as RateType[]).map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm text-bone-100 min-h-[44px]">
                <input
                  type="radio"
                  name="rate-type"
                  checked={draft.rateType === t}
                  onChange={() => setDraft({ ...draft, rateType: t })}
                  className="w-4 h-4"
                />
                {RATE_LABEL[t]}
                <span className="text-bone-400 num">
                  {rates[t] === null ? "(not set)" : `${rate.format(rates[t]!)}/hr`}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {showHours && (
          <label className="field-group col-span-2">
            <span className="field-label">{hoursLabel}</span>
            <input
              inputMode="decimal"
              value={draft.hours}
              onChange={(e) => setDraft({ ...draft, hours: e.target.value })}
              placeholder={draft.type === "MEASURED" ? "0.010" : "1.5"}
              className="w-full"
            />
            {draft.type !== "PRICED" && (
              <span className="field-hint">Old estimates use these hours too.</span>
            )}
          </label>
        )}
        <div className="col-span-2 space-y-2" data-testid="draft-price">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="field-label">Price</span>
            {ownPrice ? (
              <span className="text-2xs text-bone-400">your own price</span>
            ) : fromHours !== null ? (
              <span className="text-sm text-bone-100 num">
                {usd.format(fromHours)} {draftUnit === "each" ? "each" : `per ${UNIT_LABEL[draftUnit]}`}
                <span className="text-2xs text-bone-400">
                  {" "}
                  = {showHours ? `${draftHours} hr × ` : ""}
                  {rate.format(draftRate!)}/hr {RATE_LABEL[draft.rateType].toLowerCase()}
                </span>
              </span>
            ) : (
              <span className="text-2xs text-status-lead">
                {draftRate === null
                  ? `Set your ${RATE_LABEL[draft.rateType].toLowerCase()} rate, or set your own price.`
                  : "Enter typical hours, or set your own price."}
              </span>
            )}
          </div>
          {ownPrice ? (
            <div className="flex items-center gap-2">
              <label className="field-group flex-1">
                <span className="sr-only">Your price per {UNIT_LABEL[draftUnit]}</span>
                <input
                  inputMode="decimal"
                  value={draft.unitPrice}
                  onChange={(e) => setDraft({ ...draft, unitPrice: e.target.value })}
                  placeholder={fromHours === null ? "0.00" : String(fromHours)}
                  className="w-full min-h-[44px]"
                  aria-label={`Your price per ${UNIT_LABEL[draftUnit]}`}
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  setOwnPrice(false);
                  setDraft({ ...draft, unitPrice: "" });
                }}
                className="btn-ghost text-xs min-h-[44px]"
              >
                Use hours × rate
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setOwnPrice(true)} className="btn-ghost text-xs min-h-[44px] -ml-2">
              Set my own price
            </button>
          )}
        </div>
        <label className="field-group col-span-2">
          <span className="field-label">Materials included</span>
          <input
            value={draft.materialsNote}
            onChange={(e) => setDraft({ ...draft, materialsNote: e.target.value })}
            placeholder="Patch compound, primer, 1 qt matched paint"
            className="w-full"
          />
        </label>
        <label className="field-group col-span-2">
          <span className="field-label">Notes</span>
          <input
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            className="w-full"
          />
        </label>
        <label className="col-span-2 flex items-center gap-2 text-sm text-bone-100 min-h-[44px]">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
            className="w-4 h-4"
          />
          Show when adding job lines
        </label>
      </div>
      {editingService && editingBuilderRow && draft.type !== "PRICED" && (
        <div className="pt-2 border-t border-line-subtle space-y-2">
          <div className="label-eyebrow">Materials (old estimates only)</div>
          <ul className="space-y-1">
            {editingLinks.map((l) => {
              const mat = materials.find((m) => m.id === l.material_id);
              const desc =
                l.basis === "COVERAGE"
                  ? `${l.coats} coat${(l.coats ?? 1) > 1 ? "s" : ""} (by coverage)`
                  : l.basis === "PER_UNIT"
                    ? `${l.qty_per_unit} per ${editingService.unit ?? "unit"}`
                    : `${l.flat_qty} flat${editingService.type === "TASK" ? " × task count" : ""}`;
              return (
                <li key={l.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 text-bone-100 truncate">
                    {mat?.name ?? `Material #${l.material_id}`}
                  </span>
                  <span className="text-2xs text-bone-400">{desc}</span>
                  <button
                    type="button"
                    onClick={() => removeLink(l.id)}
                    className="text-bone-500 hover:text-status-danger p-2"
                    aria-label="Remove link"
                  >
                    <Trash2 size={12} />
                  </button>
                </li>
              );
            })}
            {editingLinks.length === 0 && (
              <li className="text-2xs text-bone-400">None. Old estimates price this as labor only.</li>
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
              onClick={() => addLink(editingService)}
              className="btn-secondary text-xs min-h-[44px]"
            >
              <Plus size={12} />
              Link
            </button>
          </div>
        </div>
      )}
      {err && <div className="form-error">{err}</div>}
      <div className="flex justify-end gap-2">
        {editingService && (
          <button
            type="button"
            onClick={() => remove(editingService)}
            className="btn-ghost text-sm min-h-[44px] text-status-danger mr-auto"
          >
            <Trash2 size={13} />
            Delete
          </button>
        )}
        <button type="button" onClick={() => setEditing(null)} className="btn-ghost text-sm min-h-[44px]">
          <X size={13} />
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="btn-primary text-sm min-h-[44px] whitespace-nowrap"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : "Save item"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="px-4 py-4 space-y-3">
      <ul className="space-y-1.5">
        {([
          [LABOR_HOURLY, rates.general],
          [SKILLED_HOURLY, rates.skilled],
        ] as const).map(([name, r]) => (
          <li key={name} className="bg-ink-2 rounded-sm shadow-inset-line flex items-center gap-2 px-3 py-2.5">
            <div className="flex-1 min-w-0">
              <div className="text-sm text-bone-100">{name}</div>
              <div className="text-2xs text-bone-400">
                Built in.{" "}
                <a href="#pricing" className="underline hover:text-bone-100">
                  Set the rate in Your rates
                </a>
              </div>
            </div>
            <PriceTag price={r} unit="hour" />
          </li>
        ))}
        {services.map((s) => {
          if (editing === s.id) return <li key={s.id}>{form}</li>;
          const linkCount = links.filter((l) => l.service_id === s.id).length;
          const hours = hoursPerUnit(s);
          const unit = priceBookUnit(s);
          const detail = [
            s.unit_price !== null
              ? "your own price"
              : hours !== null && unit !== "hour"
                ? `${hoursPhrase(hours, unit)} × ${RATE_LABEL[s.rate_type].toLowerCase()}`
                : RATE_LABEL[s.rate_type].toLowerCase(),
            s.type !== "PRICED" ? "also old estimates" : null,
            linkCount > 0 ? `${linkCount} material${linkCount > 1 ? "s" : ""}` : null,
            s.materials_note,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => startEdit(s)}
                className={`w-full text-left bg-ink-2 hover:bg-ink-3 rounded-sm shadow-inset-line px-3 py-2.5 min-h-[44px] flex items-start gap-3 ${s.active ? "" : "opacity-50"}`}
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-bone-100 break-words">
                    {s.name}
                    {s.is_placeholder && (
                      <span className="ml-2 chip border-status-lead/40 text-status-lead">
                        placeholder
                      </span>
                    )}
                    {!s.active && <span className="ml-2 text-2xs text-bone-500">inactive</span>}
                  </span>
                  {detail && (
                    <span className="block text-2xs text-bone-400 break-words">{detail}</span>
                  )}
                </span>
                <PriceTag price={catalogUnitPrice(s, rates)} unit={unit} />
              </button>
            </li>
          );
        })}
        {services.length === 0 && editing !== "new" && (
          <li className="text-2xs text-bone-400">
            Nothing here yet. Add work you sell often, or save an hourly job
            line to the price book from the job.
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
            setDraft(EMPTY_DRAFT);
            setOwnPrice(false);
            setErr(null);
          }}
          className="btn-secondary text-sm min-h-[44px]"
        >
          <Plus size={13} />
          Add item
        </button>
      )}
    </div>
  );
}

function PriceTag({ price, unit }: { price: number | null; unit: PriceBookUnit }) {
  if (price !== null) {
    return (
      <span className="num text-sm text-bone-100 shrink-0">
        {usd.format(price)}
        <span className="text-2xs text-bone-400">/{UNIT_LABEL[unit]}</span>
      </span>
    );
  }
  return <span className="chip border-status-lead/40 text-status-lead shrink-0">needs a price</span>;
}
