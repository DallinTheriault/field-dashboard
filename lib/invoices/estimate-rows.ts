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
