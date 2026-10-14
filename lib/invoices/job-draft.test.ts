import { describe, expect, it } from "vitest";
import { buildExtraInvoiceRows, extraAmounts } from "@/lib/estimator/expenses";
import {
  agreedTotal,
  belowMinimum,
  claimsOf,
  doneUnbilled,
  invoiceTotals,
  needingPrice,
  openUnbilled,
  pickBillingEntity,
  taskRow,
  type DraftTask,
} from "./job-draft";

const t = (over: Partial<DraftTask>): DraftTask => ({
  id: 1,
  title: "Line",
  status: "done",
  sort_order: 1,
  qty: 1,
  unit: "each",
  unit_price: 100,
  billable: true,
  invoice_id: null,
  ...over,
});

describe("what a job draft carries", () => {
  const tasks = [
    t({ id: 1, title: "Patch", sort_order: 2 }),
    t({ id: 2, title: "Door", status: "open", sort_order: 1 }),
    t({ id: 3, title: "Outlet", unit_price: null }),
    t({ id: 4, title: "Ladder", unit: null, unit_price: null, billable: false }),
    t({ id: 5, title: "Already billed", invoice_id: 9 }),
    t({ id: 6, title: "Not billed", billable: false }),
    t({ id: 7, title: "Toilet", sort_order: 1 }),
  ];

  it("takes done, billable, priced lines on no invoice, in scope order", () => {
    expect(doneUnbilled(tasks).map((x) => x.id)).toEqual([7, 1]);
  });

  it("lists open billable lines to add on purpose", () => {
    expect(openUnbilled(tasks).map((x) => x.id)).toEqual([2]);
  });

  it("flags billable lines with no price, never reminders or other invoices' lines", () => {
    expect(needingPrice(tasks, null).map((x) => x.id)).toEqual([3]);
    expect(needingPrice([t({ id: 8, unit_price: null, invoice_id: 9 })], 9).map((x) => x.id)).toEqual([8]);
    expect(needingPrice([t({ id: 8, unit_price: null, invoice_id: 9 })], 10)).toEqual([]);
  });
});

describe("taskRow", () => {
  it("labels quantities the way the customer reads them", () => {
    expect(taskRow(t({ id: 1, title: "Toilet swap", unit_price: 180 }))).toEqual({
      description: "Toilet swap", qtyLabel: null, amount: 180, task_id: 1,
    });
    expect(taskRow(t({ qty: 3, unit_price: 95 })).qtyLabel).toBe("3 × $95.00");
    expect(taskRow(t({ qty: 1.5, unit: "hour", unit_price: 85 }))).toMatchObject({ qtyLabel: "1.5 hr × $85.00/hr", amount: 127.5 });
    expect(taskRow(t({ qty: 400, unit: "sqft", unit_price: 1.07 }))).toMatchObject({ qtyLabel: "400 sqft × $1.07/sqft", amount: 428 });
  });
});

describe("invoiceTotals / claimsOf", () => {
  const rows = [
    { description: "a", qtyLabel: null, amount: 285, task_id: 1 },
    { description: "b", qtyLabel: null, amount: 0.1, task_id: 2 },
    { description: "c", qtyLabel: null, amount: 0.2, extra_expense_id: 30 },
    { description: "adjustment", qtyLabel: null, amount: -20 },
  ];
  it("sums cents, then tax", () => {
    expect(invoiceTotals(rows, 0)).toEqual({ subtotalCents: 26530, taxCents: 0, totalCents: 26530 });
    expect(invoiceTotals(rows, 7.25).taxCents).toBe(1923);
  });
  it("claims exactly the lines and extras on the rows", () => {
    expect(claimsOf(rows)).toEqual({ taskIds: [1, 2], expenseIds: [30] });
  });
});

describe("extras", () => {
  const item = { id: 30, description: "Wax ring", qty: 2, unit_price: 5, amount: 10, purchaseTax: 0.8, purchaseSubtotal: 10 };
  it("bills at cost by default, tax included", () => {
    expect(extraAmounts(item, 0.2)).toEqual({ cost: 10.8, billed: 10.8 });
    expect(buildExtraInvoiceRows([item], 0.2).rows[0]).toMatchObject({
      description: "Additional materials (at cost, incl. sales tax): Wax ring", amount: 10.8, qtyLabel: "2 × $5.40",
    });
  });
  it("marks up per item when asked, by the tenant's markup", () => {
    const marked = { ...item, billMarkup: true };
    expect(extraAmounts(marked, 0.2)).toEqual({ cost: 10.8, billed: 12.96 });
    expect(buildExtraInvoiceRows([marked], 0.2).rows[0]).toMatchObject({
      description: "Additional materials: Wax ring", amount: 12.96, qtyLabel: "2 × $6.48",
    });
    expect(extraAmounts(marked, 0).billed).toBe(10.8);
  });
});

describe("belowMinimum / agreedTotal / pickBillingEntity", () => {
  it("warns only under a set minimum", () => {
    expect(belowMinimum(12000, 150)).toBe(30);
    expect(belowMinimum(15000, 150)).toBeNull();
    expect(belowMinimum(100, 0)).toBeNull();
  });

  it("uses the newest accepted estimate as charged", () => {
    expect(agreedTotal([
      { version: 1, status: "accepted", computed_price: 300, manual_override_price: null },
      { version: 2, status: "accepted", computed_price: 400, manual_override_price: 380 },
      { version: 3, status: "draft", computed_price: 500, manual_override_price: null },
    ])).toEqual({ version: 2, total: 380 });
    expect(agreedTotal([{ version: 1, status: "sent", computed_price: 1, manual_override_price: null }])).toBeNull();
  });

  it("picks the job's entity, else its estimate's, else the default", () => {
    const entities = [
      { id: 1, is_default: true, active: true },
      { id: 2, is_default: false, active: true },
      { id: 3, is_default: false, active: false },
    ];
    expect(pickBillingEntity(2, [1], entities)).toBe(2);
    expect(pickBillingEntity(null, [null, 2], entities)).toBe(2);
    expect(pickBillingEntity(3, [3], entities)).toBe(1);
    expect(pickBillingEntity(null, [], [])).toBeNull();
  });
});
