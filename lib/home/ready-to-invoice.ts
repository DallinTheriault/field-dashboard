import { lineTotal } from "@/lib/jobs/lines";

/**
 * Jobs that are ready to invoice, for Home: a job with finished, priced lines
 * or extras no invoice has claimed yet, and any completed job with nothing
 * sent yet (older jobs priced through estimates have no lines at all).
 */
export type ReadyJob = {
  jobId: number;
  /** What the unclaimed lines and extras add up to; 0 when the job has none. */
  readyCents: number;
  lineCount: number;
  /** Completed, and nothing has gone out for it. */
  nothingSent: boolean;
  /** An unsent draft already exists: open it rather than start another. */
  draftId: number | null;
  draftNumber: string | null;
};

type Task = { job_id: number; qty: number | string; unit_price: number | string };
type Extra = { job_id: number; amount: number | string };
type Inv = { id: number; job_id: number; status: string; stripe_invoice_id: string | null; invoice_number: string | null };

/** Went out: sent, paid or overdue, or issued through Stripe. A void doesn't count. */
export function wentOut(i: Pick<Inv, "status" | "stripe_invoice_id">): boolean {
  return i.status !== "voided" && (i.status !== "draft" || i.stripe_invoice_id !== null);
}

export function readyToInvoice(input: {
  /** Done, billable, priced lines no invoice has claimed. */
  tasks: Task[];
  /** Job extras no invoice has claimed. */
  extras: Extra[];
  completedJobIds: number[];
  /** The candidate jobs' invoices. */
  invoices: Inv[];
}): ReadyJob[] {
  const byJob = new Map<number, ReadyJob>();
  const get = (jobId: number) => {
    let r = byJob.get(jobId);
    if (!r) {
      r = { jobId, readyCents: 0, lineCount: 0, nothingSent: false, draftId: null, draftNumber: null };
      byJob.set(jobId, r);
    }
    return r;
  };
  for (const t of input.tasks) {
    const amount = lineTotal(Number(t.qty), Number(t.unit_price)) ?? 0;
    const r = get(t.job_id);
    r.readyCents += Math.round(amount * 100);
    r.lineCount++;
  }
  for (const e of input.extras) {
    const r = get(e.job_id);
    r.readyCents += Math.round(Number(e.amount) * 100);
    r.lineCount++;
  }
  const sent = new Set(input.invoices.filter(wentOut).map((i) => i.job_id));
  for (const id of input.completedJobIds) {
    if (!sent.has(id)) get(id).nothingSent = true;
  }
  for (const i of input.invoices) {
    const r = byJob.get(i.job_id);
    if (r && i.status === "draft" && i.stripe_invoice_id === null && r.draftId === null) {
      r.draftId = i.id;
      r.draftNumber = i.invoice_number;
    }
  }
  return [...byJob.values()];
}
