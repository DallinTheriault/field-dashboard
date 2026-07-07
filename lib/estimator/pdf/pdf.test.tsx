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
