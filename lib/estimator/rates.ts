/**
 * Rate math — part of the pricing engine (Docs/ESTIMATOR_SPEC.md → cost_settings).
 * Pure functions, shared by server and client (live recompute in Settings UI).
 * The full line-item/job pricing engine lands in Milestone 3 alongside these.
 */

/** hours_worked_per_week × 52 / 12 × utilization_pct */
export function monthlyBillableHours(
  hoursWorkedPerWeek: number,
  utilizationPct: number,
): number {
  return (hoursWorkedPerWeek * 52) / 12 * utilizationPct;
}

/** (desired_annual_owner_pay / 12 + monthly_overhead) / monthly_billable_hours */
export function loadedLaborRate(
  desiredAnnualOwnerPay: number,
  monthlyOverhead: number,
  billableHoursPerMonth: number,
): number {
  if (billableHoursPerMonth <= 0) return 0;
  return (desiredAnnualOwnerPay / 12 + monthlyOverhead) / billableHoursPerMonth;
}

/**
 * loaded_labor_rate / (1 − margin_pct) — the $/hr the owner effectively sells
 * labor at; displayed as a market gut-check. MARGIN math, not markup.
 */
export function effectiveSellRate(
  loadedRate: number,
  marginPct: number,
): number {
  if (marginPct >= 1) return 0;
  return loadedRate / (1 - marginPct);
}
