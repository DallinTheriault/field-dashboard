"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { updateDraftInvoiceRows } from "../../job-invoice-actions";
import type { InvoiceRow } from "@/lib/estimator/expenses";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const round2 = (n: number) => Math.round((n + 1e-9) * 100) / 100;

export type DraftRow = InvoiceRow;

/** What a row claims and how the database keeps it in step; carried through edits untouched. */
type RowMeta = Pick<InvoiceRow, "extra_expense_id" | "task_id" | "time_entry_ids" | "rate" | "kind" | "covered">;

type Line = {
  key: number;
  description: string;
  qtyLabel: string | null;
  amountStr: string;
  meta: RowMeta;
  /** User-added adjustment lines get an editable description. */
  isNew: boolean;
};
let lineKey = 0;

/**
 * Draft-only line editor: amounts edit in place, adjustment lines exist only
 * when the user adds one, and any row can be removed. Edits change the
 * invoice, never the job; removing a row that came from a job line or extra
 * releases it so a later invoice can bill it. Once the invoice goes out it
 * renders read-only (the database enforces that regardless).
 */
export function DraftLines({
  invoiceId,
  rows,
  taxRatePct,
  dueTerms,
}: {
  invoiceId: number;
  rows: DraftRow[];
  taxRatePct: number;
  dueTerms: string;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>(
    rows.map((r) => ({
      key: ++lineKey,
      description: r.description,
      qtyLabel: r.qtyLabel,
      amountStr: r.amount.toFixed(2),
      meta: {
        extra_expense_id: r.extra_expense_id,
        task_id: r.task_id,
        time_entry_ids: r.time_entry_ids,
        rate: r.rate,
        kind: r.kind,
        covered: r.covered,
      },
      isNew: false,
    })),
  );
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const patch = (key: number, p: Partial<Line>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...p } : l)));
    setDirty(true);
  };

  const subtotal = round2(
    lines.reduce((s, l) => {
      const a = parseFloat(l.amountStr);
      return s + (Number.isFinite(a) ? a : 0);
    }, 0),
  );
  const tax = round2((subtotal * taxRatePct) / 100);
  const total = round2(subtotal + tax);

  async function save() {
    setErr(null);
    setBusy(true);
    const r = await updateDraftInvoiceRows(
      invoiceId,
      lines.map((l) => ({
        description: l.description,
        qtyLabel: l.qtyLabel,
        amount: parseFloat(l.amountStr),
        ...l.meta,
      })),
    );
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setDirty(false);
    router.refresh();
  }

  return (
    <div className="px-4 py-3">
      <table className="w-full text-sm">
        <tbody>
          {lines.map((l) => (
            <tr key={l.key} className="border-b border-line-subtle" data-row={l.description}>
              <td className="py-1.5 text-bone-100 pr-2">
                {l.isNew ? (
                  <input
                    value={l.description}
                    onChange={(e) => patch(l.key, { description: e.target.value })}
                    placeholder="Adjustment (e.g. Senior discount)"
                    className="w-full text-sm min-h-[44px]"
                  />
                ) : (
                  <>
                    {l.description}
                    {l.qtyLabel && <span className="text-2xs text-bone-400"> {l.qtyLabel}</span>}
                  </>
                )}
              </td>
              <td className="py-1.5 text-right w-28">
                <input
                  inputMode="decimal"
                  value={l.amountStr}
                  onChange={(e) => patch(l.key, { amountStr: e.target.value })}
                  className="w-24 text-right num min-h-[44px]"
                  aria-label={`Amount for ${l.description || "new line"}`}
                />
              </td>
              <td className="py-1.5 w-11">
                <button
                  type="button"
                  onClick={() => {
                    setLines((prev) => prev.filter((x) => x.key !== l.key));
                    setDirty(true);
                  }}
                  className="w-11 h-11 flex items-center justify-center text-bone-500 hover:text-status-danger"
                  aria-label={`Remove ${l.description || "line"}`}
                >
                  <X size={14} />
                </button>
              </td>
            </tr>
          ))}
          {lines.length === 0 && (
            <tr>
              <td colSpan={3} className="py-3 text-2xs text-bone-400">
                No lines yet. Add finished job lines or extras below.
              </td>
            </tr>
          )}
          {taxRatePct > 0 && (
            <>
              <tr>
                <td className="py-2 text-bone-300">Subtotal</td>
                <td className="py-2 text-right num text-bone-300">{usd.format(subtotal)}</td>
                <td />
              </tr>
              <tr>
                <td className="py-2 text-bone-300">Tax ({taxRatePct}%)</td>
                <td className="py-2 text-right num text-bone-300">{usd.format(tax)}</td>
                <td />
              </tr>
            </>
          )}
          <tr>
            <td className="py-2.5 font-semibold text-bone-50">Total due</td>
            <td className="py-2.5 text-right num font-semibold text-bone-50" data-testid="draft-total">
              {usd.format(total)}
            </td>
            <td />
          </tr>
        </tbody>
      </table>

      <div className="flex flex-wrap items-center gap-2 mt-2">
        <button
          type="button"
          onClick={() => {
            setLines((prev) => [
              ...prev,
              { key: ++lineKey, description: "", qtyLabel: null, amountStr: "", meta: {}, isNew: true },
            ]);
            setDirty(true);
          }}
          className="btn-ghost text-xs min-h-[44px]"
        >
          <Plus size={12} />
          Add adjustment
        </button>
        <span className="text-2xs text-bone-400">Terms: {dueTerms}</span>
        {dirty && (
          <button type="button" onClick={save} disabled={busy} className="btn-primary text-xs min-h-[44px] ml-auto">
            {busy ? <Loader2 size={11} className="animate-spin" /> : "Save changes"}
          </button>
        )}
      </div>
      {err && <div className="form-error mt-2">{err}</div>}
      <p className="text-2xs text-bone-500 mt-2">
        Draft: edits change this invoice only, never the job. Removing a job line here
        leaves it on the job, ready for a later invoice.
      </p>
    </div>
  );
}
