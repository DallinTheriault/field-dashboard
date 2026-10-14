import { formatQty, lineTotal, UNIT_SHORT, type LineUnit } from "@/lib/jobs/lines";
import type { InvoiceRow } from "@/lib/estimator/expenses";

/**
 * Building an invoice from the job (slice 3). Pure: the server action reads
 * the job's lines and extras, these decide what a draft carries, and the
 * invoice_create_from_job / invoice_set_draft RPCs claim exactly the task and
 * expense ids found on the rows.
 */

export type DraftTask = {
  id: number;
  title: string;
  status: "open" | "done";
  sort_order: number;
  qty: number;
  unit: LineUnit | null;
  unit_price: number | null;
  billable: boolean;
  invoice_id: number | null;
};

const bySort = (a: DraftTask, b: DraftTask) => a.sort_order - b.sort_order || a.id - b.id;
const billablePriced = (t: DraftTask) => t.billable && t.unit_price !== null;

/** What a new draft takes: done, billable, priced lines on no invoice. */
export function doneUnbilled(tasks: DraftTask[]): DraftTask[] {
  return tasks.filter((t) => t.status === "done" && billablePriced(t) && t.invoice_id === null).sort(bySort);
}

/** Billable and priced but not done yet: listed on the draft, added on purpose. */
export function openUnbilled(tasks: DraftTask[]): DraftTask[] {
  return tasks.filter((t) => t.status === "open" && billablePriced(t) && t.invoice_id === null).sort(bySort);
}

/**
 * Billable lines still waiting for a price that would go out with this
 * invoice: on no invoice yet, or on this one. Sending is refused while any
 * remain (invoices_guard_send enforces it too).
 */
export function needingPrice(tasks: DraftTask[], invoiceId: number | null): DraftTask[] {
  return tasks
    .filter((t) => t.billable && t.unit_price === null && (t.invoice_id === null || t.invoice_id === invoiceId))
    .sort(bySort);
}

/** One job line as an invoice row: "3 × $95.00", "1.5 hr × $85.00/hr". */
export function taskRow(t: DraftTask): InvoiceRow {
  const price = t.unit_price ?? 0;
  const plainCount = t.unit === null || t.unit === "each";
  const qtyLabel =
    plainCount && t.qty === 1
      ? null
      : `${formatQty(t.qty, t.unit)} × $${price.toFixed(2)}${plainCount ? "" : `/${UNIT_SHORT[t.unit as LineUnit]}`}`;
  return {
    description: t.title,
    qtyLabel,
    amount: lineTotal(t.qty, price) ?? 0,
    task_id: t.id,
  };
}

export type InvoiceTotals = { subtotalCents: number; taxCents: number; totalCents: number };

export function invoiceTotals(rows: Array<Pick<InvoiceRow, "amount">>, taxRatePct: number): InvoiceTotals {
  const subtotalCents = rows.reduce((s, r) => s + Math.round(r.amount * 100), 0);
  const taxCents = Math.round((subtotalCents * taxRatePct) / 100);
  return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
}

/** The task and expense ids a set of rows bills, i.e. what the draft claims. */
export function claimsOf(rows: InvoiceRow[]): { taskIds: number[]; expenseIds: number[] } {
  const taskIds = rows.flatMap((r) => (Number.isInteger(r.task_id) ? [r.task_id as number] : []));
  const expenseIds = rows.flatMap((r) => (Number.isInteger(r.extra_expense_id) ? [r.extra_expense_id as number] : []));
  return { taskIds: [...new Set(taskIds)], expenseIds: [...new Set(expenseIds)] };
}

/** Dollars short of the minimum job charge, or null when it's met or unset. */
export function belowMinimum(totalCents: number, minimumJobCharge: number | null | undefined): number | null {
  const min = Math.round(Number(minimumJobCharge ?? 0) * 100);
  return min > 0 && totalCents < min ? (min - totalCents) / 100 : null;
}

/**
 * The price the customer agreed to: the newest accepted estimate (an old
 * builder estimate, or slice 5's approval snapshot), as charged.
 */
export function agreedTotal(
  estimates: Array<{ version: number; status: string; computed_price: number | null; manual_override_price: number | null }>,
): { version: number; total: number } | null {
  const accepted = estimates.filter((e) => e.status === "accepted").sort((a, b) => b.version - a.version)[0];
  if (!accepted) return null;
  return { version: accepted.version, total: Number(accepted.manual_override_price ?? accepted.computed_price ?? 0) };
}

/**
 * Which letterhead a job's invoice uses: the one already on the job, else its
 * newest estimate's, else the tenant default, else the first active one.
 */
export function pickBillingEntity(
  jobEntityId: number | null,
  estimateEntityIds: Array<number | null>,
  entities: Array<{ id: number; is_default: boolean; active: boolean }>,
): number | null {
  const active = entities.filter((e) => e.active);
  const ok = (id: number | null) => id !== null && active.some((e) => e.id === id);
  if (ok(jobEntityId)) return jobEntityId;
  const fromEstimate = estimateEntityIds.find(ok);
  if (fromEstimate !== undefined && fromEstimate !== null) return fromEstimate;
  return active.find((e) => e.is_default)?.id ?? active[0]?.id ?? null;
}
