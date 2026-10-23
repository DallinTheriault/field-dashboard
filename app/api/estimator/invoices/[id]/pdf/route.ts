import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderInvoicePdf } from "@/lib/estimator/pdf/render";
import { getTenantTimezone } from "@/lib/dates";
import { fmtLongDate } from "@/lib/schedule";
import { fmtPhoneDisplay } from "@/lib/sms/phone";
import {
  invoiceParties,
  PARTIES_JOB_SELECT,
  PARTIES_PAYER_SELECT,
  serviceLines,
  toPartiesJob,
  type PartiesContact,
} from "@/lib/invoices/parties";

/**
 * Own-branded invoice PDF (letterhead + license + payment instructions).
 * Bill to is the payer; the service address is where the work was (v104).
 */
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

  const [{ data: inv }, tz] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        `id, invoice_number, status, stripe_invoice_id, job_id, created_at, due_terms, line_items, subtotal_cents, tax_rate_pct, tax_cents, total_cents, bill_to_contact_id, customer_name, customer_company, customer_address, customer_email, customer_phone, service_address, service_resident, work_order_number, job_number, stripe_hosted_invoice_url, jobs(${PARTIES_JOB_SELECT}), bill_to:contacts!invoices_bill_to_same_tenant(${PARTIES_PAYER_SELECT}), billing_entities(name, license_number, address, phone, email, default_footer_text, payment_instructions, logo_path)`,
      )
      .eq("id", invoiceId)
      .maybeSingle(),
    getTenantTimezone(),
  ]);
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

  const payer = (Array.isArray(inv.bill_to) ? inv.bill_to[0] : inv.bill_to) as PartiesContact | null;
  const parties = invoiceParties(inv, payer ?? null, toPartiesJob(inv.jobs));

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
      phone: entity.phone ? fmtPhoneDisplay(entity.phone) : null,
      email: entity.email,
      footerText: entity.default_footer_text,
      paymentInstructions: entity.payment_instructions,
      logoSrc: entity.logo_path,
    },
    client: {
      ...parties.billTo,
      phone: parties.billTo.phone ? fmtPhoneDisplay(parties.billTo.phone) : null,
    },
    service: serviceLines(parties.service),
    jobNumber: parties.jobNumber,
    rows,
    subtotal: Number(inv.subtotal_cents) / 100,
    taxRatePct: Number(inv.tax_rate_pct ?? 0),
    taxAmount: Number(inv.tax_cents) / 100,
    total: Number(inv.total_cents) / 100,
    invoiceNumber: inv.invoice_number,
    issueDate: fmtLongDate(inv.created_at, tz),
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
