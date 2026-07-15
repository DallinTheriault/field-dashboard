"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { updateDraftInvoiceLines } from "../../invoice-actions";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const round2 = (n: number) => Math.round((n + 1e-9) * 100) / 100;

type Line = {
  key: number;
  description: string;
  qtyLabel: string | null;
  amountStr: string;
  extraExpenseId?: number;
  /** User-added adjustment lines get an editable description. */
  isNew: boolean;
};
let lineKey = 0;

/**
 * Draft-only line editor (micro-fix 2026-07-15): amounts edit in place,
 * adjustment lines exist ONLY when the user explicitly adds one — no
 * auto-generated rows. Once the invoice is sent it renders read-only
 * (the server enforces immutability regardless).
 */
export function DraftLines({
  invoiceId,
  rows,
  taxRatePct,
  dueTerms,
}: {
  invoiceId: number;
  rows: Array<{
    description: string;
    qtyLabel: string | null;
    amount: number;
    extra_expense_id?: number;
  }>;
  taxRatePct: number;
  dueTerms: string;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>(
    rows.map((r) => ({
      key: ++lineKey,
      description: r.description,
      qtyLabel: r.qtyLabel,
      amountStr: String(r.amount),
      extraExpenseId: r.extra_expense_id,
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
    const r = await updateDraftInvoiceLines(
      invoiceId,
      lines.map((l) => ({
        description: l.description,
        qtyLabel: l.qtyLabel,
        amount: parseFloat(l.amountStr),
        extra_expense_id: l.extraExpenseId,
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
            <tr key={l.key} className="border-b border-line-subtle">
              <td className="py-1.5 text-bone-100 pr-2">
                {l.isNew ? (
                  <input
                    value={l.description}
                    onChange={(e) => patch(l.key, { description: e.target.value })}
                    placeholder="Adjustment (e.g. Senior discount)"
                    className="w-full text-sm"
                  />
                ) : (
                  <>
                    {l.description}
                    {l.qtyLabel && (
                      <span className="text-2xs text-bone-400"> {l.qtyLabel}</span>
                    )}
                  </>
                )}
              </td>
              <td className="py-1.5 text-right w-28">
                <input
                  inputMode="decimal"
                  value={l.amountStr}
                  onChange={(e) => patch(l.key, { amountStr: e.target.value })}
                  className="w-24 text-right num"
                  aria-label={`Amount for ${l.description || "new line"}`}
                />
              </td>
            </tr>
          ))}
          {taxRatePct > 0 && (
            <>
              <tr>
                <td className="py-2 text-bone-300">Subtotal</td>
                <td className="py-2 text-right num text-bone-300">{usd.format(subtotal)}</td>
              </tr>
              <tr>
                <td className="py-2 text-bone-300">Tax ({taxRatePct}%)</td>
                <td className="py-2 text-right num text-bone-300">{usd.format(tax)}</td>
              </tr>
            </>
          )}
          <tr>
            <td className="py-2.5 font-semibold text-bone-50">Total due</td>
            <td className="py-2.5 text-right num font-semibold text-bone-50">
              {usd.format(total)}
            </td>
          </tr>
        </tbody>
      </table>

      <div className="flex items-center gap-2 mt-2">
        <button
          type="button"
          onClick={() => {
            setLines((prev) => [
              ...prev,
              { key: ++lineKey, description: "", qtyLabel: null, amountStr: "", isNew: true },
            ]);
            setDirty(true);
          }}
          className="btn-ghost text-xs h-8"
        >
          <Plus size={12} />
          Add line
        </button>
        <span className="text-2xs text-bone-400">Terms: {dueTerms}</span>
        {dirty && (
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="btn-primary text-xs h-8 ml-auto"
          >
            {busy ? <Loader2 size={11} className="animate-spin" /> : "Save changes"}
          </button>
        )}
      </div>
      {err && <div className="form-error mt-2">{err}</div>}
      <p className="text-2xs text-bone-500 mt-2">
        Draft — amounts are editable until the invoice is sent.
      </p>
    </div>
  );
}
