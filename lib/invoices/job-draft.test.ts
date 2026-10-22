import { describe, expect, it } from "vitest";
import { buildExtraInvoiceRows, extraAmounts } from "@/lib/estimator/expenses";
import {
  agreedTotal,
  applyMinimum,
  belowMinimum,
  claimsOf,
  doneUnbilled,
  hoursLabel,
  invoiceTotals,
  laborRow,
  minimumRows,
  needingPrice,
  openUnbilled,
  pickBillingEntity,
  readyToBill,
  subtotalOf,
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
    expect(claimsOf(rows)).toEqual({ taskIds: [1, 2], expenseIds: [30], hourIds: [] });
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

describe("hourly and minimum invoices", () => {
  it("a completed job bills its unfinished lines too; an open job lists them to add on purpose", () => {
    const tasks = [t({ id: 1, status: "done" }), t({ id: 2, status: "open" }), t({ id: 3, status: "open", invoice_id: 9 })];
    expect(readyToBill(tasks, false).map((x) => x.id)).toEqual([1]);
    expect(readyToBill(tasks, true).map((x) => x.id)).toEqual([1, 2]);
    expect(openUnbilled(tasks, true)).toEqual([]);
    expect(openUnbilled(tasks, false).map((x) => x.id)).toEqual([2]);
  });

  it("logged hours are one labor line at the general or skilled rate, listing the hours it bills", () => {
    const entries = [{ id: 7, hours: 0.3 }, { id: 5, hours: 0.2 }];
    expect(laborRow(entries, 110, false)).toEqual({
      description: "Labor",
      qtyLabel: "0.5 hr × $110.00/hr",
      amount: 55,
      time_entry_ids: [5, 7],
      rate: 110,
      kind: "labor",
    });
    expect(laborRow(entries, 125, true)).toMatchObject({ description: "Skilled labor", amount: 62.5 });
    expect(laborRow([], 110, false)).toBeNull();
    expect(laborRow(entries, 0, false)).toBeNull();
    expect(hoursLabel(1.25)).toBe("1.25");
    expect(hoursLabel(2)).toBe("2");
  });

  it("a minimum invoice lists every work line and part at $0.00, then the minimum, which covers the hours", () => {
    const rows = minimumRows({
      work: [t({ id: 4, title: "Replaced toilet fill valve", unit_price: 0 })],
      billToCustomer: [{ id: 30, description: "Supply line", qty: 2 }],
      included: [{ id: 318, description: "Toilet repair kit", qty: 1 }],
      hourIds: [48],
      minimum: 150,
    });
    expect(rows).toEqual([
      { description: "Replaced toilet fill valve", qtyLabel: null, amount: 0, task_id: 4, covered: true },
      { description: "Supply line", qtyLabel: "× 2", amount: 0, covered: true, extra_expense_id: 30 },
      { description: "Toilet repair kit", qtyLabel: null, amount: 0, covered: true },
      { description: "Minimum trip charge", qtyLabel: null, amount: 150, time_entry_ids: [48], kind: "minimum" },
    ]);
    expect(subtotalOf(rows)).toBe(150);
    expect(claimsOf(rows)).toEqual({ taskIds: [4], expenseIds: [30], hourIds: [48] });
  });

  it("Add minimum trip charge: the other lines go to $0.00 and keep their claims; never two minimum lines", () => {
    const labor = laborRow([{ id: 48, hours: 0.5 }], 110, false)!;
    const draft = [
      taskRow(t({ id: 4, title: "Paint door", qty: 3, unit_price: 20 })),
      labor,
      { description: "Additional materials (at cost, incl. sales tax): Caulk", qtyLabel: "2 × $5.00", amount: 10, extra_expense_id: 9 },
      { description: "Senior discount", qtyLabel: null, amount: -5 },
    ];
    const once = applyMinimum(draft, 150);
    expect(once.map((r) => [r.description, r.qtyLabel, r.amount])).toEqual([
      ["Paint door", "× 3", 0],
      ["Labor", "0.5 hr", 0],
      ["Caulk", "× 2", 0],
      ["Senior discount", null, 0],
      ["Minimum trip charge", null, 150],
    ]);
    expect(claimsOf(once)).toEqual({ taskIds: [4], expenseIds: [9], hourIds: [48] });
    expect(once[1].covered).toBe(true);
    const twice = applyMinimum(once, 175);
    expect(twice.filter((r) => r.kind === "minimum")).toHaveLength(1);
    expect(subtotalOf(twice)).toBe(175);
  });

  it("the minimum test is before tax", () => {
    expect(belowMinimum(14000, 150)).toBe(10);
    expect(belowMinimum(invoiceTotals([{ amount: 140 }], 8).subtotalCents, 150)).toBe(10);
  });
});
