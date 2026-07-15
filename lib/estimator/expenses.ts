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

/** Item assignment — where a purchased item's cost lands (handoff 3). */
export const ASSIGNMENTS = [
  "unassigned",
  "job_in_bid",
  "job_extra",
  "job_internal",
  "stock",
] as const;
export type Assignment = (typeof ASSIGNMENTS)[number];

export const ASSIGNMENT_LABELS: Record<Assignment, string> = {
  unassigned: "Unassigned",
  job_in_bid: "Job — in bid",
  job_extra: "Job — extra (invoiced at cost)",
  job_internal: "Job — internal (eaten)",
  stock: "Stock / company",
};

/** Job types — count toward job material cost; stock never does. */
export const JOB_ASSIGNMENTS: Assignment[] = [
  "job_in_bid",
  "job_extra",
  "job_internal",
];

export type ExtraItem = {
  id: number;
  description: string;
  qty: number | null;
  unit_price: number | null;
  amount: number;
};

export type InvoiceRow = {
  description: string;
  qtyLabel: string | null;
  amount: number;
  /** Marks a row injected from a job_extra expense item (refresh/strip key). */
  extra_expense_id?: number;
};

/**
 * job_extra items -> invoice rows AT COST (locked decision: no markup —
 * effort is billed via labor). Grouped under a clear label so the customer
 * sees these as additional materials, separate from the bid scope.
 */
export function buildExtraInvoiceRows(items: ExtraItem[]): {
  rows: InvoiceRow[];
  addedTotal: number;
} {
  const rows = items.map((it) => ({
    description: `Additional materials (at cost): ${it.description}`,
    qtyLabel:
      it.qty !== null && it.qty !== 1 && it.unit_price !== null
        ? `${it.qty} × $${it.unit_price.toFixed(2)}`
        : null,
    amount: round2(it.amount),
    extra_expense_id: it.id,
  }));
  return {
    rows,
    addedTotal: round2(rows.reduce((s, r) => s + r.amount, 0)),
  };
}

/** Strip previously-injected extras (refresh support: drop then re-add). */
export function withoutExtraRows(rows: InvoiceRow[]): InvoiceRow[] {
  return rows.filter((r) => r.extra_expense_id === undefined);
}
