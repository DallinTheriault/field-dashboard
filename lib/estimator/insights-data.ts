import type { SupabaseClient } from "@supabase/supabase-js";
import {
  catalogVariance,
  jobVariance,
  type CatalogItemVariance,
  type JobVariance,
  type LearnableJob,
  type VarianceLine,
  type VarianceServiceRow,
} from "./insights";

export type JobVarianceRow = JobVariance & {
  jobName: string;
  jobStatus: string;
  estimateId: number;
  learnable: boolean;
};

export type InsightsData = {
  jobRows: JobVarianceRow[];
  catalogRows: CatalogItemVariance[];
  services: VarianceServiceRow[];
};

/**
 * Assemble variance data for the tenant (RLS-scoped). One estimate per job
 * (the latest version). "Learnable" — trustworthy enough to teach the
 * catalog — means the job is completed or its invoice is paid; the
 * estimator's COMPLETE/INVOICED/PAID statuses mapped onto Field's model.
 */
export async function getInsightsData(
  supabase: SupabaseClient,
): Promise<InsightsData> {
  const [estimates, lines, time, mats, services, paidInvoices] =
    await Promise.all([
      supabase
        .from("estimates")
        .select(
          "id, job_id, version, computed_cost, resolved_loaded_rate, resolved_travel_fee, jobs(name, status)",
        )
        .order("version", { ascending: true }),
      supabase
        .from("estimate_line_items")
        .select("estimate_id, service_id, resolved_labor_hours, resolved_labor_cost"),
      supabase.from("time_entries").select("job_id, hours"),
      // Job-assigned expense lines are the material/parts actuals now.
      // Job material cost = the three job assignments (§7.3); stock never
      // counts. Pre-assignment rows with a job still count (they were
      // explicitly logged on the job).
      supabase
        .from("expenses")
        .select("job_id, amount")
        .not("job_id", "is", null)
        .neq("assignment", "stock"),
      supabase
        .from("service_catalog")
        .select("id, name, type, unit, labor_hours_per_unit, flat_labor_hours"),
      supabase
        .from("invoices")
        .select("job_id")
        .eq("status", "paid")
        .not("invoice_number", "is", null),
    ]);

  // Latest estimate per job — ascending version order means later overwrites.
  const latestByJob = new Map<
    number,
    {
      id: number;
      job_id: number;
      computed_cost: number;
      resolved_loaded_rate: number;
      resolved_travel_fee: number;
      jobName: string;
      jobStatus: string;
    }
  >();
  for (const e of estimates.data ?? []) {
    const job = e.jobs as unknown as { name: string | null; status: string } | null;
    latestByJob.set(e.job_id, {
      id: e.id,
      job_id: e.job_id,
      computed_cost: Number(e.computed_cost ?? 0),
      resolved_loaded_rate: Number(e.resolved_loaded_rate ?? 0),
      resolved_travel_fee: Number(e.resolved_travel_fee ?? 0),
      jobName: job?.name ?? `Job #${e.job_id}`,
      jobStatus: job?.status ?? "lead",
    });
  }

  const linesByEstimate = new Map<number, VarianceLine[]>();
  for (const l of lines.data ?? []) {
    const arr = linesByEstimate.get(l.estimate_id) ?? [];
    arr.push({
      service_id: l.service_id,
      resolved_labor_hours: Number(l.resolved_labor_hours ?? 0),
      resolved_labor_cost: Number(l.resolved_labor_cost ?? 0),
    });
    linesByEstimate.set(l.estimate_id, arr);
  }

  const hoursByJob = new Map<number, number>();
  for (const t of time.data ?? []) {
    hoursByJob.set(t.job_id, (hoursByJob.get(t.job_id) ?? 0) + Number(t.hours));
  }
  const matCostByJob = new Map<number, number>();
  for (const m of mats.data ?? []) {
    matCostByJob.set(
      m.job_id,
      (matCostByJob.get(m.job_id) ?? 0) + Number(m.amount),
    );
  }
  const paidJobs = new Set((paidInvoices.data ?? []).map((i) => i.job_id));

  const serviceRows: VarianceServiceRow[] = (services.data ?? []).map((s) => ({
    ...s,
    labor_hours_per_unit:
      s.labor_hours_per_unit === null ? null : Number(s.labor_hours_per_unit),
    flat_labor_hours:
      s.flat_labor_hours === null ? null : Number(s.flat_labor_hours),
  }));

  const jobRows: JobVarianceRow[] = [];
  const learnable: LearnableJob[] = [];
  for (const est of latestByJob.values()) {
    const estLines = linesByEstimate.get(est.id) ?? [];
    const actualHours = hoursByJob.get(est.job_id) ?? 0;
    const actualMats = matCostByJob.get(est.job_id) ?? 0;
    const isLearnable =
      est.jobStatus === "completed" || paidJobs.has(est.job_id);

    const v = jobVariance(est, estLines, actualHours, actualMats);
    if (v.hasActuals) {
      jobRows.push({
        ...v,
        jobName: est.jobName,
        jobStatus: est.jobStatus,
        estimateId: est.id,
        learnable: isLearnable,
      });
    }
    if (isLearnable) {
      learnable.push({ jobId: est.job_id, lines: estLines, actualHours });
    }
  }

  jobRows.sort(
    (a, b) =>
      Math.abs(b.costVariancePct ?? 0) - Math.abs(a.costVariancePct ?? 0),
  );

  return {
    jobRows,
    catalogRows: catalogVariance(serviceRows, learnable),
    services: serviceRows,
  };
}
