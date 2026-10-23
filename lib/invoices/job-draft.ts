import { formatQty, lineTotal, UNIT_SHORT, type LineUnit } from "@/lib/jobs/lines";
import type { ExtraItem, InvoiceRow } from "@/lib/estimator/expenses";

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

/**
 * What a new draft bills from the job's lines: billable, priced, on no
 * invoice, and done; on a completed job, every such line (the job page
 * already calls the job ready to invoice).
 */
export function readyToBill(tasks: DraftTask[], jobCompleted: boolean): DraftTask[] {
  return jobCompleted
    ? tasks.filter((t) => billablePriced(t) && t.invoice_id === null).sort(bySort)
    : doneUnbilled(tasks);
}

/** Billable and priced but not done yet: listed on the draft, added on purpose. */
export function openUnbilled(tasks: DraftTask[], jobCompleted = false): DraftTask[] {
  if (jobCompleted) return [];
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

/** The task, expense and hour ids a set of rows bills, i.e. what the draft claims. */
export function claimsOf(rows: InvoiceRow[]): { taskIds: number[]; expenseIds: number[]; hourIds: number[] } {
  const taskIds = rows.flatMap((r) => (Number.isInteger(r.task_id) ? [r.task_id as number] : []));
  const expenseIds = rows.flatMap((r) => (Number.isInteger(r.extra_expense_id) ? [r.extra_expense_id as number] : []));
  const hourIds = rows.flatMap((r) => (Array.isArray(r.time_entry_ids) ? r.time_entry_ids.filter(Number.isInteger) : []));
  return { taskIds: [...new Set(taskIds)], expenseIds: [...new Set(expenseIds)], hourIds: [...new Set(hourIds)] };
}

// --- Hours, minimum charge -------------------------------------------------------------

const round2 = (n: number) => Math.round((n + 1e-9) * 100) / 100;

export type HourEntry = { id: number; hours: number };

/** "0.5", "2", "1.25": hours as an invoice line writes them (v103 hours_label). */
export function hoursLabel(hours: number): string {
  return String(Math.round(hours * 100) / 100);
}

export function totalHours(entries: HourEntry[]): number {
  return Math.round(entries.reduce((s, e) => s + e.hours, 0) * 10000) / 10000;
}

/**
 * Logged hours as one labor line: total hours × the general or skilled rate.
 * The line lists the hours it bills, so the draft claims them and the
 * database re-prices it if one changes before the invoice goes out.
 */
export function laborRow(entries: HourEntry[], rate: number, skilled: boolean): InvoiceRow | null {
  if (entries.length === 0 || !(rate > 0)) return null;
  const hours = totalHours(entries);
  return {
    description: skilled ? "Skilled labor" : "Labor",
    qtyLabel: `${hoursLabel(hours)} hr × $${rate.toFixed(2)}/hr`,
    amount: round2(hours * rate),
    time_entry_ids: entries.map((e) => e.id).sort((a, b) => a - b),
    rate,
    kind: "labor",
  };
}

export const MINIMUM_LINE = "Minimum service charge";

/** The minimum charge line; it covers (and claims) the job's logged hours. */
export function minimumRow(minimum: number, hourIds: number[]): InvoiceRow {
  return {
    description: MINIMUM_LINE,
    qtyLabel: null,
    amount: round2(minimum),
    time_entry_ids: [...hourIds].sort((a, b) => a - b),
    kind: "minimum",
  };
}

/** "3 × $95.00" → "× 3"; "1.5 hr × $85.00/hr" → "1.5 hr": the count without the price. */
function countOnly(qtyLabel: string | null | undefined): string | null {
  if (!qtyLabel) return null;
  const head = qtyLabel.split(" × ")[0].trim();
  if (!qtyLabel.includes(" × ")) return qtyLabel;
  return /^[\d.]+$/.test(head) ? `× ${head}` : head;
}

/** A row at $0.00 because the minimum charge covers it; it keeps its claims. */
export function coveredRow(r: InvoiceRow): InvoiceRow {
  return {
    ...r,
    description: r.extra_expense_id !== undefined ? r.description.replace(/^Additional materials[^:]*: /, "") : r.description,
    qtyLabel: countOnly(r.qtyLabel),
    amount: 0,
    covered: true,
  };
}

export type PartUsed = { id: number; description: string; qty: number | null };

/** A part listed at $0.00 on a minimum invoice. Bill-to-customer parts are claimed so they're never billed later. */
export function partRow(p: PartUsed, claim: boolean): InvoiceRow {
  return {
    description: p.description,
    qtyLabel: p.qty !== null && p.qty !== 1 ? `× ${p.qty}` : null,
    amount: 0,
    covered: true,
    ...(claim ? { extra_expense_id: p.id } : {}),
  };
}

/**
 * A minimum invoice: each work line and each part used at $0.00, then one
 * minimum charge line. Parts stay job costs; they just aren't billed.
 */
export function minimumRows(input: {
  work: DraftTask[];
  billToCustomer: Array<Pick<ExtraItem, "id" | "description" | "qty">>;
  included: PartUsed[];
  hourIds: number[];
  minimum: number;
}): InvoiceRow[] {
  return [
    ...input.work.map((t) => coveredRow(taskRow(t))),
    ...input.billToCustomer.map((x) => partRow(x, true)),
    ...input.included.map((p) => partRow(p, false)),
    minimumRow(input.minimum, input.hourIds),
  ];
}

/**
 * "Add minimum service charge" on a draft: every other line at $0.00 (each keeps
 * what it claims), then the minimum, carrying any hours a minimum line
 * already covered.
 */
export function applyMinimum(rows: InvoiceRow[], minimum: number): InvoiceRow[] {
  const hourIds = rows.filter((r) => r.kind === "minimum").flatMap((r) => r.time_entry_ids ?? []);
  return [...rows.filter((r) => r.kind !== "minimum").map(coveredRow), minimumRow(minimum, hourIds)];
}

export function hasMinimum(rows: InvoiceRow[]): boolean {
  return rows.some((r) => r.kind === "minimum");
}

export function subtotalOf(rows: Array<Pick<InvoiceRow, "amount">>): number {
  return invoiceTotals(rows, 0).subtotalCents / 100;
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
