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
  /** Payments received in the period (cash basis: income is the day it came in). */
  paymentCents: number[];
  expenses: Array<{ category: string; amount: number; job_id?: number | null }>;
}): PnlSummary {
  const income = round2(
    input.paymentCents.reduce((s, c) => s + c, 0) / 100,
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
  job_in_bid: "Job — included in my price",
  job_extra: "Job — bill to customer (at cost)",
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
  /** Stored PRE-TAX line total (expense_items amounts stay pre-tax). */
  amount: number;
  /** The parent receipt's tax + subtotal, for proration. Null/absent
   * when the purchase carries no tax data (manual entries). */
  purchaseTax?: number | null;
  purchaseSubtotal?: number | null;
  /** Bill marked up by the tenant's material markup instead of at cost. */
  billMarkup?: boolean;
};

export type InvoiceRow = {
  description: string;
  qtyLabel: string | null;
  amount: number;
  /** Marks a row injected from a job_extra expense item (refresh/strip key). */
  extra_expense_id?: number;
  /** Marks a row billed from a job line (task); the draft claims that task. */
  task_id?: number;
  /**
   * Logged hours this row bills (a labor line) or covers (the minimum
   * charge); the draft claims them, and the database keeps a labor line in
   * step with its hours while the invoice is a draft.
   */
  time_entry_ids?: number[];
  /** Labor lines: the hourly rate the hours are billed at. */
  rate?: number;
  /** "labor": logged hours × rate. "minimum": the minimum service charge. */
  kind?: "labor" | "minimum";
  /** On the invoice at $0.00 because the minimum charge covers it. */
  covered?: boolean;
};

/**
 * The sales-tax proration factor for one item: the owner paid tax on the
 * whole receipt, so each item's true cost is amount × (1 + tax/subtotal).
 * Falls back to 1 (raw amount) when the purchase has no tax data —
 * manual entries — or a zero/absent subtotal (guard: never divide by 0).
 */
export function taxFactor(
  purchaseTax: number | null | undefined,
  purchaseSubtotal: number | null | undefined,
): number {
  if (
    purchaseTax == null ||
    purchaseSubtotal == null ||
    !(purchaseSubtotal > 0) ||
    !(purchaseTax >= 0)
  ) {
    return 1;
  }
  return 1 + purchaseTax / purchaseSubtotal;
}

/**
 * What one extra cost (tax-inclusive: its prorated share of the receipt's
 * sales tax) and what it bills: the same, or marked up by the tenant's
 * material markup when the item says so. The app shows both when they differ.
 */
export function extraAmounts(
  it: Pick<ExtraItem, "amount" | "purchaseTax" | "purchaseSubtotal" | "billMarkup">,
  markupPct = 0,
): { cost: number; billed: number } {
  const cost = round2(it.amount * taxFactor(it.purchaseTax, it.purchaseSubtotal));
  const billed = it.billMarkup && markupPct > 0 ? round2(cost * (1 + markupPct)) : cost;
  return { cost, billed };
}

/**
 * job_extra items -> invoice rows, at cost by default (tax-inclusive: what
 * the owner actually paid, including the receipt's prorated sales tax) or
 * marked up per item. Grouped under a clear label so the customer sees these
 * as additional materials, separate from the scope.
 */
export function buildExtraInvoiceRows(
  items: ExtraItem[],
  markupPct = 0,
): {
  rows: InvoiceRow[];
  addedTotal: number;
} {
  const rows = items.map((it) => {
    const marked = !!it.billMarkup && markupPct > 0;
    const factor =
      taxFactor(it.purchaseTax, it.purchaseSubtotal) * (marked ? 1 + markupPct : 1);
    return {
      description: marked
        ? `Additional materials: ${it.description}`
        : `Additional materials (at cost, incl. sales tax): ${it.description}`,
      qtyLabel:
        it.qty !== null && it.qty !== 1 && it.unit_price !== null
          ? `${it.qty} × $${round2(it.unit_price * factor).toFixed(2)}`
          : null,
      amount: extraAmounts(it, markupPct).billed,
      extra_expense_id: it.id,
    };
  });
  return {
    rows,
    addedTotal: round2(rows.reduce((s, r) => s + r.amount, 0)),
  };
}

export type MaterialsSplit = {
  /** Covered by the quote. */
  inBid: number;
  /** Recovered — invoiced at cost as an extra. */
  billed: number;
  /** Absorbed — eaten, never billed. */
  absorbed: number;
};

/**
 * Absorbed vs recovered over a set of expense items (JOB_PAGE_EXPENSE_SPEC
 * §6.2). `stock` is excluded entirely: company tools and consumables are a
 * business asset, not a job cost.
 *
 * This is explicit absorption only. It cannot tell you that in-bid materials
 * overran what the bid assumed — both the assumed and the overrun dollars sit
 * in `job_in_bid`. Insights' estimated-vs-actual is the complementary signal.
 */
export function splitMaterials(
  items: Array<{ assignment?: string | null; amount: number | string }>,
): MaterialsSplit {
  let inBid = 0;
  let billed = 0;
  let absorbed = 0;
  for (const it of items) {
    const amt = Number(it.amount);
    if (!Number.isFinite(amt)) continue;
    switch (it.assignment) {
      case "job_in_bid":
        inBid += amt;
        break;
      case "job_extra":
        billed += amt;
        break;
      case "job_internal":
        absorbed += amt;
        break;
      default:
        break; // stock and unassigned never count toward job materials
    }
  }
  return { inBid: round2(inBid), billed: round2(billed), absorbed: round2(absorbed) };
}

/**
 * Stock spend for the year, broken out by the Schedule-C category already on
 * those rows (§6.2 addition). Display only — no new field, no split of the
 * stock assignment value.
 */
export function summarizeStock(
  items: Array<{ assignment?: string | null; amount: number | string; category?: string | null }>,
): { total: number; byCategory: Array<{ category: string; total: number }> } {
  const byCat = new Map<string, number>();
  let total = 0;
  for (const it of items) {
    if (it.assignment !== "stock") continue;
    const amt = Number(it.amount);
    if (!Number.isFinite(amt)) continue;
    total += amt;
    const key = it.category || "Other";
    byCat.set(key, (byCat.get(key) ?? 0) + amt);
  }
  return {
    total: round2(total),
    byCategory: [...byCat.entries()]
      .map(([category, t]) => ({ category, total: round2(t) }))
      .sort((a, b) => b.total - a.total),
  };
}

/** Strip previously-injected extras (refresh support: drop then re-add). */
export function withoutExtraRows(rows: InvoiceRow[]): InvoiceRow[] {
  return rows.filter((r) => r.extra_expense_id === undefined);
}
