/**
 * Tax P&L assembly — pure functions. Income is PAID estimator invoices
 * (invoice every job, even cash/Venmo ones, and mark them paid — that's the
 * system of record). The cost side is EXPENSE LINES — the single source of
 * truth for money out: job-assigned lines (logged from job Actuals or a
 * purchase) and Stock/overhead lines alike.
 */

export const EXPENSE_CATEGORIES = [
  "Materials & supplies",
  "Tools & equipment",
  "Vehicle & fuel",
  "Insurance",
  "Phone & software",
  "Licenses & fees",
  "Advertising",
  "Subcontractors",
  "Office",
  "Other",
] as const;

const round2 = (n: number) => Math.round((n + 1e-9) * 100) / 100;

export type PnlSummary = {
  income: number;
  totalExpenses: number;
  /** Portion of totalExpenses assigned to a job (materials, hardware…). */
  jobAssigned: number;
  net: number;
  byCategory: Array<{ category: string; total: number }>;
};

export function summarizePnl(input: {
  paidInvoiceCents: number[];
  expenses: Array<{ category: string; amount: number; job_id?: number | null }>;
}): PnlSummary {
  const income = round2(
    input.paidInvoiceCents.reduce((s, c) => s + c, 0) / 100,
  );
  const totalExpenses = round2(
    input.expenses.reduce((s, e) => s + e.amount, 0),
  );
  const jobAssigned = round2(
    input.expenses
      .filter((e) => e.job_id != null)
      .reduce((s, e) => s + e.amount, 0),
  );

  const byCat = new Map<string, number>();
  for (const e of input.expenses) {
    const key = e.category || "Other";
    byCat.set(key, (byCat.get(key) ?? 0) + e.amount);
  }
  const byCategory = [...byCat.entries()]
    .map(([category, total]) => ({ category, total: round2(total) }))
    .sort((a, b) => b.total - a.total);

  return {
    income,
    totalExpenses,
    jobAssigned,
    net: round2(income - totalExpenses),
    byCategory,
  };
}
