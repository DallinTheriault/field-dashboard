"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Loader2, Trash2 } from "lucide-react";
import { deletePayment, recordPayment } from "../../payment-actions";
import {
  METHOD_LABELS,
  RECORDABLE_METHODS,
  balanceDueCents,
  parseDollarsToCents,
  type Payment,
  type PaymentMethod,
} from "@/lib/invoices/payments";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const dayLabel = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });

/**
 * Money received against the invoice. Recording one on a draft also sends it
 * (it was paid outside Field), dated by the payment.
 */
export function PaymentsPanel({
  invoiceId,
  status,
  totalCents,
  payments,
  today,
  canRemove,
  stripeIssued,
  draftBlocked,
}: {
  invoiceId: number;
  status: string;
  totalCents: number;
  payments: Payment[];
  /** Today in the tenant's timezone, YYYY-MM-DD. */
  today: string;
  /** False once Stripe holds the invoice: removing a payment wouldn't reopen it there. */
  canRemove: boolean;
  /** Its card link is for the full amount, so only a full payment is recorded here. */
  stripeIssued: boolean;
  /** Why this draft can't go out yet; a payment would send it, so it waits too. */
  draftBlocked: string | null;
}) {
  const router = useRouter();
  const balance = balanceDueCents(totalCents, payments);
  const [open, setOpen] = useState(false);
  const [receivedOn, setReceivedOn] = useState(today);
  const [amount, setAmount] = useState((balance / 100).toFixed(2));
  const [method, setMethod] = useState<PaymentMethod>("e_check");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const canRecord = status !== "paid" && status !== "voided" && balance > 0;
  const isDraft = status === "draft";
  const blocked = isDraft ? draftBlocked : null;

  // Fresh each time: after a part payment the balance has changed.
  function openForm() {
    setReceivedOn(today);
    setAmount((balance / 100).toFixed(2));
    setErr(null);
    setOpen(true);
  }

  async function save() {
    setErr(null);
    setWarning(null);
    const cents = parseDollarsToCents(amount);
    if (cents === null) return setErr("Enter the amount received, like 435.00.");
    if (cents > balance) return setErr(`That's more than the ${usd.format(balance / 100)} still due.`);
    if (stripeIssued && cents < balance) {
      return setErr(`The card link is for the full ${usd.format(balance / 100)}. Record the full payment, or have the customer pay the link.`);
    }
    if (receivedOn.slice(0, 4) !== today.slice(0, 4) && !confirm(`That date is in ${receivedOn.slice(0, 4)}, so the income goes in ${receivedOn.slice(0, 4)}'s books. Continue?`)) return;
    if (isDraft && !confirm(`This draft hasn't been sent in Field. Recording the payment marks it sent and ${cents === balance ? "paid" : "partly paid"} on ${dayLabel(receivedOn)}. Continue?`)) return;
    setBusy("save");
    const r = await recordPayment(invoiceId, { receivedOn, amountCents: cents, method, reference });
    setBusy(null);
    if (!r.ok) return setErr(r.error);
    if (r.warning) setWarning(r.warning);
    setOpen(false);
    setReference("");
    router.refresh();
  }

  async function remove(p: Payment) {
    if (!confirm(`Remove the ${usd.format(p.amount_cents / 100)} payment from ${dayLabel(p.received_on)}?`)) return;
    setErr(null);
    setBusy(`del-${p.id}`);
    const r = await deletePayment(p.id);
    setBusy(null);
    if (!r.ok) return setErr(r.error);
    router.refresh();
  }

  if (status === "voided" && payments.length === 0) return null;

  return (
    <section className="panel px-4 py-3 space-y-3" data-testid="payments">
      <div className="flex items-center gap-2">
        <div className="label-eyebrow flex-1">Payments</div>
        <span className="text-sm text-bone-300">
          {balance > 0 ? (
            <>
              Balance due <span className="num text-bone-50" data-testid="balance-due">{usd.format(balance / 100)}</span>
            </>
          ) : (
            <span className="text-status-completed">Paid in full</span>
          )}
        </span>
      </div>

      {payments.length > 0 && (
        <ul className="divide-y divide-line-subtle">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center gap-2 py-1.5 min-h-[44px]" data-payment={p.id}>
              <div className="flex-1 min-w-0 text-sm text-bone-100">
                {dayLabel(p.received_on)} · {METHOD_LABELS[p.method]}
                {p.reference && <span className="text-2xs text-bone-400"> #{p.reference}</span>}
              </div>
              <span className="num text-sm text-bone-100">{usd.format(p.amount_cents / 100)}</span>
              {canRemove && p.method !== "card" && (
                <button
                  type="button"
                  onClick={() => remove(p)}
                  disabled={busy !== null}
                  aria-label={`Remove payment of ${usd.format(p.amount_cents / 100)}`}
                  className="btn-ghost min-h-[44px] min-w-[44px] justify-center"
                >
                  {busy === `del-${p.id}` ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canRecord && blocked && (
        <p className="text-sm text-status-lead" data-testid="payment-blocked">
          {blocked} A payment sends the invoice, so it waits for that too.
        </p>
      )}

      {canRecord && !blocked && !open && (
        <button type="button" onClick={openForm} className="btn-primary text-sm min-h-[44px]">
          <Banknote size={13} />
          Record payment
        </button>
      )}

      {canRecord && !blocked && open && (
        <div className="space-y-3">
          {isDraft && (
            <p className="text-2xs text-bone-400">
              Paid before it was sent from Field? Recording it marks the invoice sent on the payment date.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="field-group">
              <span className="field-label">Date received</span>
              <input
                type="date"
                value={receivedOn}
                max={today}
                onChange={(e) => setReceivedOn(e.target.value)}
                className="w-full min-h-[44px]"
              />
            </label>
            <label className="field-group">
              <span className="field-label">Amount</span>
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                readOnly={stripeIssued}
                className="w-full min-h-[44px] num"
              />
            </label>
            <label className="field-group">
              <span className="field-label">How it was paid</span>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                className="w-full min-h-[44px]"
              >
                {RECORDABLE_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-group">
              <span className="field-label">Check / ref #</span>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Optional"
                className="w-full min-h-[44px]"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={busy !== null} className="btn-primary text-sm min-h-[44px]">
              {busy === "save" ? <Loader2 size={13} className="animate-spin" /> : <Banknote size={13} />}
              Save payment
            </button>
            <button type="button" onClick={() => setOpen(false)} disabled={busy !== null} className="btn-ghost text-sm min-h-[44px]">
              Cancel
            </button>
          </div>
        </div>
      )}
      {warning && <div className="text-sm text-status-lead" role="status">{warning}</div>}
      {err && <div className="form-error">{err}</div>}
    </section>
  );
}
