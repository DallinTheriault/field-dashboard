/**
 * Tax P&L assembly — pure functions. Income is PAID estimator invoices
 * (invoice every job, even cash/Venmo ones, and mark them paid — that's the
 * system of record). The cost side is logged expenses plus job materials
 * already logged through Actuals (no double entry).
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
  loggedExpenses: number;
  jobMaterials: number;
  totalExpenses: number;
  net: number;
  byCategory: Array<{ category: string; total: number }>;
};

export function summarizePnl(input: {
  paidInvoiceCents: number[];
  expenses: Array<{ category: string; amount: number }>;
  jobMaterialCosts: number[];
}): PnlSummary {
  const income = round2(
    input.paidInvoiceCents.reduce((s, c) => s + c, 0) / 100,
  );
  const loggedExpenses = round2(
    input.expenses.reduce((s, e) => s + e.amount, 0),
  );
  const jobMaterials = round2(
    input.jobMaterialCosts.reduce((s, c) => s + c, 0),
  );
  const totalExpenses = round2(loggedExpenses + jobMaterials);

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
    loggedExpenses,
    jobMaterials,
    totalExpenses,
    net: round2(income - totalExpenses),
    byCategory,
  };
}
