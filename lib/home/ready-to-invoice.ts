import { lineTotal } from "@/lib/jobs/lines";

/**
 * What to say about each job in Home's "Ready to invoice". Which jobs are
 * ready comes from the job_billing view (v099), the same state as the job's
 * badge; this only adds the details: what the unclaimed lines and extras add
 * up to, whether nothing has gone out, and an unsent draft to open.
 */
export type ReadyJob = {
  jobId: number;
  /** What the unclaimed, priced lines and extras add up to; 0 when none. */
  readyCents: number;
  lineCount: number;
  /** Unclaimed finished lines with no price yet. */
  needsPrice: number;
  /** Completed, and nothing has gone out for it. */
  nothingSent: boolean;
  /** An unsent draft already exists: open it rather than start another. */
  draftId: number | null;
  draftNumber: string | null;
};

type Task = { job_id: number; qty: number | string; unit_price: number | string | null };
type Extra = { job_id: number; amount: number | string };
type Inv = { id: number; job_id: number; status: string; stripe_invoice_id: string | null; invoice_number: string | null };

/** Went out: sent, paid or overdue, or issued through Stripe. A void doesn't count. */
export function wentOut(i: Pick<Inv, "status" | "stripe_invoice_id">): boolean {
  return i.status !== "voided" && (i.status !== "draft" || i.stripe_invoice_id !== null);
}

export function readyToInvoice(input: {
  /** The ready jobs, in the order to show them. */
  jobIds: number[];
  /** Done, billable lines no invoice has claimed (priced or not). */
  tasks: Task[];
  /** Job extras no invoice has claimed. */
  extras: Extra[];
  completedJobIds: number[];
  /** The ready jobs' invoices. */
  invoices: Inv[];
}): ReadyJob[] {
  const byJob = new Map<number, ReadyJob>(
    input.jobIds.map((jobId) => [
      jobId,
      { jobId, readyCents: 0, lineCount: 0, needsPrice: 0, nothingSent: false, draftId: null, draftNumber: null },
    ]),
  );
  for (const t of input.tasks) {
    const r = byJob.get(t.job_id);
    if (!r) continue;
    r.lineCount++;
    if (t.unit_price === null) r.needsPrice++;
    else r.readyCents += Math.round((lineTotal(Number(t.qty), Number(t.unit_price)) ?? 0) * 100);
  }
  for (const e of input.extras) {
    const r = byJob.get(e.job_id);
    if (!r) continue;
    r.lineCount++;
    r.readyCents += Math.round(Number(e.amount) * 100);
  }
  const sent = new Set(input.invoices.filter(wentOut).map((i) => i.job_id));
  for (const id of input.completedJobIds) {
    const r = byJob.get(id);
    if (r && !sent.has(id)) r.nothingSent = true;
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
