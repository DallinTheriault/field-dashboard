/**
 * INSIGHTS — the feedback loop that makes the owner's numbers converge on
 * reality (ported from the standalone estimator). Estimated numbers come
 * from FROZEN estimate snapshots; actuals from time/material logs.
 * "Apply to catalog" is a Settings change — future estimates only, per the
 * Snapshot Rule. Pure functions; callers assemble rows from Supabase.
 */

const round2 = (n: number) => Math.round((n + 1e-9) * 100) / 100;

export type VarianceLine = {
  service_id: number | null;
  resolved_labor_hours: number;
  resolved_labor_cost: number;
};

export type VarianceEstimate = {
  id: number;
  job_id: number;
  computed_cost: number;
  resolved_loaded_rate: number;
  resolved_travel_fee: number;
};

export type VarianceServiceRow = {
  id: number;
  name: string;
  type: "MEASURED" | "TASK";
  unit: string | null;
  labor_hours_per_unit: number | null;
  flat_labor_hours: number | null;
};

export interface JobVariance {
  jobId: number;
  estHours: number;
  actualHours: number;
  hoursVariancePct: number | null;
  estMaterialCost: number;
  actualMaterialCost: number;
  materialVariancePct: number | null;
  estCost: number;
  /** actual hours × the estimate's FROZEN loaded rate + actual materials + travel */
  actualCost: number;
  costVariancePct: number | null;
  hasActuals: boolean;
}

function pct(actual: number, est: number): number | null {
  if (est <= 0) return null;
  return (actual - est) / est;
}

export function jobVariance(
  estimate: VarianceEstimate,
  lines: VarianceLine[],
  actualHours: number,
  actualMaterialCost: number,
): JobVariance {
  const estHours = lines.reduce((s, l) => s + l.resolved_labor_hours, 0);
  // Estimated material cost = everything in the frozen cost that isn't
  // labor or travel.
  const estMaterialCost = round2(
    estimate.computed_cost -
      lines.reduce((s, l) => s + l.resolved_labor_cost, 0) -
      estimate.resolved_travel_fee,
  );
  const actualCost = round2(
    actualHours * estimate.resolved_loaded_rate +
      actualMaterialCost +
      estimate.resolved_travel_fee,
  );

  return {
    jobId: estimate.job_id,
    estHours: round2(estHours),
    actualHours: round2(actualHours),
    hoursVariancePct: pct(actualHours, estHours),
    estMaterialCost,
    actualMaterialCost: round2(actualMaterialCost),
    materialVariancePct: pct(actualMaterialCost, estMaterialCost),
    estCost: estimate.computed_cost,
    actualCost,
    costVariancePct: pct(actualCost, estimate.computed_cost),
    hasActuals: actualHours > 0 || actualMaterialCost > 0,
  };
}

export interface CatalogItemVariance {
  service: VarianceServiceRow;
  jobCount: number;
  estHours: number;
  /** Job actual hours attributed to this item by its share of estimated hours. */
  attributedActualHours: number;
  /** attributed / estimated — 1.22 means "runs +22% over estimate". */
  ratio: number;
  currentRate: number;
  suggestedRate: number;
}

export type LearnableJob = {
  jobId: number;
  lines: VarianceLine[];
  actualHours: number;
};

/**
 * Aggregate variance per catalog item across learnable jobs (completed or
 * paid) with logged hours. Time is logged per JOB, so actual hours are
 * attributed to lines proportionally to their estimated share — the
 * standard approach when a solo operator won't stopwatch individual tasks.
 */
export function catalogVariance(
  services: VarianceServiceRow[],
  learnableJobs: LearnableJob[],
): CatalogItemVariance[] {
  const acc = new Map<
    number,
    { est: number; attributed: number; jobs: Set<number> }
  >();

  for (const job of learnableJobs) {
    const estHours = job.lines.reduce((s, l) => s + l.resolved_labor_hours, 0);
    if (job.actualHours <= 0 || estHours <= 0) continue;

    for (const line of job.lines) {
      if (!line.service_id) continue; // ad-hoc lines can't teach the catalog
      const share = line.resolved_labor_hours / estHours;
      const entry =
        acc.get(line.service_id) ?? { est: 0, attributed: 0, jobs: new Set() };
      entry.est += line.resolved_labor_hours;
      entry.attributed += job.actualHours * share;
      entry.jobs.add(job.jobId);
      acc.set(line.service_id, entry);
    }
  }

  const rows: CatalogItemVariance[] = [];
  for (const [serviceId, e] of acc) {
    const service = services.find((s) => s.id === serviceId);
    if (!service || e.est <= 0) continue;
    const ratio = e.attributed / e.est;
    const currentRate =
      (service.type === "MEASURED"
        ? service.labor_hours_per_unit
        : service.flat_labor_hours) ?? 0;
    const suggested = currentRate * ratio;
    rows.push({
      service,
      jobCount: e.jobs.size,
      estHours: round2(e.est),
      attributedActualHours: round2(e.attributed),
      ratio,
      currentRate,
      // measured rates are small (hr/sqft) — keep 4 decimals; tasks 2
      suggestedRate:
        service.type === "MEASURED"
          ? Math.round(suggested * 10000) / 10000
          : Math.round(suggested * 100) / 100,
    });
  }

  // Biggest misses first — that's where the money leaks
  return rows.sort((a, b) => Math.abs(b.ratio - 1) - Math.abs(a.ratio - 1));
}

/** Apply-worthy threshold: |variance| ≥ 10%. */
export function isApplyWorthy(row: CatalogItemVariance): boolean {
  return Math.abs(row.ratio - 1) >= 0.1;
}
