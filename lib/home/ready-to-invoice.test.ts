import { describe, expect, it } from "vitest";
import { readyToInvoice, wentOut } from "./ready-to-invoice";

const none = { tasks: [], extras: [], completedJobIds: [], invoices: [] };

describe("readyToInvoice", () => {
  it("adds up a job's unclaimed lines and extras", () => {
    const r = readyToInvoice({
      ...none,
      jobIds: [1],
      tasks: [{ job_id: 1, qty: 2, unit_price: 95 }, { job_id: 1, qty: 1.5, unit_price: "85" }],
      extras: [{ job_id: 1, amount: "24.50" }],
    });
    expect(r).toEqual([
      { jobId: 1, readyCents: 19000 + 12750 + 2450, lineCount: 3, needsPrice: 0, nothingSent: false, draftId: null, draftNumber: null },
    ]);
  });

  it("counts finished lines with no price yet", () => {
    const [j] = readyToInvoice({ ...none, jobIds: [2], tasks: [{ job_id: 2, qty: 1, unit_price: null }, { job_id: 2, qty: 1, unit_price: 50 }] });
    expect(j).toMatchObject({ lineCount: 2, needsPrice: 1, readyCents: 5000 });
  });

  it("lists exactly the jobs it's given, in order, and ignores other jobs' lines", () => {
    const r = readyToInvoice({ ...none, jobIds: [7, 3], tasks: [{ job_id: 99, qty: 1, unit_price: 10 }] });
    expect(r.map((j) => [j.jobId, j.lineCount])).toEqual([[7, 0], [3, 0]]);
  });

  it("says nothing went out only for a completed job with no invoice out", () => {
    const invoices = [
      { id: 10, job_id: 7, status: "sent", stripe_invoice_id: null, invoice_number: "A-1" },
    ];
    const r = readyToInvoice({ ...none, jobIds: [7, 8], completedJobIds: [7, 8], invoices });
    expect(r.map((j) => [j.jobId, j.nothingSent])).toEqual([[7, false], [8, true]]);
  });

  it("counts a void or an unsent draft as not sent, and points at the draft", () => {
    const invoices = [
      { id: 20, job_id: 9, status: "voided", stripe_invoice_id: null, invoice_number: "V-1" },
      { id: 21, job_id: 9, status: "draft", stripe_invoice_id: null, invoice_number: "D-1" },
    ];
    const [j] = readyToInvoice({ ...none, jobIds: [9], completedJobIds: [9], invoices });
    expect(j).toMatchObject({ jobId: 9, nothingSent: true, draftId: 21, draftNumber: "D-1" });
  });

  it("treats a Stripe-issued draft as sent", () => {
    expect(wentOut({ status: "draft", stripe_invoice_id: "in_1" })).toBe(true);
    expect(wentOut({ status: "draft", stripe_invoice_id: null })).toBe(false);
    expect(wentOut({ status: "voided", stripe_invoice_id: "in_1" })).toBe(false);
  });
});
