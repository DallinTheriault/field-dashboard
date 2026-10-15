"use client";

import { useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  ImagePlus,
  Loader2,
  Minus,
  Plus,
  Search,
  Square,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/photos/compress";
import {
  customLine,
  formatQty,
  jobTotal,
  lineFromEntry,
  lineTotal,
  needsPrice,
  parseMoney,
  pickerEntries,
  rankEntries,
  recentServiceIds,
  stepQty,
  UNIT_SHORT,
  type LineUnit,
  type NewLine,
  type PriceBookEntry,
} from "@/lib/jobs/lines";
import {
  LABOR_HOURLY,
  RATE_LABEL,
  SKILLED_HOURLY,
  priceFromHours,
  rowFromHourlyLine,
  type RateType,
  type Rates,
} from "@/lib/estimator/price-book";
import { deleteTask, deleteTaskPhoto } from "../task-actions";

export type TaskPhoto = { id: number; caption: string | null };
export type JobLine = {
  id: number;
  title: string;
  note: string | null;
  status: "open" | "done";
  sort_order: number;
  service_id: number | null;
  qty: number;
  unit: LineUnit | null;
  unit_price: number | null;
  billable: boolean;
  /** Invoice number when the line is on an invoice that went out. */
  lockedOn: string | null;
  photos: TaskPhoto[];
  /** Estimate lines linked to this task — warn before deleting. */
  linkedLines: number;
};

type Saved = Pick<JobLine, "title" | "note" | "status" | "sort_order" | "qty" | "unit" | "unit_price" | "billable">;
type Patch = Partial<Saved>;
type SaveState = { state: "saving" | "saved" | "failed"; error?: string };

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 });
const money = (n: number) => usd.format(n);

const LINE_COLS =
  "id, title, note, status, sort_order, service_id, qty, unit, unit_price, billable";

function fromRow(r: Record<string, unknown>): Omit<JobLine, "lockedOn" | "photos" | "linkedLines"> {
  return {
    id: r.id as number,
    title: r.title as string,
    note: (r.note as string | null) ?? null,
    status: r.status as "open" | "done",
    sort_order: r.sort_order as number,
    service_id: (r.service_id as number | null) ?? null,
    qty: Number(r.qty),
    unit: (r.unit as LineUnit | null) ?? null,
    unit_price: r.unit_price === null ? null : Number(r.unit_price),
    billable: r.billable as boolean,
  };
}

/**
 * The job's scope: one list that is the to-do list, the punch list and the
 * price. Built on a phone while walking the house, so nothing here reloads
 * the page: every change updates the list in place and saves in the
 * background, one ordered queue per line, with a visible saved/failed state.
 * Writes go straight to Supabase under RLS; the database enforces the billing
 * rules (v095), so a failed save says why.
 */
export function ScopeBuilder({
  jobId,
  clientId,
  lines: initial,
  canWrite,
  pricing,
  rates,
}: {
  jobId: number;
  clientId: number;
  lines: JobLine[];
  canWrite: boolean;
  /** Prices and the price book (estimator on). Off: a plain task list. */
  pricing: boolean;
  /** General and skilled hourly rates (null: not set). */
  rates: Rates;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [lines, setLines] = useState<JobLine[]>(initial);
  const [saves, setSaves] = useState<Record<number, SaveState>>({});
  const [openId, setOpenId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Per-line write queue: one request in flight, later edits merged into the
  // next one, so fast stepper taps land in order. lastSaved backs Undo.
  const queue = useRef(new Map<number, { inflight: boolean; pending: Patch | null }>());
  const lastSaved = useRef(new Map<number, Saved>(initial.map((l) => [l.id, pick(l)])));
  const tempId = useRef(-1);

  const open = lines.filter((l) => l.status === "open").sort(bySort);
  const done = lines.filter((l) => l.status === "done").sort(bySort);
  const priced = pricing && lines.some((l) => l.unit !== null);
  const total = jobTotal(lines);
  const unpriced = lines.filter(needsPrice).length;

  function setSave(id: number, s: SaveState | null) {
    setSaves((cur) => {
      const next = { ...cur };
      if (s) next[id] = s;
      else delete next[id];
      return next;
    });
  }

  function patchLocal(id: number, patch: Partial<JobLine>) {
    setLines((cur) => cur.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function write(id: number, patch: Patch) {
    patchLocal(id, patch);
    const q = queue.current.get(id) ?? { inflight: false, pending: null };
    q.pending = { ...(q.pending ?? {}), ...patch };
    queue.current.set(id, q);
    setSave(id, { state: "saving" });
    if (!q.inflight) void flush(id);
  }

  async function flush(id: number) {
    const q = queue.current.get(id);
    if (!q?.pending) return;
    const patch = q.pending;
    q.pending = null;
    q.inflight = true;
    const { error } = await supabase
      .from("tasks")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    q.inflight = false;
    if (error) {
      // Keep the failed edit queued under anything typed since, for Retry.
      q.pending = { ...patch, ...(q.pending ?? {}) };
      setSave(id, { state: "failed", error: error.message });
      return;
    }
    lastSaved.current.set(id, { ...(lastSaved.current.get(id) as Saved), ...patch });
    if (q.pending) return flush(id);
    showSaved(id);
  }

  /** "Saved" for a moment, then nothing: quiet is the normal state. */
  function showSaved(id: number) {
    setSave(id, { state: "saved" });
    setTimeout(() => {
      setSaves((cur) => {
        if (cur[id]?.state !== "saved") return cur;
        const next = { ...cur };
        delete next[id];
        return next;
      });
    }, 1500);
  }

  function retry(id: number) {
    setSave(id, { state: "saving" });
    void flush(id);
  }

  function undo(id: number) {
    const q = queue.current.get(id);
    if (q) q.pending = null;
    const saved = lastSaved.current.get(id);
    if (saved) patchLocal(id, saved);
    setSave(id, null);
  }

  async function addLine(nl: NewLine) {
    setErr(null);
    const id = tempId.current--;
    const sort = lines.reduce((m, l) => Math.max(m, l.sort_order), 0) + 1;
    const draft: JobLine = {
      ...nl,
      id,
      note: null,
      status: "open",
      sort_order: sort,
      lockedOn: null,
      photos: [],
      linkedLines: 0,
    };
    setLines((cur) => [...cur, draft]);
    setSave(id, { state: "saving" });
    const { data, error } = await supabase
      .from("tasks")
      .insert({ client_id: clientId, job_id: jobId, sort_order: sort, ...nl })
      .select(LINE_COLS)
      .single();
    if (error || !data) {
      setSave(id, { state: "failed", error: error?.message ?? "Not saved." });
      return;
    }
    const row = fromRow(data);
    lastSaved.current.set(row.id, pick({ ...draft, ...row }));
    setLines((cur) => cur.map((l) => (l.id === id ? { ...l, ...row } : l)));
    setSave(id, null);
    showSaved(row.id);
  }

  async function retryAdd(l: JobLine) {
    setLines((cur) => cur.filter((x) => x.id !== l.id));
    setSave(l.id, null);
    await addLine({
      title: l.title,
      service_id: l.service_id,
      qty: l.qty,
      unit: l.unit,
      unit_price: l.unit_price,
      billable: l.billable,
    });
  }

  /** Swap sort_order with the neighbor within the same status group. */
  function move(l: JobLine, dir: -1 | 1) {
    const group = l.status === "open" ? open : done;
    const other = group[group.findIndex((x) => x.id === l.id) + dir];
    if (!other) return;
    write(l.id, { sort_order: other.sort_order });
    write(other.id, { sort_order: l.sort_order });
  }

  async function remove(l: JobLine) {
    if (l.id < 0) {
      setLines((cur) => cur.filter((x) => x.id !== l.id));
      setSave(l.id, null);
      return;
    }
    const linked =
      l.linkedLines > 0
        ? `\n\n${l.linkedLines} estimate line${l.linkedLines === 1 ? "" : "s"} link${l.linkedLines === 1 ? "s" : ""} to it — the lines and their pricing stay, only the link is cleared.`
        : "";
    const photos =
      l.photos.length > 0 ? ` Its ${l.photos.length} photo${l.photos.length === 1 ? "" : "s"} will be deleted too.` : "";
    if (!confirm(`Delete "${l.title}"?${photos}${linked}`)) return;
    setErr(null);
    setLines((cur) => cur.filter((x) => x.id !== l.id));
    const r = await deleteTask(l.id);
    if (!r.ok) {
      setLines((cur) => [...cur, l]);
      setErr(r.error);
    }
  }

  return (
    <div className="panel px-4 py-3 mb-5" data-testid="scope">
      <div className="label-eyebrow mb-2 flex items-baseline gap-1.5">
        {pricing ? "Scope" : "Tasks"}
        {lines.length > 0 && (
          <span className="normal-case tracking-normal font-normal">· {open.length} open</span>
        )}
      </div>

      {canWrite && pricing && <PriceBookPicker onPick={(e) => addLine(lineFromEntry(e))} rates={rates} />}
      {canWrite && <CustomLine pricing={pricing} hourlyRate={rates.general} onAdd={addLine} />}
      {err && <div className="form-error mb-2">{err}</div>}

      {lines.length === 0 ? (
        <p className="text-2xs text-bone-400">
          {pricing
            ? "Walk the property and add each item from the price book as the customer mentions it. This list is the to-do list and the price."
            : "Walk the property, capture every item the customer mentions — one task each, photos welcome. This list becomes the punch list."}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {[...open, ...done].map((l) => (
            <LineRow
              key={l.id}
              line={l}
              save={saves[l.id]}
              pricing={pricing}
              canWrite={canWrite}
              clientId={clientId}
              rates={rates}
              expanded={openId === l.id}
              onToggleExpand={() => setOpenId(openId === l.id ? null : l.id)}
              onWrite={(patch) => write(l.id, patch)}
              onRetry={() => (l.id < 0 ? retryAdd(l) : retry(l.id))}
              onUndo={() => undo(l.id)}
              onMove={(dir) => move(l, dir)}
              onDelete={() => remove(l)}
              onPhotos={(photos) => patchLocal(l.id, { photos })}
              onError={setErr}
            />
          ))}
        </ul>
      )}

      {priced && (
        <div
          className="fixed bottom-[calc(4rem_+_env(safe-area-inset-bottom))] md:bottom-0 left-0 right-0 md:left-56 z-20 bg-ink-1/95 backdrop-blur border-t border-line px-4 py-3"
          data-testid="scope-total"
        >
          <div className="max-w-[1200px] mx-auto flex items-center gap-3">
            <span className="label-eyebrow">Job total</span>
            {unpriced > 0 && (
              <span className="chip border-status-lead/40 text-status-lead normal-case tracking-normal">
                {unpriced} need{unpriced === 1 ? "s" : ""} a price
              </span>
            )}
            <span className="num text-xl text-bone-50 ml-auto">{money(total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function pick(l: JobLine): Saved {
  const { title, note, status, sort_order, qty, unit, unit_price, billable } = l;
  return { title, note, status, sort_order, qty, unit, unit_price, billable };
}

function bySort(a: JobLine, b: JobLine) {
  return a.sort_order - b.sort_order || a.id - b.id;
}

// --- Adding lines ------------------------------------------------------------------

function PriceBookPicker({
  onPick,
  rates,
}: {
  onPick: (e: PriceBookEntry) => void;
  rates: Rates;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [entries, setEntries] = useState<PriceBookEntry[] | null>(null);
  const [recent, setRecent] = useState<number[]>([]);
  const loading = useRef(false);
  // The list closes a beat after blur so a tap on an entry lands first; a
  // quick re-focus must cancel that close or the list vanishes under the user.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Loaded on first focus, not with the page: the job page is already the
  // heaviest in the app and most visits never open the picker.
  async function load() {
    if (entries || loading.current) return;
    loading.current = true;
    const [{ data: rows }, { data: used }] = await Promise.all([
      supabase
        .from("service_catalog")
        .select("id, name, type, unit, unit_price, typical_hours, labor_hours_per_unit, flat_labor_hours, rate_type")
        .eq("active", true)
        .order("name"),
      supabase
        .from("tasks")
        .select("service_id")
        .not("service_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(60),
    ]);
    const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    setEntries(
      pickerEntries(
        (rows ?? []).map((r) => ({
          ...r,
          unit_price: n(r.unit_price),
          typical_hours: n(r.typical_hours),
          labor_hours_per_unit: n(r.labor_hours_per_unit),
          flat_labor_hours: n(r.flat_labor_hours),
        })),
        rates,
      ),
    );
    setRecent(recentServiceIds(used ?? []));
  }

  const matches = entries ? rankEntries(entries, query, recent).slice(0, 8) : [];

  return (
    <div className="relative mb-2">
      <Search size={14} className="absolute left-3 top-[22px] -translate-y-1/2 text-bone-400" />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          if (closeTimer.current) clearTimeout(closeTimer.current);
          setFocused(true);
          void load();
        }}
        onBlur={() => {
          closeTimer.current = setTimeout(() => setFocused(false), 150);
        }}
        placeholder="Add from price book…"
        className="w-full pl-9 min-h-[44px]"
        aria-label="Add from price book"
      />
      {focused && (
        <ul className="mt-1 border border-line rounded-sm bg-ink-1 divide-y divide-line-subtle overflow-hidden">
          {!entries && (
            <li className="px-3 py-3 text-2xs text-bone-400 flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" /> Loading price book…
            </li>
          )}
          {entries && matches.length === 0 && (
            <li className="px-3 py-3 text-2xs text-bone-400">Nothing matches. Add it as a custom line below.</li>
          )}
          {matches.map((e) => (
            <li key={e.id ?? e.name}>
              <button
                type="button"
                // Fire before the input's blur closes the list.
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => {
                  onPick(e);
                  setQuery("");
                }}
                className="w-full min-h-[44px] px-3 py-2 flex items-center gap-3 text-left hover:bg-ink-2"
              >
                <span className="flex-1 min-w-0 text-sm text-bone-100 break-words">{e.name}</span>
                {e.unit_price === null ? (
                  <span className="chip border-status-lead/40 text-status-lead shrink-0">needs a price</span>
                ) : (
                  <span className="num text-sm text-bone-300 shrink-0">
                    {money(e.unit_price)}
                    <span className="text-2xs text-bone-400">/{UNIT_SHORT[e.unit]}</span>
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CustomLine({
  pricing,
  hourlyRate,
  onAdd,
}: {
  pricing: boolean;
  hourlyRate: number | null;
  onAdd: (l: NewLine) => void;
}) {
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<"price" | "hours">("price");
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function add() {
    setErr(null);
    const t = title.trim();
    if (!t) return setErr("Give the line a title.");
    let value: number | null = null;
    if (pricing && amount.trim() !== "") {
      value = mode === "price" ? parseMoney(amount) : Number(amount);
      if (value === null || !Number.isFinite(value) || value < 0 || (mode === "hours" && value <= 0)) {
        return setErr(mode === "price" ? "Price must be a number, 0 or more." : "Hours must be more than 0.");
      }
    }
    onAdd(customLine(t, mode, value, hourlyRate));
    setTitle("");
    setAmount("");
  }

  return (
    <div className="mb-3">
      <div className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={pricing ? "Custom line (e.g. Haul debris)" : "Add a task (e.g. Fix dishwasher latch)"}
          className="flex-1 min-w-0 min-h-[44px]"
          aria-label="Custom line title"
        />
        <button type="button" onClick={add} className="btn-primary shrink-0 min-h-[44px] min-w-[44px]">
          <Plus size={14} />
          Add
        </button>
      </div>
      {pricing && title.trim() !== "" && (
        <div className="flex gap-2 mt-1.5">
          <div className="flex rounded-sm border border-line overflow-hidden shrink-0" role="group" aria-label="Price or hours">
            {(["price", "hours"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`px-3 min-h-[44px] text-sm ${mode === m ? "bg-field-500/15 text-field-500" : "text-bone-300"}`}
              >
                {m === "price" ? "Price" : "Hours"}
              </button>
            ))}
          </div>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder={
              mode === "price"
                ? "$ (blank: reminder, not billed)"
                : hourlyRate === null
                  ? "hours (no hourly rate set)"
                  : `hours at ${money(hourlyRate)}/hr`
            }
            className="flex-1 min-w-0 min-h-[44px]"
            aria-label={mode === "price" ? "Line price" : "Line hours"}
          />
        </div>
      )}
      {err && <div className="form-error mt-1.5">{err}</div>}
    </div>
  );
}

// --- One line ----------------------------------------------------------------------

function LineRow({
  line,
  save,
  pricing,
  canWrite,
  clientId,
  rates,
  expanded,
  onToggleExpand,
  onWrite,
  onRetry,
  onUndo,
  onMove,
  onDelete,
  onPhotos,
  onError,
}: {
  line: JobLine;
  save: SaveState | undefined;
  pricing: boolean;
  canWrite: boolean;
  clientId: number;
  rates: Rates;
  expanded: boolean;
  onToggleExpand: () => void;
  onWrite: (patch: Patch) => void;
  onRetry: () => void;
  onUndo: () => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onPhotos: (photos: TaskPhoto[]) => void;
  onError: (m: string | null) => void;
}) {
  const isDone = line.status === "done";
  const unsaved = line.id < 0;
  const editable = canWrite && !unsaved;
  const priceEditable = editable && pricing && !line.lockedOn;
  const total = lineTotal(line.qty, line.unit_price);

  return (
    <li className={`bg-ink-2 rounded-sm shadow-inset-line ${isDone ? "opacity-60" : ""}`} data-line={line.title}>
      <div className="flex items-center gap-1 pr-3">
        <button
          type="button"
          onClick={() => onWrite({ status: isDone ? "open" : "done" })}
          disabled={!editable}
          className={`shrink-0 w-11 h-11 flex items-center justify-center ${isDone ? "text-status-completed" : "text-bone-400 hover:text-bone-100"}`}
          aria-label={isDone ? `Mark ${line.title} open` : `Mark ${line.title} done`}
        >
          {isDone ? <Check size={16} /> : <Square size={16} />}
        </button>
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex-1 min-w-0 min-h-[44px] flex items-center gap-2 text-left py-1.5"
          aria-expanded={expanded}
        >
          <span className={`text-sm break-words ${isDone ? "line-through text-bone-400" : "text-bone-100"}`}>
            {line.title}
          </span>
          {line.photos.length > 0 && (
            <span className="chip normal-case tracking-normal border-line-strong text-bone-400 shrink-0">
              <Camera size={9} />
              {line.photos.length}
            </span>
          )}
        </button>
        {pricing && line.unit !== null && (
          <span className="shrink-0 text-right">
            {needsPrice(line) ? (
              <span className="chip border-status-lead/40 text-status-lead">needs a price</span>
            ) : !line.billable ? (
              <span className="text-2xs text-bone-500">not billed</span>
            ) : (
              <span className="num text-sm text-bone-100">{money(total ?? 0)}</span>
            )}
          </span>
        )}
      </div>

      {pricing && line.unit !== null && (
        <div className="flex flex-wrap items-center gap-2 pl-11 pr-3 pb-2">
          {priceEditable ? (
            <>
              <QtyStepper qty={line.qty} unit={line.unit} onChange={(qty) => onWrite({ qty })} />
              <span className="text-bone-500 text-sm">×</span>
              <PriceField
                price={line.unit_price}
                unit={line.unit}
                onChange={(price) => onWrite({ unit_price: price })}
              />
            </>
          ) : (
            <span className="text-2xs text-bone-400 num">
              {formatQty(line.qty, line.unit)}
              {line.unit_price !== null && ` × ${money(line.unit_price)}/${UNIT_SHORT[line.unit]}`}
              {line.lockedOn && ` · on ${line.lockedOn}, price final`}
            </span>
          )}
        </div>
      )}
      <SaveStatus save={save} onRetry={onRetry} onUndo={unsaved ? onDelete : onUndo} unsaved={unsaved} />

      {expanded && (
        <LineDetails
          line={line}
          editable={editable}
          priceEditable={priceEditable}
          pricing={pricing}
          clientId={clientId}
          rates={rates}
          onWrite={onWrite}
          onMove={onMove}
          onDelete={onDelete}
          onPhotos={onPhotos}
          onError={onError}
        />
      )}
    </li>
  );
}

function QtyStepper({
  qty,
  unit,
  onChange,
}: {
  qty: number;
  unit: LineUnit;
  onChange: (qty: number) => void;
}) {
  const [text, setText] = useState<string | null>(null);

  function commit() {
    if (text === null) return;
    const n = Number(text);
    setText(null);
    if (Number.isFinite(n) && n > 0 && n !== qty) onChange(n);
  }

  return (
    <span className="inline-flex items-center rounded-sm border border-line overflow-hidden">
      <button
        type="button"
        onClick={() => onChange(stepQty(qty, -1, unit))}
        className="w-11 h-11 flex items-center justify-center text-bone-300 hover:text-bone-50"
        aria-label="Less"
      >
        <Minus size={14} />
      </button>
      <input
        inputMode="decimal"
        value={text ?? String(qty)}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="w-14 h-11 text-center num !border-0 !rounded-none !px-1"
        aria-label={`Quantity${unit === "each" ? "" : ` (${UNIT_SHORT[unit]})`}`}
      />
      <button
        type="button"
        onClick={() => onChange(stepQty(qty, 1, unit))}
        className="w-11 h-11 flex items-center justify-center text-bone-300 hover:text-bone-50"
        aria-label="More"
      >
        <Plus size={14} />
      </button>
    </span>
  );
}

function PriceField({
  price,
  unit,
  onChange,
}: {
  price: number | null;
  unit: LineUnit;
  onChange: (price: number | null) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [bad, setBad] = useState(false);

  function commit() {
    if (text === null) return;
    const n = parseMoney(text);
    if (n !== null && Number.isNaN(n)) {
      setBad(true);
      return;
    }
    setBad(false);
    setText(null);
    if (n !== price) onChange(n);
  }

  if (text === null) {
    return (
      <button
        type="button"
        onClick={() => setText(price === null ? "" : String(price))}
        className="min-h-[44px] px-2 num text-sm text-bone-100 rounded-sm border border-dashed border-line-strong"
        aria-label="Edit price"
      >
        {price === null ? "Set price" : money(price)}
        <span className="text-2xs text-bone-400">/{UNIT_SHORT[unit]}</span>
      </button>
    );
  }
  return (
    <input
      autoFocus
      inputMode="decimal"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setText(null);
      }}
      placeholder="0.00"
      className={`w-28 min-h-[44px] num ${bad ? "!border-status-danger" : ""}`}
      aria-label="Price"
    />
  );
}

function SaveStatus({
  save,
  onRetry,
  onUndo,
  unsaved,
}: {
  save: SaveState | undefined;
  onRetry: () => void;
  onUndo: () => void;
  unsaved: boolean;
}) {
  if (!save) return null;
  if (save.state === "saving") {
    return (
      <div className="pl-11 pr-3 pb-2 -mt-1 text-2xs text-bone-400 flex items-center gap-1" role="status">
        <Loader2 size={10} className="animate-spin" /> Saving…
      </div>
    );
  }
  if (save.state === "saved") {
    return (
      <div className="pl-11 pr-3 pb-2 -mt-1 text-2xs text-status-completed flex items-center gap-1" role="status">
        <Check size={10} /> Saved
      </div>
    );
  }
  return (
    <div className="pl-11 pr-3 pb-2 text-2xs flex flex-wrap items-center gap-x-3 gap-y-1" role="alert">
      <span className="text-status-danger">Not saved: {save.error}</span>
      <button type="button" onClick={onRetry} className="underline text-bone-100 min-h-[44px]">
        Retry
      </button>
      <button type="button" onClick={onUndo} className="underline text-bone-300 min-h-[44px]">
        {unsaved ? "Remove" : "Undo"}
      </button>
    </div>
  );
}

function LineDetails({
  line,
  editable,
  priceEditable,
  pricing,
  clientId,
  rates,
  onWrite,
  onMove,
  onDelete,
  onPhotos,
  onError,
}: {
  line: JobLine;
  editable: boolean;
  priceEditable: boolean;
  pricing: boolean;
  clientId: number;
  rates: Rates;
  onWrite: (patch: Patch) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onPhotos: (photos: TaskPhoto[]) => void;
  onError: (m: string | null) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [title, setTitle] = useState(line.title);
  const [note, setNote] = useState(line.note ?? "");
  const [uploading, setUploading] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  function saveText() {
    const t = title.trim();
    if (!t) {
      setTitle(line.title);
      return onError("Title can't be empty.");
    }
    const n = note.trim() || null;
    if (t !== line.title || n !== line.note) onWrite({ title: t, note: n });
  }

  async function uploadPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    onError(null);
    setUploading(true);
    const added: TaskPhoto[] = [];
    try {
      for (const file of Array.from(files)) {
        const compressed = await compressImage(file);
        const fd = new FormData();
        fd.append("photo", new File([compressed], "photo.jpg", { type: compressed.type || "image/jpeg" }));
        const res = await fetch(`/api/tasks/${line.id}/photos`, { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Photo upload failed.");
        added.push({ id: data.id, caption: null });
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : "Photo upload failed.");
    } finally {
      if (added.length) onPhotos([...line.photos, ...added]);
      setUploading(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (libraryRef.current) libraryRef.current.value = "";
    }
  }

  async function saveCaption(photoId: number, caption: string) {
    const { error } = await supabase
      .from("task_photos")
      .update({ caption: caption.trim() || null })
      .eq("id", photoId);
    if (error) onError(error.message);
  }

  async function removePhoto(photoId: number) {
    if (!confirm("Delete this photo?")) return;
    onError(null);
    const r = await deleteTaskPhoto(photoId);
    if (!r.ok) onError(r.error);
    else onPhotos(line.photos.filter((p) => p.id !== photoId));
  }

  return (
    <div className="px-3 pb-3 space-y-2 border-t border-line-subtle pt-2">
      {editable ? (
        <>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveText}
            className="w-full text-sm min-h-[44px]"
            aria-label="Line title"
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={saveText}
            placeholder="Note — what exactly, where, customer preference…"
            rows={2}
            className="w-full text-sm"
            aria-label="Line note"
          />
        </>
      ) : (
        line.note && <p className="text-sm text-bone-300">{line.note}</p>
      )}

      {pricing && priceEditable && line.unit !== null && (
        <label className="flex items-center gap-2 text-sm text-bone-100 min-h-[44px]">
          <input
            type="checkbox"
            checked={line.billable}
            onChange={(e) => onWrite({ billable: e.target.checked })}
            className="w-5 h-5"
          />
          Bill this line
        </label>
      )}

      {pricing && editable && line.unit === "hour" && (
        <SaveToPriceBook line={line} clientId={clientId} rates={rates} />
      )}

      {line.photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {line.photos.map((p) => (
            <li key={p.id} className="space-y-1">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/task-photos/${p.id}`}
                  alt={p.caption ?? line.title}
                  loading="lazy"
                  className="w-full aspect-square object-cover rounded-sm border border-line"
                />
                {editable && (
                  <button
                    type="button"
                    onClick={() => removePhoto(p.id)}
                    className="absolute top-0 right-0 w-11 h-11 flex items-start justify-end p-1.5 text-bone-300 hover:text-status-danger"
                    aria-label="Delete photo"
                  >
                    <span className="bg-ink-1/80 rounded-sm p-1">
                      <Trash2 size={11} />
                    </span>
                  </button>
                )}
              </div>
              {editable ? (
                <input
                  defaultValue={p.caption ?? ""}
                  onBlur={(e) => saveCaption(p.id, e.target.value)}
                  placeholder="Caption"
                  className="w-full !text-2xs !py-1"
                />
              ) : (
                p.caption && <p className="text-2xs text-bone-400">{p.caption}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => uploadPhotos(e.target.files)}
          />
          <input
            ref={libraryRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => uploadPhotos(e.target.files)}
          />
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={uploading}
            className="btn-secondary text-xs min-h-[44px]"
          >
            {uploading ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
            Camera
          </button>
          <button
            type="button"
            onClick={() => libraryRef.current?.click()}
            disabled={uploading}
            className="btn-secondary text-xs min-h-[44px]"
          >
            <ImagePlus size={12} />
            Library
          </button>
          <button
            type="button"
            onClick={() => onMove(-1)}
            className="btn-ghost min-h-[44px] min-w-[44px]"
            aria-label="Move up"
          >
            <ChevronUp size={14} />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            className="btn-ghost min-h-[44px] min-w-[44px]"
            aria-label="Move down"
          >
            <ChevronDown size={14} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={!!line.lockedOn}
            className="btn-ghost text-xs min-h-[44px] text-bone-500 hover:text-status-danger ml-auto"
          >
            <Trash2 size={12} />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// --- Save to price book -------------------------------------------------------------

/**
 * Turn an hourly line into price-book work: a name, the hours it usually
 * takes and which rate it bills at. It is sold each, at hours × that rate, so
 * it follows the rate when the rate changes. The line itself is untouched.
 */
function SaveToPriceBook({ line, clientId, rates }: { line: JobLine; clientId: number; rates: Rates }) {
  const supabase = useMemo(() => createClient(), []);
  const builtIn = line.title === LABOR_HOURLY || line.title === SKILLED_HOURLY;
  const guessedRate: RateType =
    line.title === SKILLED_HOURLY ||
    (line.title !== LABOR_HOURLY && line.unit_price !== null && line.unit_price === rates.skilled && rates.skilled !== rates.general)
      ? "skilled"
      : "general";
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(builtIn ? "" : line.title);
  const [hours, setHours] = useState(String(line.qty));
  const [rateType, setRateType] = useState<RateType>(guessedRate);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const h = Number(hours);
  const price = hours.trim() !== "" && Number.isFinite(h) ? priceFromHours(h, rates[rateType], "each") : null;

  async function save() {
    setErr(null);
    const r = rowFromHourlyLine({ name, hours, rateType });
    if (!r.ok) return setErr(r.error);
    setBusy(true);
    const { data: existing, error: readErr } = await supabase.from("service_catalog").select("name").eq("active", true);
    if (readErr) {
      setBusy(false);
      return setErr(readErr.message);
    }
    if ((existing ?? []).some((e) => e.name.trim().toLowerCase() === r.row.name.toLowerCase())) {
      setBusy(false);
      return setErr(`"${r.row.name}" is already in the price book.`);
    }
    const { error } = await supabase.from("service_catalog").insert({ client_id: clientId, ...r.row });
    setBusy(false);
    if (error) return setErr(error.message);
    setDone(`Saved "${r.row.name}" to the price book${price !== null ? ` at ${money(price)} each` : ""}.`);
    setOpen(false);
  }

  if (!open) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => { setOpen(true); setDone(null); }} className="btn-secondary text-xs min-h-[44px]">
          Save to price book
        </button>
        {done && <span className="text-2xs text-field-500" role="status">{done}</span>}
      </div>
    );
  }

  return (
    <div className="border border-line rounded-sm p-3 space-y-2" data-testid="save-to-price-book">
      <label className="field-group">
        <span className="field-label">Name in the price book</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="What the work is, like Patch drywall"
          className="w-full min-h-[44px]"
          aria-label="Name in the price book"
        />
      </label>
      <label className="field-group">
        <span className="field-label">Typical hours</span>
        <input
          inputMode="decimal"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          className="w-full min-h-[44px]"
          aria-label="Typical hours"
        />
      </label>
      <fieldset className="field-group">
        <legend className="field-label">Labor rate</legend>
        <div className="flex flex-wrap gap-x-4">
          {(["general", "skilled"] as RateType[]).map((t) => (
            <label key={t} className="flex items-center gap-2 text-sm text-bone-100 min-h-[44px]">
              <input
                type="radio"
                name={`rate-${line.id}`}
                checked={rateType === t}
                onChange={() => setRateType(t)}
                className="w-4 h-4"
              />
              {RATE_LABEL[t]}
              <span className="text-bone-400 num">{rates[t] === null ? "(not set)" : `${money(rates[t]!)}/hr`}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="text-2xs text-bone-400" data-testid="save-price">
        {price !== null
          ? `Price: ${money(price)} each (${h} hr × ${money(rates[rateType]!)}/hr)`
          : rates[rateType] === null
            ? `Your ${RATE_LABEL[rateType].toLowerCase()} rate isn't set, so this will need a price.`
            : "Enter the hours to see the price."}
      </p>
      {err && <div className="form-error">{err}</div>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => { setOpen(false); setErr(null); }} className="btn-ghost text-xs min-h-[44px]">
          Cancel
        </button>
        <button type="button" onClick={save} disabled={busy} className="btn-primary text-xs min-h-[44px]">
          {busy ? <Loader2 size={12} className="animate-spin" /> : "Save"}
        </button>
      </div>
    </div>
  );
}
