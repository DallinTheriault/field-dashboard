"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Receipt, X } from "lucide-react";
import { createInvoiceFromJob } from "@/app/app/estimator/job-invoice-actions";
import type { InvoiceRow } from "@/lib/estimator/expenses";
import {
  coveredRow,
  hoursLabel,
  laborRow,
  minimumRow,
  partRow,
  subtotalOf,
  totalHours,
} from "@/lib/invoices/job-draft";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export type BuilderPart = {
  id: number;
  description: string;
  qty: number | null;
  /** Assigned "Bill to customer" today (else "Included in my price"). */
  billToCustomer: boolean;
  /** How it bills at cost. */
  row: InvoiceRow;
};

/**
 * What the invoice bills, chosen here; the server rebuilds the same rows and
 * the database claims them. Itemized: work lines, logged hours as one labor
 * line, ticked receipt lines at cost. Under the minimum, one tap bills it as
 * the minimum: every line and part at $0.00 plus the minimum trip charge.
 */
export function InvoiceBuilder({
  jobId,
  work,
  hours,
  parts,
  rates,
  minimum,
  entities,
  defaultEntityId,
}: {
  jobId: number;
  work: InvoiceRow[];
  hours: Array<{ id: number; hours: number; date: string }>;
  parts: BuilderPart[];
  rates: { general: number | null; skilled: number | null };
  minimum: number;
  entities: Array<{ id: number; label: string }>;
  defaultEntityId: number | null;
}) {
  const router = useRouter();
  const pricedWork = work.some((r) => r.amount > 0);
  // Priced work lines already cover labor: hours start unticked so nothing is billed twice.
  const [billHours, setBillHours] = useState(!pricedWork && hours.length > 0);
  const [skilled, setSkilled] = useState(false);
  const [billParts, setBillParts] = useState<Set<number>>(new Set(parts.filter((p) => p.billToCustomer).map((p) => p.id)));
  const [typed, setTyped] = useState<string[]>([]);
  const [draftLine, setDraftLine] = useState("");
  const [asMinimum, setAsMinimum] = useState(false);
  const [entityId, setEntityId] = useState<number | null>(defaultEntityId);
  const [taxPct, setTaxPct] = useState("");
  const [dueTerms, setDueTerms] = useState("Due on receipt");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const rate = skilled ? rates.skilled : rates.general;
  const typedRows: InvoiceRow[] = typed.map((t) => ({ description: t, qtyLabel: null, amount: 0 }));
  const labor = billHours ? laborRow(hours, rate ?? 0, skilled) : null;
  const itemized = [...work, ...typedRows, ...(labor ? [labor] : []), ...parts.filter((p) => billParts.has(p.id)).map((p) => p.row)];
  const itemizedSubtotal = subtotalOf(itemized);
  const underMinimum = minimum > 0 && itemizedSubtotal < minimum;
  const minimumMode = asMinimum && minimum > 0;
  const preview = minimumMode
    ? [
        ...[...work, ...typedRows].map(coveredRow),
        ...parts.filter((p) => p.billToCustomer).map((p) => partRow(p, true)),
        ...parts.filter((p) => !p.billToCustomer).map((p) => partRow(p, false)),
        minimumRow(minimum, hours.map((h) => h.id)),
      ]
    : itemized;

  function addTyped() {
    const t = draftLine.trim();
    if (!t) return;
    setTyped((prev) => [...prev, t]);
    setDraftLine("");
  }

  async function create() {
    setErr(null);
    setBusy(true);
    const r = await createInvoiceFromJob(jobId, {
      billingEntityId: entityId,
      taxRatePct: taxPct.trim() ? parseFloat(taxPct) : 0,
      dueTerms,
      plan: {
        mode: minimumMode ? "minimum" : "itemized",
        billHours: billHours && hours.length > 0,
        skilled,
        billPartIds: [...billParts],
        typedLines: typed,
      },
    });
    if (!r.ok) {
      setBusy(false);
      return setErr(r.error);
    }
    router.push(`/app/estimator/invoices/${r.data!.invoiceId}`);
  }

  return (
    <div className="space-y-4">
      <section className="panel px-4 py-3 space-y-2" data-testid="builder-work">
        <div className="label-eyebrow">Work</div>
        {work.length === 0 && typed.length === 0 && (
          <p className="text-2xs text-bone-400">No work lines on the job. Type what you did; each line is listed on the invoice.</p>
        )}
        <ul className="text-sm space-y-1">
          {work.map((r, i) => (
            <li key={`w${i}`} className="flex gap-3">
              <span className="flex-1 min-w-0 text-bone-100 break-words">
                {r.description}
                {r.qtyLabel && <span className="text-2xs text-bone-400"> {r.qtyLabel}</span>}
              </span>
              <span className="num text-bone-300">{usd.format(r.amount)}</span>
            </li>
          ))}
          {typed.map((t, i) => (
            <li key={`t${i}`} className="flex items-center gap-3" data-testid="typed-line">
              <span className="flex-1 min-w-0 text-bone-100 break-words">{t}</span>
              <span className="num text-bone-300">{usd.format(0)}</span>
              <button
                type="button"
                onClick={() => setTyped((prev) => prev.filter((_, j) => j !== i))}
                className="w-11 h-11 flex items-center justify-center text-bone-500 hover:text-status-danger"
                aria-label={`Remove ${t}`}
              >
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
        {work.length === 0 && (
          <div className="flex gap-2">
            <input
              value={draftLine}
              onChange={(e) => setDraftLine(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTyped();
                }
              }}
              placeholder="What you did (e.g. Replaced toilet fill valve)"
              aria-label="What you did"
              className="flex-1 min-w-0 min-h-[44px]"
            />
            <button type="button" onClick={addTyped} className="btn-secondary text-xs min-h-[44px]">
              <Plus size={12} />
              Add line
            </button>
          </div>
        )}
      </section>

      {hours.length > 0 && (
        <section className="panel px-4 py-3 space-y-2" data-testid="builder-hours">
          <div className="label-eyebrow">Logged hours</div>
          {minimumMode ? (
            <p className="text-2xs text-bone-400">
              {hoursLabel(totalHours(hours))} hr, covered by the minimum charge.
            </p>
          ) : (
            <>
              <label className="flex items-center gap-2 text-sm text-bone-100 min-h-[44px]">
                <input type="checkbox" checked={billHours} onChange={(e) => setBillHours(e.target.checked)} aria-label="Bill logged hours" />
                Bill {hoursLabel(totalHours(hours))} hr of logged time
                {labor && <span className="num text-bone-300 ml-auto">{usd.format(labor.amount)}</span>}
              </label>
              <div className="flex gap-2" role="radiogroup" aria-label="Hourly rate">
                {(["general", "skilled"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={skilled === (k === "skilled")}
                    disabled={rates[k] === null}
                    onClick={() => setSkilled(k === "skilled")}
                    className={`text-xs min-h-[44px] px-3 rounded-md ${skilled === (k === "skilled") ? "btn-primary" : "btn-ghost"}`}
                  >
                    {k === "general" ? "General" : "Skilled"} {rates[k] === null ? "(not set)" : `${usd.format(rates[k] as number)}/hr`}
                  </button>
                ))}
              </div>
              {pricedWork && (
                <p className="text-2xs text-bone-400" data-testid="hours-covered-note">
                  Your work lines are priced, and that price covers labor, so the hours aren&apos;t billed. Tick to bill them as well.
                </p>
              )}
              {!billHours && (
                <p className="text-2xs text-bone-500">Hours left unticked count as covered by this invoice once it&apos;s sent.</p>
              )}
            </>
          )}
        </section>
      )}

      {parts.length > 0 && (
        <section className="panel px-4 py-3 space-y-1" data-testid="builder-parts">
          <div className="label-eyebrow">Receipts on this job</div>
          {minimumMode ? (
            <p className="text-2xs text-bone-400">Listed at $0.00; the minimum charge covers them. They stay in your expenses as job costs.</p>
          ) : (
            <p className="text-2xs text-bone-400">
              Ticked lines are billed to the customer at cost. Unticked lines count as included in your price.
            </p>
          )}
          {!minimumMode &&
            parts.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm text-bone-100 min-h-[44px]">
                <input
                  type="checkbox"
                  checked={billParts.has(p.id)}
                  onChange={(e) =>
                    setBillParts((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(p.id);
                      else next.delete(p.id);
                      return next;
                    })
                  }
                  aria-label={`Bill ${p.description} to customer`}
                />
                <span className="flex-1 min-w-0 break-words">
                  {p.description}
                  <span className="text-2xs text-bone-400"> · {billParts.has(p.id) ? "Bill to customer" : "Included in my price"}</span>
                </span>
                <span className="num text-bone-300">{usd.format(p.row.amount)}</span>
              </label>
            ))}
        </section>
      )}

      {underMinimum && (
        <div className="panel px-4 py-3 text-sm space-y-2 text-status-lead" data-testid="suggest-minimum">
          {minimumMode ? (
            <>
              <div>
                Billing as your minimum: each line and part at $0.00, plus Minimum trip charge {usd.format(minimum)}.
              </div>
              <button type="button" onClick={() => setAsMinimum(false)} className="btn-ghost text-xs min-h-[44px]">
                Bill itemized instead
              </button>
            </>
          ) : (
            <>
              <div>
                This comes to {usd.format(itemizedSubtotal)} before tax, under your {usd.format(minimum)} minimum.
              </div>
              <button type="button" onClick={() => setAsMinimum(true)} className="btn-secondary text-xs min-h-[44px]">
                Bill as minimum
              </button>
            </>
          )}
        </div>
      )}

      <section className="panel px-4 py-3 space-y-2" data-testid="invoice-preview">
        <div className="label-eyebrow">The draft will take</div>
        {preview.length === 0 ? (
          <p className="text-2xs text-bone-400">Nothing to bill yet. You can still make the draft and add lines to it.</p>
        ) : (
          <ul className="text-sm space-y-1">
            {preview.map((r, i) => (
              <li key={i} className="flex gap-3" data-row={r.description}>
                <span className="flex-1 min-w-0 text-bone-100 break-words">
                  {r.description}
                  {r.qtyLabel && <span className="text-2xs text-bone-400"> {r.qtyLabel}</span>}
                </span>
                <span className="num text-bone-300">{usd.format(r.amount)}</span>
              </li>
            ))}
            <li className="flex gap-3 border-t border-line-subtle pt-1 font-medium">
              <span className="flex-1 text-bone-50">Before tax</span>
              <span className="num text-bone-50" data-testid="preview-subtotal">{usd.format(subtotalOf(preview))}</span>
            </li>
          </ul>
        )}
      </section>

      <section className="panel px-4 py-3 space-y-3">
        {entities.length > 1 && (
          <label className="field-group">
            <span className="field-label">Bill as</span>
            <select value={entityId ?? ""} onChange={(e) => setEntityId(Number(e.target.value))} className="w-full min-h-[44px]">
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex flex-wrap gap-3">
          <label className="field-group">
            <span className="field-label">Tax % (optional)</span>
            <input inputMode="decimal" value={taxPct} onChange={(e) => setTaxPct(e.target.value)} placeholder="0" className="w-24 min-h-[44px]" />
          </label>
          <label className="field-group flex-1 min-w-40">
            <span className="field-label">Terms</span>
            <input value={dueTerms} onChange={(e) => setDueTerms(e.target.value)} className="w-full min-h-[44px]" />
          </label>
        </div>
        {err && <div className="form-error">{err}</div>}
        <button type="button" onClick={create} disabled={busy || entityId === null} className="btn-primary text-sm min-h-[44px]">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Receipt size={13} />}
          Create draft
        </button>
        {entityId === null && <p className="text-2xs text-status-lead">Add a billing entity in Business › Pricing first.</p>}
      </section>
    </div>
  );
}
