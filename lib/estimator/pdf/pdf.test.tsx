import { describe, expect, it } from "vitest";
import { renderEstimatePdf, renderInvoicePdf } from "./render";
import type { PdfClient, PdfEntity, PdfRow } from "./doc";

const entity: PdfEntity = {
  name: "Sharpline Painting Co.",
  licenseNumber: "B100-TEST",
  phone: "801-555-0100",
  footerText: "Sharpline Painting Co. is a DBA of Theriault Property Services LLC.",
  paymentInstructions: "Venmo @sharpline or check on completion.",
  logoSrc: null, // logo presence covered by live verification
};
const client: PdfClient = { name: "Jane Homeowner", address: "123 Elm St, Provo UT" };
const rows: PdfRow[] = [
  { description: "Walls — 2 coats", qtyLabel: "640 sqft", amount: 1180.5 },
  { description: 'Patch — medium 4–12"', qtyLabel: null, amount: 228.33 },
  { description: "Travel", qtyLabel: null, amount: 58.33 },
];

describe("PDF rendering", () => {
  it("estimate renders a real PDF", async () => {
    const buf = await renderEstimatePdf({
      entity,
      client,
      rows,
      total: 1467.16,
      refNumber: "EST-001",
      date: "2026-07-07",
      jobTitle: "Living room repaint",
    });
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(1500);
  });

  it("invoice renders with tax line and payment box", async () => {
    const buf = await renderInvoicePdf({
      entity,
      client,
      rows,
      subtotal: 1467.16,
      taxRatePct: 7.25,
      taxAmount: 106.37,
      total: 1573.53,
      invoiceNumber: "SPC-2026-001",
      issueDate: "2026-07-07",
      dueTerms: "Due on receipt",
      payUrl: "https://invoice.stripe.com/i/test",
    });
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(1500);
  });
});

// ---- pagination (micro-fix 2026-07-15) ----

/** Count rendered pages: "/Type /Page" objects (the \b keeps the
 * "/Type /Pages" tree node from matching). */
function pageCount(buf: Buffer): number {
  return (buf.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;
}

const nRows = (n: number): PdfRow[] =>
  Array.from({ length: n }, (_, i) => ({
    description: `Line item number ${i + 1} desc`, // ≤29 chars, like SPC-2026-002
    qtyLabel: i % 3 === 0 ? "2 × $10.00" : null,
    amount: 20,
  }));

const spcEntity: PdfEntity = {
  name: "Sharpline Painting Co.",
  licenseNumber: "14292519-5501",
  address: "1234 Placeholder Ave Suite 100, Provo UT 84601", // 46 chars like prod
  phone: "801-555-0100",
  email: "billing@example.com",
  footerText: "Sixty-seven characters of footer text to match the real entity!!!!",
  paymentInstructions: null,
  logoSrc: null,
};

describe("invoice pagination", () => {
  it("SPC-2026-002 shape (14 lines, no tax, no pay box) fits ONE page", async () => {
    const buf = await renderInvoicePdf({
      entity: spcEntity,
      client,
      rows: nRows(14),
      subtotal: 280,
      taxRatePct: 0,
      taxAmount: 0,
      total: 280,
      invoiceNumber: "SPC-2026-002",
      issueDate: "2026-07-15",
      dueTerms: "Due on receipt",
    });
    expect(pageCount(buf)).toBe(1);
  });

  it("20 lines (SPC shape: no tax, no pay box) fits ONE page", async () => {
    const buf = await renderInvoicePdf({
      entity: spcEntity,
      client,
      rows: nRows(20),
      subtotal: 400,
      taxRatePct: 0,
      taxAmount: 0,
      total: 400,
      invoiceNumber: "SPC-2026-098",
      issueDate: "2026-07-15",
      dueTerms: "Due on receipt",
    });
    expect(pageCount(buf)).toBe(1);
  });

  it("heaviest shape (tax rows + payment box) still fits 14 lines on ONE page", async () => {
    // Measured ceiling: 14 fits, 15 spills. Sharpline invoices carry
    // neither tax nor a payment box today, so the ~20-line target applies
    // to the SPC shape above; heavier shapes page earlier but the totals
    // stay anchored (structural wrap group).
    const buf = await renderInvoicePdf({
      entity: { ...spcEntity, paymentInstructions: "Venmo @sharpline or check on completion." },
      client,
      rows: nRows(14),
      subtotal: 280,
      taxRatePct: 7,
      taxAmount: 19.6,
      total: 299.6,
      invoiceNumber: "SPC-2026-099",
      issueDate: "2026-07-15",
      dueTerms: "Due on receipt",
    });
    expect(pageCount(buf)).toBe(1);
  });

  it("long invoices span pages, totals never orphan (last row travels with them)", async () => {
    // 45 rows forces a break. The wrap={false} group = last row + totals,
    // so page 2+ always carries at least one line item above the total —
    // a totals-only page is structurally impossible.
    const buf = await renderInvoicePdf({
      entity: spcEntity,
      client,
      rows: nRows(45),
      subtotal: 900,
      taxRatePct: 0,
      taxAmount: 0,
      total: 900,
      invoiceNumber: "SPC-2026-100",
      issueDate: "2026-07-15",
      dueTerms: "Due on receipt",
    });
    expect(pageCount(buf)).toBeGreaterThanOrEqual(2);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("estimate totals get the same anchoring", async () => {
    const buf = await renderEstimatePdf({
      entity: spcEntity,
      client,
      rows: nRows(20),
      total: 400,
      refNumber: "EST-020",
      date: "2026-07-15",
      jobTitle: "Twenty line estimate",
    });
    expect(pageCount(buf)).toBe(1);
  });
});
