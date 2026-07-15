"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookmarkPlus,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  priceEstimate,
  type EstimatorBundle,
  type RawLine,
} from "@/lib/estimator/assemble";
import { saveEstimate } from "./estimate-actions";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const usd0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Line as edited — numeric fields stay strings so "1.2" types naturally. */
type UILine = {
  key: string;
  serviceId: number | null;
  description: string;
  type: "MEASURED" | "TASK";
  unit: string | null;
  qtyStr: string;
  hoursStr: string; // ad-hoc service only
  prepModifierId: number | null;
  // Hardware lines: a part priced from unit cost, not hours.
  isHardware: boolean;
  sku: string;
  unitPriceStr: string;
  hardwareMarkup: boolean; // true = mark up by margin; false = at cost
  /** Optional link to a job task — traceability only, never pricing. */
  taskId: number | null;
};

export type JobTaskOption = {
  id: number;
  title: string;
  status: "open" | "done";
};

export type ExistingEstimate = {
  /** null = "revise": prefill from a source estimate but save a NEW version. */
  estimateId: number | null;
  billingEntityId: number | null;
  travelZoneId: number | null;
  notes: string;
  overridePrice: number | null;
  overrideReason: string;
  rawLines: RawLine[];
};

let keyCounter = 0;
function nextKey() {
  keyCounter += 1;
  return `L${keyCounter}`;
}

function toRaw(l: UILine): RawLine {
  const qty = parseFloat(l.qtyStr);
  if (l.isHardware) {
    const price = parseFloat(l.unitPriceStr);
    return {
      key: l.key,
      serviceId: null,
      description: l.description,
      type: "TASK",
      qty: Number.isFinite(qty) ? qty : 0,
      unit: null,
      hoursPerUnit: null,
      prepModifierId: null,
      isHardware: true,
      sku: l.sku.trim() || null,
      unitPrice: Number.isFinite(price) ? price : 0,
      hardwareMarkup: l.hardwareMarkup,
      taskId: l.taskId,
    };
  }
  const hours = parseFloat(l.hoursStr);
  return {
    key: l.key,
    serviceId: l.serviceId,
    description: l.description,
    type: l.type,
    qty: Number.isFinite(qty) ? qty : 0,
    unit: l.unit,
    hoursPerUnit: l.serviceId ? null : Number.isFinite(hours) ? hours : null,
    prepModifierId: l.prepModifierId,
    isHardware: false,
    taskId: l.taskId,
  };
}

function fromRaw(r: RawLine): UILine {
  return {
    key: nextKey(),
    serviceId: r.serviceId,
    description: r.description,
    type: r.type,
    unit: r.unit,
    qtyStr: String(r.qty),
    hoursStr: r.hoursPerUnit === null ? "" : String(r.hoursPerUnit),
    prepModifierId: r.prepModifierId,
    isHardware: !!r.isHardware,
    sku: r.sku ?? "",
    unitPriceStr: r.unitPrice === null || r.unitPrice === undefined ? "" : String(r.unitPrice),
    hardwareMarkup: r.hardwareMarkup ?? true,
    taskId: r.taskId ?? null,
  };
}

export function EstimateBuilder({
  bundle,
  job,
  tasks = [],
  existing,
}: {
  bundle: EstimatorBundle;
  job: { id: number; name: string | null; address: string | null };
  /** The job's tasks, for the optional per-line link. */
  tasks?: JobTaskOption[];
  existing: ExistingEstimate | null;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [lines, setLines] = useState<UILine[]>(
    existing ? existing.rawLines.map(fromRaw) : [],
  );
  const [entityId, setEntityId] = useState<number | null>(
    existing?.billingEntityId ??
      bundle.entities.find((e) => e.is_default)?.id ??
      bundle.entities[0]?.id ??
      null,
  );
  const [travelZoneId, setTravelZoneId] = useState<number | null>(
    existing?.travelZoneId ?? bundle.zones[0]?.id ?? null,
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [overrideOn, setOverrideOn] = useState(
    existing?.overridePrice !== null && existing !== null,
  );
  const [overridePrice, setOverridePrice] = useState(
    existing?.overridePrice?.toString() ?? "",
  );
  const [overrideReason, setOverrideReason] = useState(
    existing?.overrideReason ?? "",
  );
  const [catalogQuery, setCatalogQuery] = useState("");
  const [clientView, setClientView] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const prepOptions = bundle.modifiers.filter(
    (m) => m.scope === "LINE" && m.math === "MULTIPLIER",
  );

  const rawLines = useMemo(() => lines.map(toRaw), [lines]);
  const priced = useMemo(
    () => priceEstimate(rawLines, travelZoneId, bundle),
    [rawLines, travelZoneId, bundle],
  );
  const overrideNum = parseFloat(overridePrice);
  const hasOverride = overrideOn && Number.isFinite(overrideNum) && overrideNum > 0;
  const charge = hasOverride ? overrideNum : priced.result.price;

  const catalogMatches = useMemo(() => {
    const q = catalogQuery.trim().toLowerCase();
    if (!q) return bundle.services.slice(0, 6);
    return bundle.services
      .filter((s) => s.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [catalogQuery, bundle.services]);

  function addCatalogLine(serviceId: number) {
    const s = bundle.services.find((x) => x.id === serviceId);
    if (!s) return;
    setLines((prev) => [
      ...prev,
      {
        key: nextKey(),
        serviceId: s.id,
        description: s.name,
        type: s.type,
        unit: s.unit,
        // TASK lines default to one occurrence; MEASURED needs a measurement.
        qtyStr: s.type === "TASK" ? "1" : "",
        hoursStr: "",
        prepModifierId: null,
        isHardware: false,
        sku: "",
        unitPriceStr: "",
        hardwareMarkup: true,
        taskId: null,
      },
    ]);
    setCatalogQuery("");
  }

  function addAdHocLine() {
    setLines((prev) => [
      ...prev,
      {
        key: nextKey(),
        serviceId: null,
        description: "",
        type: "TASK",
        unit: null,
        qtyStr: "1",
        hoursStr: "",
        prepModifierId: null,
        isHardware: false,
        sku: "",
        unitPriceStr: "",
        hardwareMarkup: true,
        taskId: null,
      },
    ]);
  }

  function addHardwareLine() {
    setLines((prev) => [
      ...prev,
      {
        key: nextKey(),
        serviceId: null,
        description: "",
        type: "TASK",
        unit: null,
        qtyStr: "1",
        hoursStr: "",
        prepModifierId: null,
        isHardware: true,
        sku: "",
        unitPriceStr: "",
        hardwareMarkup: true,
        taskId: null,
      },
    ]);
  }

  function patchLine(key: string, patch: Partial<UILine>) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
  }

  async function saveLineToCatalog(l: UILine) {
    const hours = parseFloat(l.hoursStr);
    const name = l.description.trim();
    if (!name || !Number.isFinite(hours) || hours <= 0) {
      setErr("Give the line a description and hours before saving it to the catalog.");
      return;
    }
    const { data, error } = await supabase
      .from("service_catalog")
      .insert({
        client_id: (await supabase.from("Clients").select("id").limit(1)).data?.[0]?.id,
        name,
        type: "TASK",
        flat_labor_hours: hours,
      })
      .select("id")
      .single();
    if (error || !data) {
      setErr(error?.message ?? "Could not save to catalog.");
      return;
    }
    // Keep pricing identical: the line now references the new catalog entry.
    bundle.services.push({
      id: data.id,
      name,
      type: "TASK",
      unit: null,
      labor_hours_per_unit: null,
      flat_labor_hours: hours,
      is_placeholder: false,
      active: true,
    });
    patchLine(l.key, { serviceId: data.id, hoursStr: "" });
  }

  async function handleSave() {
    setErr(null);
    setSaving(true);
    const result = await saveEstimate({
      estimateId: existing?.estimateId ?? null,
      jobId: job.id,
      billingEntityId: entityId,
      travelZoneId,
      notes,
      overridePrice: hasOverride ? overrideNum : null,
      overrideReason,
      rawLines,
    });
    setSaving(false);
    if (!result.ok) {
      setErr(result.error);
      return;
    }
    router.push(`/app/estimator/${result.data!.estimateId}`);
  }

  const canSave = lines.length > 0 && bundle.settings !== null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-56 md:pb-32 space-y-5">
      <Link
        href={`/app/jobs/${job.id}`}
        className="inline-flex items-center gap-1.5 text-2xs text-bone-400 hover:text-bone-100"
      >
        <ArrowLeft size={12} />
        {job.name || `Job #${job.id}`}
      </Link>
      <header>
        <h1 className="text-xl font-semibold text-bone-50">
          {existing
            ? existing.estimateId
              ? "Edit estimate"
              : "New version"
            : "New estimate"}
        </h1>
        {existing &&
          (existing.estimateId ? (
            <p className="text-xs text-status-lead mt-1">
              Saving re-freezes every rate and cost at today&apos;s settings.
            </p>
          ) : (
            <p className="text-xs text-status-lead mt-1">
              Saves as a new version of this job&apos;s estimate — the original
              stays untouched for your records.
            </p>
          ))}
      </header>

      {!bundle.settings && (
        <div className="form-error flex items-center gap-2">
          <TriangleAlert size={14} className="shrink-0" />
          <span>
            Pricing settings aren&apos;t set up yet —{" "}
            <Link href="/app/estimator/settings" className="underline">
              set pay, hours and margin
            </Link>{" "}
            first so estimates have a defensible rate.
          </span>
        </div>
      )}

      {/* Who is this for */}
      <div className="panel px-4 py-3">
        <div className="label-eyebrow mb-1">Job</div>
        <div className="text-sm text-bone-100 font-medium">
          {job.name || `Job #${job.id}`}
        </div>
        {job.address && (
          <div className="text-2xs text-bone-400">{job.address}</div>
        )}
      </div>

      {/* Line items */}
      <section className="space-y-2">
        <div className="label-eyebrow">Scope of work</div>
        <ul className="space-y-2">
          {lines.map((l, i) => {
            const clientAmount =
              priced.rows.find((r) => r.kind === "line" && r.key === i)
                ?.amount ?? 0;
            return (
              <li key={l.key} className="panel px-3 py-3 space-y-2.5">
                <div className="flex items-start gap-2">
                  <input
                    value={l.description}
                    onChange={(e) =>
                      patchLine(l.key, { description: e.target.value })
                    }
                    placeholder={
                      l.serviceId
                        ? undefined
                        : l.isHardware
                          ? "Part name (e.g. Door lock)"
                          : "Describe the work…"
                    }
                    className="flex-1 min-w-0"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setLines((prev) => prev.filter((x) => x.key !== l.key))
                    }
                    className="text-bone-500 hover:text-status-danger p-2 -mr-1"
                    aria-label="Remove line"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1.5">
                    <span className="text-2xs text-bone-400">
                      {l.serviceId
                        ? l.type === "MEASURED"
                          ? l.unit ?? "qty"
                          : "count"
                        : "count"}
                    </span>
                    <input
                      inputMode="decimal"
                      value={l.qtyStr}
                      onChange={(e) =>
                        patchLine(l.key, { qtyStr: e.target.value })
                      }
                      placeholder="0"
                      className="w-16"
                    />
                  </label>

                  {l.isHardware ? (
                    <>
                      <label className="flex items-center gap-1.5">
                        <span className="text-2xs text-bone-400">$/ea</span>
                        <input
                          inputMode="decimal"
                          value={l.unitPriceStr}
                          onChange={(e) =>
                            patchLine(l.key, { unitPriceStr: e.target.value })
                          }
                          placeholder="0.00"
                          className="w-24"
                        />
                      </label>
                      {/* At cost vs marked up, per the owner's choice */}
                      <button
                        type="button"
                        onClick={() =>
                          patchLine(l.key, { hardwareMarkup: !l.hardwareMarkup })
                        }
                        className={`chip normal-case tracking-normal ${
                          l.hardwareMarkup
                            ? "border-field-500/40 text-field-500 bg-field-500/10"
                            : "border-line-strong text-bone-300"
                        }`}
                        title="Tap to toggle whether your margin applies to this part"
                      >
                        {l.hardwareMarkup ? "marked up" : "at cost"}
                      </button>
                    </>
                  ) : (
                    <>
                      {!l.serviceId && (
                        <label className="flex items-center gap-1.5">
                          <span className="text-2xs text-bone-400">hrs</span>
                          <input
                            inputMode="decimal"
                            value={l.hoursStr}
                            onChange={(e) =>
                              patchLine(l.key, { hoursStr: e.target.value })
                            }
                            placeholder="0"
                            className="w-20"
                          />
                        </label>
                      )}
                      {prepOptions.length > 0 && (
                        <select
                          value={l.prepModifierId ?? ""}
                          onChange={(e) =>
                            patchLine(l.key, {
                              prepModifierId: e.target.value
                                ? Number(e.target.value)
                                : null,
                            })
                          }
                          className="text-sm"
                        >
                          <option value="">No prep</option>
                          {prepOptions.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} ×{m.value}
                            </option>
                          ))}
                        </select>
                      )}
                    </>
                  )}
                  <span className="num text-sm text-bone-100 ml-auto">
                    {usd.format(clientAmount)}
                  </span>
                </div>

                {l.isHardware && (
                  <label className="flex items-center gap-1.5">
                    <span className="text-2xs text-bone-400 w-10">SKU</span>
                    <input
                      value={l.sku}
                      onChange={(e) => patchLine(l.key, { sku: e.target.value })}
                      placeholder="Model / SKU (optional)"
                      className="flex-1 min-w-0"
                    />
                  </label>
                )}

                {/* Optional task link — pure traceability, always skippable */}
                {tasks.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={l.taskId ?? ""}
                      onChange={(e) =>
                        patchLine(l.key, {
                          taskId: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      className="text-sm max-w-56"
                      aria-label="Link to task"
                    >
                      <option value="">No task link</option>
                      {tasks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.status === "done" ? "✓ " : ""}
                          {t.title}
                        </option>
                      ))}
                    </select>
                    {l.taskId && <TaskPeek taskId={l.taskId} />}
                  </div>
                )}

                {!l.serviceId && !l.isHardware && l.description.trim() && l.hoursStr && (
                  <button
                    type="button"
                    onClick={() => saveLineToCatalog(l)}
                    className="flex items-center gap-1.5 text-2xs text-field-500 hover:text-field-400"
                  >
                    <BookmarkPlus size={12} />
                    Save to catalog for next time
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {/* Add line controls */}
        <div className="panel px-3 py-3 space-y-2">
          <div className="relative">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-bone-400"
            />
            <input
              value={catalogQuery}
              onChange={(e) => setCatalogQuery(e.target.value)}
              placeholder="Search catalog…"
              className="w-full pl-8"
            />
          </div>
          {bundle.services.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {catalogMatches.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => addCatalogLine(s.id)}
                  className="chip border-line-strong text-bone-300 hover:text-bone-50 hover:border-bone-500 normal-case tracking-normal"
                >
                  <Plus size={10} />
                  {s.name}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={addAdHocLine}
              className="btn-secondary text-sm flex-1 min-h-[46px]"
            >
              <Plus size={14} />
              Service (hours)
            </button>
            <button
              type="button"
              onClick={addHardwareLine}
              className="btn-secondary text-sm flex-1 min-h-[46px]"
            >
              <Wrench size={14} />
              Hardware (part)
            </button>
          </div>
        </div>
      </section>

      {/* Details */}
      <section className="panel px-4 py-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {bundle.zones.length > 0 && (
            <label className="field-group">
              <span className="field-label">Travel zone</span>
              <select
                value={travelZoneId ?? ""}
                onChange={(e) =>
                  setTravelZoneId(e.target.value ? Number(e.target.value) : null)
                }
                className="w-full"
              >
                {bundle.zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.label} — {usd0.format(z.flat_fee)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {bundle.entities.length > 1 && (
            <label className="field-group">
              <span className="field-label">Estimate under</span>
              <select
                value={entityId ?? ""}
                onChange={(e) =>
                  setEntityId(e.target.value ? Number(e.target.value) : null)
                }
                className="w-full"
              >
                {bundle.entities.map((en) => (
                  <option key={en.id} value={en.id}>
                    {en.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <label className="field-group">
          <span className="field-label">Notes (internal)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full"
          />
        </label>

        {/* Manual override — the honest escape hatch */}
        <div className="pt-2 border-t border-line-subtle">
          <label className="flex items-center gap-2 text-sm text-bone-300 cursor-pointer">
            <input
              type="checkbox"
              checked={overrideOn}
              onChange={(e) => setOverrideOn(e.target.checked)}
              className="w-4 h-4"
            />
            Manually override the price
          </label>
          {overrideOn && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input
                inputMode="decimal"
                value={overridePrice}
                onChange={(e) => setOverridePrice(e.target.value)}
                placeholder="Charge $"
                className="w-full"
              />
              <input
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Reason (required)"
                className="w-full"
              />
              <p className="col-span-2 text-2xs text-bone-400">
                Both numbers are kept. The job is flagged OVERRIDDEN and all
                reporting uses the computed price.
              </p>
            </div>
          )}
        </div>
      </section>

      {err && <div className="form-error">{err}</div>}

      {/* Sticky totals + save. On mobile it sits ABOVE the bottom tab nav
          (which is h-16 + safe area, z-30) so the Save button is never
          hidden behind it. */}
      <div className="fixed bottom-[calc(4rem_+_env(safe-area-inset-bottom))] md:bottom-0 left-0 right-0 md:left-56 z-20 bg-ink-1/95 backdrop-blur border-t border-line px-4 py-3">
        <div className="max-w-2xl mx-auto space-y-2">
          {clientView ? (
            <div className="text-2xs text-bone-300 space-y-0.5">
              <div className="label-eyebrow mb-1">What the client sees</div>
              {priced.rows.map((r, idx) => (
                <div key={idx} className="flex justify-between gap-3">
                  <span className="truncate">
                    {r.kind === "line"
                      ? lines[r.key as number]?.description || "Line"
                      : r.kind === "travel"
                        ? "Travel"
                        : "Materials & extras"}
                  </span>
                  <span className="num">{usd.format(r.amount)}</span>
                </div>
              ))}
              {hasOverride && (
                <div className="flex justify-between gap-3">
                  <span>Price adjustment</span>
                  <span className="num">
                    {usd.format(overrideNum - priced.result.price)}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-4 text-2xs text-bone-400">
              <span>
                Cost{" "}
                <span className="num text-bone-300">
                  {usd.format(priced.result.jobCost)}
                </span>
              </span>
              <span>
                Margin{" "}
                <span className="num text-bone-300">
                  {Math.round(priced.result.marginPct * 100)}%
                </span>
              </span>
              <span>
                Markup{" "}
                <span className="num text-bone-300">
                  {Math.round(priced.result.effectiveMarkupPct * 100)}%
                </span>
              </span>
              <span>
                Hours{" "}
                <span className="num text-bone-300">
                  {priced.result.lines
                    .reduce((s, l) => s + l.laborHours, 0)
                    .toFixed(1)}
                </span>
              </span>
            </div>
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setClientView(!clientView)}
              className="btn-ghost h-11 px-2.5"
              title={clientView ? "Owner view" : "Client view"}
            >
              {clientView ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            <div className="flex-1">
              <div className="num text-xl text-bone-50 leading-none">
                {usd.format(charge)}
              </div>
              {hasOverride && (
                <div className="text-2xs text-status-danger">
                  overridden · computed {usd.format(priced.result.price)}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave || saving}
              className="btn-primary min-h-[46px] px-5"
            >
              {saving ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Saving…
                </>
              ) : existing ? (
                existing.estimateId ? (
                  "Save & re-freeze"
                ) : (
                  "Save new version"
                )
              ) : (
                "Save estimate"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Read-only peek at a linked task: note + photos, fetched on first open. */
function TaskPeek({ taskId }: { taskId: number }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<{
    note: string | null;
    photos: Array<{ id: number; caption: string | null }>;
  } | null>(null);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded) {
      const [{ data: task }, { data: photos }] = await Promise.all([
        supabase.from("tasks").select("note").eq("id", taskId).maybeSingle(),
        supabase
          .from("task_photos")
          .select("id, caption")
          .eq("task_id", taskId)
          .order("id"),
      ]);
      setLoaded({ note: task?.note ?? null, photos: photos ?? [] });
    }
  }

  return (
    <span className="min-w-0">
      <button
        type="button"
        onClick={toggle}
        className="chip normal-case tracking-normal border-field-500/40 text-field-500"
      >
        <Eye size={9} />
        {open ? "hide task" : "view task"}
      </button>
      {open && loaded && (
        <span className="block w-full mt-1.5 bg-ink-3 rounded-sm p-2 space-y-1.5">
          {loaded.note && (
            <span className="block text-2xs text-bone-300">{loaded.note}</span>
          )}
          {loaded.photos.length > 0 && (
            <span className="flex gap-1.5 flex-wrap">
              {loaded.photos.map((p) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={p.id}
                  src={`/api/task-photos/${p.id}`}
                  alt={p.caption ?? "Task photo"}
                  loading="lazy"
                  title={p.caption ?? undefined}
                  className="w-16 h-16 object-cover rounded-sm border border-line"
                />
              ))}
            </span>
          )}
          {!loaded.note && loaded.photos.length === 0 && (
            <span className="block text-2xs text-bone-400">
              No note or photos on this task.
            </span>
          )}
        </span>
      )}
    </span>
  );
}
