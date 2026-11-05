import { buildClientDocRows, type FrozenLineForDoc } from "@/lib/estimator/client-rows";
import type { InvoiceRow } from "@/lib/estimator/expenses";

/**
 * An accepted estimate on the job's invoice (v105). Its client rows (lines,
 * plus the legacy travel and price-adjustment rows) go on the invoice as work
 * lines marked "per estimate", each carrying estimate_id: that's what the
 * draft claims, so the estimate can't be billed twice.
 */

export const PER_ESTIMATE = "per estimate";

export type EstimateForInvoice = {
  id: number;
  version: number;
  computed_price: number;
  manual_override_price: number | null;
  resolved_travel_fee: number;
  zoneLabel: string | null;
  lines: FrozenLineForDoc[];
};

/** The estimate's rows as the invoice bills them. */
export function estimateRows(est: EstimateForInvoice): InvoiceRow[] {
  const { rows } = buildClientDocRows({
    lines: est.lines,
    travelFee: est.resolved_travel_fee,
    zoneLabel: est.zoneLabel,
    computedPrice: est.computed_price,
    overridePrice: est.manual_override_price,
  });
  return rows.map((r) => ({
    description: r.description,
    qtyLabel: r.qtyLabel ? `${r.qtyLabel}, ${PER_ESTIMATE}` : PER_ESTIMATE,
    amount: r.amount,
    estimate_id: est.id,
  }));
}

export type EstimateVersion = { id: number; version: number; status: string };
export type EstimateClaim = { estimate_id: number; invoice_id: number; invoice_number: string | null };

/**
 * Which of a job's estimates an invoice can bill: the newest accepted
 * version, unless some version is already on an invoice that isn't voided
 * (older versions stay "accepted" after a revision; billing the new one on
 * top of the old would bill the job twice). The database checks the same.
 */
export function estimateToBill(
  versions: EstimateVersion[],
  claims: EstimateClaim[],
): { estimateId: number | null; claimedBy: EstimateClaim | null } {
  const ids = new Set(versions.map((v) => v.id));
  const claimedBy = claims.find((c) => ids.has(c.estimate_id)) ?? null;
  if (claimedBy) return { estimateId: null, claimedBy };
  const newest = versions
    .filter((v) => v.status === "accepted")
    .sort((a, b) => b.version - a.version || b.id - a.id)[0];
  return { estimateId: newest?.id ?? null, claimedBy: null };
}

/** An estimate line linked to a job line ("Link to task" in the estimate builder). */
export type EstimateLink = {
  line: string;
  taskId: number;
  taskTitle: string;
  billable: boolean;
  unitPrice: number | null;
};

/**
 * Links that would bill the same work twice: the job line has its own price
 * and is billable, so it bills on top of the estimate line that covers it.
 */
export function pricedTwice(links: EstimateLink[]): EstimateLink[] {
  return links.filter((l) => l.billable && l.unitPrice !== null);
}

/** Why the draft is refused, naming each estimate line and job line. */
export function billedTwiceMessage(links: EstimateLink[]): string {
  const titles = [...new Set(links.map((l) => `"${l.taskTitle}"`))].join(", ");
  if (links.length === 1) {
    const [l] = links;
    return `On the estimate, "${l.line}" is linked to the job line "${l.taskTitle}", which has its own price, so this invoice would bill that work twice. Mark ${titles} not billable on the job (the estimate prices it), then try again.`;
  }
  const pairs = links.map((l) => `"${l.line}" → "${l.taskTitle}"`).join(", ");
  return `On the estimate, these lines are linked to job lines that have their own prices, so this invoice would bill that work twice: ${pairs}. Mark ${titles} not billable on the job (the estimate prices them), then try again.`;
}
