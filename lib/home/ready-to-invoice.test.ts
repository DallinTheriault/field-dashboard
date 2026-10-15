import { describe, expect, it } from "vitest";
import { readyToInvoice, wentOut } from "./ready-to-invoice";

describe("readyToInvoice", () => {
  it("adds up a job's unclaimed lines and extras", () => {
    const r = readyToInvoice({
      tasks: [{ job_id: 1, qty: 2, unit_price: 95 }, { job_id: 1, qty: 1.5, unit_price: "85" }],
      extras: [{ job_id: 1, amount: "24.50" }],
      completedJobIds: [],
      invoices: [],
    });
    expect(r).toEqual([{ jobId: 1, readyCents: 19000 + 12750 + 2450, lineCount: 3, nothingSent: false, draftId: null, draftNumber: null }]);
  });

  it("includes a completed job with nothing sent, even without lines", () => {
    const r = readyToInvoice({ tasks: [], extras: [], completedJobIds: [7], invoices: [] });
    expect(r.map((j) => [j.jobId, j.nothingSent, j.readyCents])).toEqual([[7, true, 0]]);
  });

  it("leaves out a completed job whose invoice went out, unless lines are still unbilled", () => {
    const invoices = [
      { id: 10, job_id: 7, status: "sent", stripe_invoice_id: null, invoice_number: "A-1" },
      { id: 11, job_id: 8, status: "paid", stripe_invoice_id: null, invoice_number: "A-2" },
    ];
    const r = readyToInvoice({ tasks: [{ job_id: 8, qty: 1, unit_price: 40 }], extras: [], completedJobIds: [7, 8], invoices });
    expect(r.map((j) => j.jobId)).toEqual([8]);
  });

  it("counts a void or an unsent draft as not sent, and points at the draft", () => {
    const invoices = [
      { id: 20, job_id: 9, status: "voided", stripe_invoice_id: null, invoice_number: "V-1" },
      { id: 21, job_id: 9, status: "draft", stripe_invoice_id: null, invoice_number: "D-1" },
    ];
    const [j] = readyToInvoice({ tasks: [], extras: [], completedJobIds: [9], invoices });
    expect(j).toMatchObject({ jobId: 9, nothingSent: true, draftId: 21, draftNumber: "D-1" });
  });

  it("treats a Stripe-issued draft as sent", () => {
    expect(wentOut({ status: "draft", stripe_invoice_id: "in_1" })).toBe(true);
    expect(wentOut({ status: "draft", stripe_invoice_id: null })).toBe(false);
    expect(wentOut({ status: "voided", stripe_invoice_id: "in_1" })).toBe(false);
  });
});
