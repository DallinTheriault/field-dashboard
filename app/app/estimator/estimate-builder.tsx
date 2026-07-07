"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookmarkPlus,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
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
  hoursStr: string; // ad-hoc only
  prepModifierId: number | null;
};

export type ExistingEstimate = {
  estimateId: number;
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
  };
}

export function EstimateBuilder({
  bundle,
  job,
  existing,
}: {
  bundle: EstimatorBundle;
  job: { id: number; name: string | null; address: string | null } | null;
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
  // Standalone flow — creates job + contact on save
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [custAddress, setCustAddress] = useState("");
  const [contactHits, setContactHits] = useState<
    Array<{ id: number; name: string | null; phone: string | null; address: string | null }>
  >([]);
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

  async function searchContacts(q: string) {
    setCustName(q);
    if (q.trim().length < 2) {
      setContactHits([]);
      return;
    }
    const { data } = await supabase
      .from("contacts")
      .select("id, name, phone, address")
      .or(`name.ilike.%${q.trim()}%,phone.ilike.%${q.trim()}%`)
      .is("archived_at", null)
      .limit(5);
    setContactHits(data ?? []);
  }

  async function handleSave() {
    setErr(null);
    setSaving(true);
    const result = await saveEstimate({
      estimateId: existing?.estimateId ?? null,
      jobId: job?.id ?? null,
      newJob: job
        ? null
        : { name: custName, phone: custPhone, address: custAddress },
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

  const canSave =
    lines.length > 0 &&
    bundle.settings !== null &&
    (job !== null ||
      (custName.trim() && custPhone.trim() && custAddress.trim()));

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 pb-32 space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-bone-50">
          {existing ? "Edit estimate" : "New estimate"}
        </h1>
        {existing && (
          <p className="text-xs text-status-lead mt-1">
            Saving re-freezes every rate and cost at today&apos;s settings.
          </p>
        )}
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
      {job ? (
        <div className="panel px-4 py-3">
          <div className="label-eyebrow mb-1">Job</div>
          <div className="text-sm text-bone-100 font-medium">
            {job.name || `Job #${job.id}`}
          </div>
          {job.address && (
            <div className="text-2xs text-bone-400">{job.address}</div>
          )}
        </div>
      ) : (
        <div className="panel px-4 py-3 space-y-3">
          <div className="label-eyebrow">Customer</div>
          <div className="relative">
            <input
              value={custName}
              onChange={(e) => searchContacts(e.target.value)}
              placeholder="Name (searches your contacts)"
              className="w-full"
            />
            {contactHits.length > 0 && (
              <ul className="absolute z-10 left-0 right-0 mt-1 bg-ink-2 border border-line-strong rounded-sm shadow-pop overflow-hidden">
                {contactHits.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-ink-3 text-sm text-bone-100"
                      onClick={() => {
                        setCustName(c.name ?? "");
                        setCustPhone(c.phone ?? "");
                        setCustAddress(c.address ?? "");
                        setContactHits([]);
                      }}
                    >
                      {c.name}{" "}
                      <span className="text-2xs text-bone-400">{c.phone}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              inputMode="tel"
              value={custPhone}
              onChange={(e) => setCustPhone(e.target.value)}
              placeholder="Phone"
              className="w-full"
            />
            <input
              value={custAddress}
              onChange={(e) => setCustAddress(e.target.value)}
              placeholder="Address"
              className="w-full"
            />
          </div>
        </div>
      )}

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
                      l.serviceId ? undefined : "Describe the work…"
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
                      className="w-20"
                    />
                  </label>
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
                  <span className="num text-sm text-bone-100 ml-auto">
                    {usd.format(clientAmount)}
                  </span>
                </div>
                {!l.serviceId && l.description.trim() && l.hoursStr && (
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
          <button
            type="button"
            onClick={addAdHocLine}
            className="btn-secondary text-sm w-full min-h-[46px]"
          >
            <Plus size={14} />
            Ad-hoc line (describe + hours)
          </button>
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

      {/* Sticky totals + save */}
      <div className="fixed bottom-0 left-0 right-0 md:left-56 bg-ink-1/95 backdrop-blur border-t border-line px-4 py-3">
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
                "Save & re-freeze"
              ) : (
                "Save estimate"
              )}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
