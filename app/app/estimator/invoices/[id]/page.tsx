import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Briefcase, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/permissions/current-role";
import { canViewSettings } from "@/lib/permissions/roles";
import { InvoiceStatusChip } from "../invoice-status";
import { InvoiceActionsBar } from "./invoice-actions-bar";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentUserRole();
  if (!session) redirect("/login");
  if (!canViewSettings(session.role)) redirect("/app");

  const { id } = await params;
  const invoiceId = Number(id);
  if (!Number.isInteger(invoiceId)) notFound();

  const supabase = await createClient();
  const { data: inv } = await supabase
    .from("invoices")
    .select(
      "*, jobs(id, name, address), billing_entities(name, invoice_prefix), estimates:estimate_id(id)",
    )
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv || !inv.invoice_number) notFound();

  const job = inv.jobs as unknown as {
    id: number;
    name: string | null;
    address: string | null;
  } | null;
  const entity = inv.billing_entities as unknown as { name: string } | null;
  const rows = (inv.line_items ?? []) as Array<{
    description: string;
    qtyLabel: string | null;
    amount: number;
  }>;

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <Link
        href="/app/estimator/invoices"
        className="inline-flex items-center gap-1.5 text-2xs text-bone-400 hover:text-bone-100"
      >
        <ArrowLeft size={12} />
        Invoices
      </Link>

      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-bone-50 font-mono">
            {inv.invoice_number}
          </h1>
          <div className="text-2xs text-bone-400 mt-1">
            {inv.customer_name}
            {entity && <> · {entity.name}</>} · Issued {fmtDate(inv.created_at)}
            {inv.paid_at && <> · Paid {fmtDate(inv.paid_at)}</>}
          </div>
        </div>
        <InvoiceStatusChip status={inv.status} />
      </header>

      <div className="flex flex-wrap gap-3">
        {job && (
          <Link
            href={`/app/jobs/${job.id}`}
            className="inline-flex items-center gap-1.5 text-2xs text-field-500 hover:text-field-400"
          >
            <Briefcase size={12} />
            Open job
          </Link>
        )}
        {inv.estimate_id && (
          <Link
            href={`/app/estimator/${inv.estimate_id}`}
            className="inline-flex items-center gap-1.5 text-2xs text-field-500 hover:text-field-400"
          >
            Open estimate
          </Link>
        )}
        {inv.stripe_hosted_invoice_url && (
          <a
            href={inv.stripe_hosted_invoice_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-2xs text-field-500 hover:text-field-400"
          >
            <ExternalLink size={12} />
            Hosted pay page
          </a>
        )}
      </div>

      <section className="panel">
        <div className="px-4 py-3">
          <table className="w-full text-sm">
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-line-subtle last:border-0">
                  <td className="py-2 text-bone-100">
                    {r.description}
                    {r.qtyLabel && (
                      <span className="text-2xs text-bone-400"> {r.qtyLabel}</span>
                    )}
                  </td>
                  <td className="py-2 text-right num text-bone-100">
                    {usd.format(Number(r.amount))}
                  </td>
                </tr>
              ))}
              {Number(inv.tax_cents) > 0 && (
                <>
                  <tr>
                    <td className="py-2 text-bone-300">Subtotal</td>
                    <td className="py-2 text-right num text-bone-300">
                      {usd.format(Number(inv.subtotal_cents) / 100)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 text-bone-300">
                      Tax ({Number(inv.tax_rate_pct)}%)
                    </td>
                    <td className="py-2 text-right num text-bone-300">
                      {usd.format(Number(inv.tax_cents) / 100)}
                    </td>
                  </tr>
                </>
              )}
              <tr>
                <td className="py-2.5 font-semibold text-bone-50">Total due</td>
                <td className="py-2.5 text-right num font-semibold text-bone-50">
                  {usd.format(Number(inv.total_cents) / 100)}
                </td>
              </tr>
            </tbody>
          </table>
          <div className="text-2xs text-bone-400 mt-2">
            Terms: {inv.due_terms ?? "Due on receipt"}
          </div>
        </div>
      </section>

      <InvoiceActionsBar
        invoiceId={inv.id}
        status={inv.status}
        hasStripe={Boolean(inv.stripe_invoice_id)}
        hostedUrl={inv.stripe_hosted_invoice_url}
      />
    </main>
  );
}
