import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderInvoicePdf } from "@/lib/estimator/pdf/render";

/** Own-branded invoice PDF (letterhead + license + payment instructions). */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const invoiceId = Number(id);
  if (!Number.isInteger(invoiceId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  const { data: inv } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, created_at, due_terms, line_items, subtotal_cents, tax_rate_pct, tax_cents, total_cents, customer_name, customer_email, customer_phone, stripe_hosted_invoice_url, jobs(address), billing_entities(name, license_number, address, phone, email, default_footer_text, payment_instructions, logo_path)",
    )
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const entity = inv.billing_entities as unknown as {
    name: string;
    license_number: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    default_footer_text: string | null;
    payment_instructions: string | null;
    logo_path: string | null;
  } | null;
  const job = inv.jobs as unknown as { address: string | null } | null;
  if (!entity) {
    return NextResponse.json(
      { error: "Invoice has no billing entity." },
      { status: 422 },
    );
  }
  if (!inv.invoice_number) {
    return NextResponse.json(
      { error: "Not an estimator invoice (no invoice number)." },
      { status: 422 },
    );
  }

  const rows = ((inv.line_items ?? []) as Array<{
    description: string;
    qtyLabel: string | null;
    amount: number;
  }>).map((r) => ({
    description: r.description,
    qtyLabel: r.qtyLabel ?? null,
    amount: Number(r.amount),
  }));

  const pdf = await renderInvoicePdf({
    entity: {
      name: entity.name,
      licenseNumber: entity.license_number,
      address: entity.address,
      phone: entity.phone,
      email: entity.email,
      footerText: entity.default_footer_text,
      paymentInstructions: entity.payment_instructions,
      logoSrc: entity.logo_path,
    },
    client: {
      name: inv.customer_name,
      address: job?.address,
      phone: inv.customer_phone,
      email: inv.customer_email,
    },
    rows,
    subtotal: Number(inv.subtotal_cents) / 100,
    taxRatePct: Number(inv.tax_rate_pct ?? 0),
    taxAmount: Number(inv.tax_cents) / 100,
    total: Number(inv.total_cents) / 100,
    invoiceNumber: inv.invoice_number,
    issueDate: inv.created_at.slice(0, 10),
    dueTerms: inv.due_terms ?? "Due on receipt",
    payUrl: inv.stripe_hosted_invoice_url,
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${inv.invoice_number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
