"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Loader2, Lock } from "lucide-react";
import { taxFactor, type Assignment } from "@/lib/estimator/expenses";
import { jobPickLabel, type JobPick } from "@/lib/jobs/address";
import { setItemsAssignment } from "../purchase-actions";

export type ReceiptItem = {
  id: number;
  description: string;
  sku: string | null;
  qty: number | null;
  unitPrice: number | null;
  amount: number;
  assignment: Assignment;
  jobId: number | null;
  stockCategory: string | null;
  customerNotified: boolean;
  /** On an invoice: its number, and whether it went out (then the item is final). */
  invoice: { number: string; final: boolean } | null;
};

/** The three settings an item takes here (job_internal stays readable, not offered). */
type Kind = "job_extra" | "job_in_bid" | "stock";
type Target = { kind: Kind | null; jobId: number | null; category: string };

const KINDS: Array<[Kind, string, string]> = [
  ["job_extra", "Bill to customer", "on a job's invoice, with its share of tax"],
  ["job_in_bid", "Included in my price", "a job's cost, not billed"],
  ["stock", "Stock / company", "tools & supplies, not job cost"],
];

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const round2 = (n: number) => Math.round((n + 1e-9) * 100) / 100;

/**
 * A receipt's items, each with its own setting, plus "Set all items to…" for
 * the common case (most of a run is one job or stock), then the exceptions
 * one by one. Billed items carry their share of the receipt's tax, as on the
 * invoice. Owner/manager page; the server re-checks every rule.
 */
export function ReceiptItems({
  items,
  jobs,
  categories,
  tax,
  subtotal,
}: {
  items: ReceiptItem[];
  jobs: JobPick[];
  categories: string[];
  tax: number | null;
  subtotal: number | null;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(items);
  const [openId, setOpenId] = useState<number | null>(null);
  const [allOpen, setAllOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // The job and category last used here, so the next item starts on them.
  const [last, setLast] = useState<{ jobId: number | null; category: string }>(() => ({
    jobId: items.find((r) => r.jobId !== null)?.jobId ?? null,
    category: items.find((r) => r.stockCategory)?.stockCategory ?? "",
  }));
  const jobName = (id: number | null) => jobs.find((j) => j.id === id)?.name ?? (id ? `Job #${id}` : "");
  const factor = taxFactor(tax, subtotal);
  const editable = rows.filter((r) => !r.invoice?.final);

  function apply(ids: number[], t: Target, done: () => void) {
    if (!t.kind) return setErr("Pick how these items are used.");
    if (t.kind !== "stock" && !t.jobId) return setErr("Pick a job.");
    const kind = t.kind;
    setErr(null);
    setNote(null);
    startTransition(async () => {
      const r = await setItemsAssignment(ids, {
        assignment: kind,
        jobId: kind === "stock" ? null : t.jobId,
        stockCategory: kind === "stock" ? t.category : null,
        // One item keeps its "customer knows" flag when it stays billed.
        customerNotified: ids.length === 1 ? rows.find((x) => x.id === ids[0])?.customerNotified : false,
      });
      if (!r.ok) return setErr(r.error);
      setRows((cur) =>
        cur.map((x) =>
          ids.includes(x.id) && !x.invoice?.final
            ? {
                ...x,
                assignment: kind,
                jobId: kind === "stock" ? null : t.jobId,
                stockCategory: kind === "stock" ? t.category.trim() || null : null,
                invoice: null,
              }
            : x,
        ),
      );
      setLast({ jobId: kind === "stock" ? last.jobId : t.jobId, category: kind === "stock" ? t.category : last.category });
      if (r.locked > 0) setNote(`${r.locked} item${r.locked === 1 ? " is" : "s are"} on an invoice that went out, so left as ${r.locked === 1 ? "it was" : "they were"}.`);
      done();
      router.refresh();
    });
  }

  // Where the receipt's money is going, by setting.
  const buckets = new Map<string, { label: string; amount: number; billed: number }>();
  for (const r of rows) {
    const key = `${r.assignment}|${r.jobId ?? ""}|${r.assignment === "stock" ? (r.stockCategory ?? "") : ""}`;
    const b = buckets.get(key) ?? { label: chipLabel(r, jobName), amount: 0, billed: 0 };
    b.amount += r.amount;
    if (r.assignment === "job_extra") b.billed += r.amount * factor;
    buckets.set(key, b);
  }

  return (
    <section className="panel">
      <div className="px-4 py-3 border-b border-line space-y-2">
        <div>
          <h2 className="text-sm font-semibold text-bone-100">
            Items <span className="text-2xs text-bone-400 font-normal">({rows.length})</span>
          </h2>
          <p className="text-2xs text-bone-400 mt-0.5">
            Tap an item to set it, or set them all at once and change the exceptions.
          </p>
        </div>

        {rows.length > 0 && (
          <ul className="text-2xs space-y-0.5" aria-label="Totals by setting">
            {[...buckets.entries()].map(([key, b]) => (
              <li key={key} className="flex items-baseline gap-2">
                <span className="flex-1 min-w-0 text-bone-300 truncate">{b.label}</span>
                <span className="num text-bone-100">{usd.format(round2(b.amount))}</span>
                {b.billed > 0 && factor !== 1 && (
                  <span className="num text-bone-400">bills {usd.format(round2(b.billed))} with tax</span>
                )}
              </li>
            ))}
          </ul>
        )}

        {editable.length > 1 && (
          <div>
            <button
              type="button"
              onClick={() => setAllOpen(!allOpen)}
              aria-expanded={allOpen}
              className="btn-secondary text-xs h-9 inline-flex items-center gap-1"
            >
              {allOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Set all items to…
            </button>
            {allOpen && (
              <TargetEditor
                initial={{ kind: null, jobId: last.jobId, category: last.category }}
                jobs={jobs}
                categories={categories}
                busy={pending}
                saveLabel={`Apply to all ${editable.length} items`}
                onSave={(t) => apply(editable.map((r) => r.id), t, () => setAllOpen(false))}
                onCancel={() => setAllOpen(false)}
                note={
                  rows.length > editable.length
                    ? `${rows.length - editable.length} item${rows.length - editable.length === 1 ? " is" : "s are"} on an invoice that went out and stay${rows.length - editable.length === 1 ? "s" : ""} as ${rows.length - editable.length === 1 ? "it is" : "they are"}.`
                    : null
                }
              />
            )}
          </div>
        )}
        {err && <p className="form-error" role="alert">{err}</p>}
        {note && <p className="text-2xs text-bone-300">{note}</p>}
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-4 text-2xs text-bone-400">No items entered from this receipt yet.</p>
      ) : (
        <ul className="divide-y divide-line-subtle">
          {rows.map((it) => {
            const open = openId === it.id;
            const final = !!it.invoice?.final;
            return (
              <li key={it.id} className="px-4 py-2.5" data-item={it.description}>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : it.id)}
                  aria-expanded={open}
                  className="w-full flex items-start gap-2 text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-bone-100 break-words leading-snug">{it.description}</div>
                    <div className="flex flex-wrap items-center gap-x-3 text-2xs text-bone-400 mt-0.5">
                      {it.qty !== null && it.unitPrice !== null && (
                        <span className="num">
                          {it.qty} × {usd.format(it.unitPrice)}
                        </span>
                      )}
                      {it.sku && <span className="font-mono">SKU {it.sku}</span>}
                      <span className={chipTone(it.assignment)}>{chipLabel(it, jobName)}</span>
                      {it.invoice && (
                        <span className="inline-flex items-center gap-1">
                          {final && <Lock size={9} />}
                          {final ? `On invoice ${it.invoice.number}` : `On draft ${it.invoice.number}`}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="num text-sm text-bone-100">{usd.format(it.amount)}</div>
                    {it.assignment === "job_extra" && factor !== 1 && (
                      <div className="num text-2xs text-bone-400">bills {usd.format(round2(it.amount * factor))}</div>
                    )}
                  </div>
                </button>
                {open &&
                  (final ? (
                    <p className="text-2xs text-bone-400 mt-2">
                      On invoice {it.invoice?.number}, which went out, so it&apos;s final. Void that invoice to change it.
                    </p>
                  ) : (
                    <TargetEditor
                      initial={{
                        kind: it.assignment === "job_extra" || it.assignment === "job_in_bid" || it.assignment === "stock" ? it.assignment : null,
                        jobId: it.jobId ?? last.jobId,
                        category: it.stockCategory ?? last.category,
                      }}
                      jobs={jobs}
                      categories={categories}
                      busy={pending}
                      saveLabel="Save"
                      onSave={(t) => apply([it.id], t, () => setOpenId(null))}
                      onCancel={() => setOpenId(null)}
                      note={it.invoice ? `On draft invoice ${it.invoice.number}: the draft follows this change.` : null}
                    />
                  ))}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function chipLabel(it: Pick<ReceiptItem, "assignment" | "jobId" | "stockCategory">, jobName: (id: number | null) => string) {
  switch (it.assignment) {
    case "job_extra":
      return `Bill to customer · ${jobName(it.jobId)}`;
    case "job_in_bid":
      return `Included in my price · ${jobName(it.jobId)}`;
    case "job_internal":
      return `Internal (not billed) · ${jobName(it.jobId)}`;
    case "stock":
      return it.stockCategory ? `Stock · ${it.stockCategory}` : "Stock / company";
    default:
      return "Unassigned";
  }
}

function chipTone(a: Assignment) {
  return a === "unassigned" ? "text-status-lead" : a === "job_extra" ? "text-status-danger" : a === "stock" ? "text-bone-300" : "text-field-400";
}

/** Pick a setting, then the job (or the stock category), then save. */
function TargetEditor({
  initial,
  jobs,
  categories,
  busy,
  saveLabel,
  onSave,
  onCancel,
  note = null,
}: {
  initial: Target;
  jobs: JobPick[];
  categories: string[];
  busy: boolean;
  saveLabel: string;
  onSave: (t: Target) => void;
  onCancel: () => void;
  note?: string | null;
}) {
  const [t, setT] = useState<Target>(initial);
  const listId = "stock-categories";
  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Setting">
        {KINDS.map(([kind, label, hint]) => (
          <button
            key={kind}
            type="button"
            onClick={() => setT({ ...t, kind })}
            aria-pressed={t.kind === kind}
            className={`flex-1 min-w-[104px] rounded-sm px-2.5 py-2 text-left shadow-inset-line ${
              t.kind === kind ? "bg-field-500/15 border border-field-500/50" : "bg-ink-2 border border-transparent hover:bg-ink-3"
            }`}
          >
            <div className="text-sm text-bone-100">{label}</div>
            <div className="text-2xs text-bone-400 leading-tight mt-0.5">{hint}</div>
          </button>
        ))}
      </div>
      {(t.kind === "job_extra" || t.kind === "job_in_bid") && (
        <select
          value={t.jobId ?? ""}
          onChange={(e) => setT({ ...t, jobId: e.target.value ? Number(e.target.value) : null })}
          className="w-full text-sm"
          aria-label="Job"
        >
          <option value="">Pick a job…</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {jobPickLabel(j)}
            </option>
          ))}
        </select>
      )}
      {t.kind === "stock" && (
        <>
          <input
            value={t.category}
            onChange={(e) => setT({ ...t, category: e.target.value })}
            placeholder="Category (e.g. Tools)"
            list={listId}
            className="w-full text-sm"
            aria-label="Stock category"
          />
          <datalist id={listId}>
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </>
      )}
      {note && <p className="text-2xs text-bone-400">{note}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => onSave(t)} disabled={busy || !t.kind} className="btn-primary text-xs h-9">
          {busy ? <Loader2 size={12} className="animate-spin" /> : saveLabel}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost text-xs h-9">
          Cancel
        </button>
      </div>
    </div>
  );
}
