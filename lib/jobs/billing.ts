/**
 * A job's billing state, from the job_billing view (v099): worked out from
 * its lines, extras, invoices and payments, never set by hand. Separate from
 * the job's status, which stays about the work.
 */
export type BillingState = "ready" | "invoiced" | "part_paid" | "paid";

export const BILLING_LABEL: Record<BillingState, string> = {
  ready: "Ready to invoice",
  invoiced: "Invoiced",
  part_paid: "Part paid",
  paid: "Paid",
};

/** The jobs list's "Unpaid" filter: anything not yet paid in full. */
export const UNPAID: BillingState[] = ["ready", "invoiced", "part_paid"];

export type JobBilling = {
  state: BillingState | null;
  readyCount: number;
  invoicedCents: number;
  paidCents: number;
  owedCents: number;
  paidOutsideAt: string | null;
  paidOutsideNote: string | null;
};

export const BILLING_COLS =
  "job_id, state, ready_count, invoiced_cents, paid_cents, owed_cents, paid_outside_at, paid_outside_note";

export function toJobBilling(r: Record<string, unknown>): JobBilling {
  return {
    state: (r.state as BillingState | null) ?? null,
    readyCount: Number(r.ready_count ?? 0),
    invoicedCents: Number(r.invoiced_cents ?? 0),
    paidCents: Number(r.paid_cents ?? 0),
    owedCents: Number(r.owed_cents ?? 0),
    paidOutsideAt: (r.paid_outside_at as string | null) ?? null,
    paidOutsideNote: (r.paid_outside_note as string | null) ?? null,
  };
}

/** Rows from the view keyed by job id. */
export function billingByJob(rows: Array<Record<string, unknown>> | null | undefined): Map<number, JobBilling> {
  return new Map((rows ?? []).map((r) => [Number(r.job_id), toJobBilling(r)]));
}
