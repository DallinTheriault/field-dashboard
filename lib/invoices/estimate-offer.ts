import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { InvoiceRow } from "@/lib/estimator/expenses";
import {
  estimateRows,
  estimateToBill,
  pricedTwice,
  type EstimateClaim,
  type EstimateLink,
} from "./estimate-rows";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type EstimateOffer = {
  /** The accepted estimate an invoice can bill now, with its rows; null when there's none. */
  estimate: { id: number; version: number; total: number; rows: InvoiceRow[] } | null;
  /** The invoice (not voided) that already bills this job's estimate, if one does. */
  claimedBy: EstimateClaim | null;
  /**
   * Lines of that estimate (offered or already billed) linked to a job line
   * that has its own price: billing both bills the work twice.
   */
  linkedTwice: EstimateLink[];
};

/**
 * The job's estimate as its invoice would bill it. Throws when a read fails:
 * a page shows its error screen, an action reports it, and neither carries on
 * as if the job had no estimate.
 */
export async function loadEstimateOffer(supabase: Supabase, jobId: number): Promise<EstimateOffer> {
  const [{ data: versions }, { data: invoices }] = await Promise.all([
    supabase.from("estimates").select("id, version, status").eq("job_id", jobId).throwOnError(),
    supabase
      .from("invoices")
      .select("id, invoice_number, estimate_id")
      .eq("job_id", jobId)
      .not("estimate_id", "is", null)
      .neq("status", "voided")
      .throwOnError(),
  ]);
  const claims: EstimateClaim[] = (invoices ?? []).map((i) => ({
    estimate_id: Number(i.estimate_id),
    invoice_id: Number(i.id),
    invoice_number: i.invoice_number,
  }));
  const pick = estimateToBill(
    (versions ?? []).map((v) => ({ id: Number(v.id), version: Number(v.version), status: String(v.status) })),
    claims,
  );
  if (pick.estimateId === null) {
    const billed = pick.claimedBy?.estimate_id ?? null;
    return { estimate: null, claimedBy: pick.claimedBy, linkedTwice: billed === null ? [] : await linksOf(supabase, billed) };
  }

  const [{ data: est }, { data: lines }, linkedTwice] = await Promise.all([
    supabase
      .from("estimates")
      .select("id, version, computed_price, manual_override_price, resolved_travel_fee, travel_zones(label)")
      .eq("id", pick.estimateId)
      .single()
      .throwOnError(),
    supabase
      .from("estimate_line_items")
      .select("description, qty, unit, resolved_client_amount")
      .eq("estimate_id", pick.estimateId)
      .order("sort_order")
      .order("id")
      .throwOnError(),
    linksOf(supabase, pick.estimateId),
  ]);
  const zone = est.travel_zones as unknown as { label: string } | null;
  const computed = Number(est.computed_price ?? 0);
  const override = est.manual_override_price === null ? null : Number(est.manual_override_price);
  const rows = estimateRows({
    id: Number(est.id),
    version: Number(est.version),
    computed_price: computed,
    manual_override_price: override,
    resolved_travel_fee: Number(est.resolved_travel_fee ?? 0),
    zoneLabel: zone?.label ?? null,
    lines: (lines ?? []).map((l) => ({
      description: l.description,
      qty: Number(l.qty),
      unit: l.unit,
      resolved_client_amount: Number(l.resolved_client_amount),
    })),
  });
  return {
    estimate: { id: Number(est.id), version: Number(est.version), total: override ?? computed, rows },
    claimedBy: null,
    linkedTwice,
  };
}

/** The estimate's lines linked to a priced, billable job line. */
async function linksOf(supabase: Supabase, estimateId: number): Promise<EstimateLink[]> {
  const { data } = await supabase
    .from("estimate_line_items")
    .select("description, task_id, tasks(title, billable, unit_price)")
    .eq("estimate_id", estimateId)
    .not("task_id", "is", null)
    .order("sort_order")
    .throwOnError();
  return pricedTwice(
    (data ?? []).flatMap((l) => {
      const t = l.tasks as unknown as { title: string; billable: boolean; unit_price: number | string | null } | null;
      if (!t) return [];
      return [
        {
          line: String(l.description),
          taskId: Number(l.task_id),
          taskTitle: t.title,
          billable: t.billable,
          unitPrice: t.unit_price === null ? null : Number(t.unit_price),
        },
      ];
    }),
  );
}
