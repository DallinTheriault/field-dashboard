import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Briefcase, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/permissions/current-role";
import { canViewSettings } from "@/lib/permissions/roles";
import { InvoiceStatusChip } from "../invoice-status";
import { InvoiceActionsBar } from "./invoice-actions-bar";
import { DraftLines, type DraftRow } from "./draft-lines";
import { JobLinesPanel, type AvailableLine } from "./job-lines-panel";
import { SendPanel, type Attachment } from "./send-panel";
import { PaymentsPanel } from "./payments-panel";
import { dayKeyInTz, getTenantTimezone } from "@/lib/dates";
import type { Payment } from "@/lib/invoices/payments";
import { buildExtraInvoiceRows } from "@/lib/estimator/expenses";
import {
  agreedTotal,
  belowMinimum,
  doneUnbilled,
  needingPrice,
  openUnbilled,
  taskRow,
  type DraftTask,
} from "@/lib/invoices/job-draft";
import { receiptFilename, receiptPathsFor } from "@/lib/invoices/receipts";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function fmtDate(d: string | null, tz: string): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", { timeZone: tz,
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
  const tz = await getTenantTimezone();
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
      "*, jobs(id, name, address), billing_entities(name, invoice_prefix), estimates:estimate_id(id), bill_to:contacts!invoices_bill_to_same_tenant(card_link_default)",
    )
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv || !inv.invoice_number) notFound();
  const { data: paymentRows } = await supabase
    .from("payments")
    .select("id, received_on, amount_cents, method, reference")
    .eq("invoice_id", invoiceId)
    .order("received_on")
    .order("id");
  const payments = (paymentRows ?? []) as Payment[];

  const job = inv.jobs as unknown as {
    id: number;
    name: string | null;
    address: string | null;
  } | null;
  const entity = inv.billing_entities as unknown as { name: string } | null;
  const billTo = inv.bill_to as unknown as { card_link_default: boolean } | null;
  const rows = (inv.line_items ?? []) as DraftRow[];
  // Drafts edit in place; anything that went out is frozen.
  const editable = inv.status === "draft" && !inv.stripe_invoice_id;
  const sendable = inv.status === "draft";

  // Job context for drafts: what else the job could bill, what blocks
  // sending, the minimum charge and the price the customer agreed to.
  let available: AvailableLine[] = [];
  let needsPrice: Array<{ id: number; title: string }> = [];
  let shortfall: number | null = null;
  let agreed: { version: number; total: number } | null = null;
  let attachments: Attachment[] = [];
  if (sendable && job) {
    const [{ data: taskRows }, { data: extraRows }, { data: settings }, { data: estimates }, { data: attached }] =
      await Promise.all([
        supabase
          .from("tasks")
          .select("id, title, status, sort_order, qty, unit, unit_price, billable, invoice_id")
          .eq("job_id", job.id),
        supabase
          .from("expenses")
          .select("id, description, qty, unit_price, amount, bill_markup, purchases(tax, subtotal)")
          .eq("job_id", job.id)
          .eq("assignment", "job_extra")
          .is("invoiced_on", null)
          .order("id"),
        supabase.from("pricing_settings").select("minimum_job_charge, material_markup_pct").maybeSingle(),
        supabase
          .from("estimates")
          .select("version, status, computed_price, manual_override_price")
          .eq("job_id", job.id),
        supabase
          .from("expenses")
          .select("id, receipt_path, purchase:purchases(receipt_paths, receipt_path)")
          .eq("invoiced_on", invoiceId)
          .eq("attach_receipt", true)
          .order("id"),
      ]);
    const tasks: DraftTask[] = (taskRows ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      sort_order: t.sort_order,
      qty: Number(t.qty),
      unit: t.unit,
      unit_price: t.unit_price === null ? null : Number(t.unit_price),
      billable: t.billable,
      invoice_id: t.invoice_id,
    }));
    const markup = Number(settings?.material_markup_pct ?? 0);
    const extras = buildExtraInvoiceRows(
      (extraRows ?? []).map((it) => {
        const p = it.purchases as unknown as { tax: number | string | null; subtotal: number | string | null } | null;
        return {
          id: it.id,
          description: it.description,
          qty: it.qty === null ? null : Number(it.qty),
          unit_price: it.unit_price === null ? null : Number(it.unit_price),
          amount: Number(it.amount),
          purchaseTax: p?.tax == null ? null : Number(p.tax),
          purchaseSubtotal: p?.subtotal == null ? null : Number(p.subtotal),
          billMarkup: it.bill_markup,
        };
      }),
      markup,
    ).rows;

    available = [
      ...doneUnbilled(tasks).map((t) => ({ t, done: true })),
      ...openUnbilled(tasks).map((t) => ({ t, done: false })),
    ].map(({ t, done }) => {
      const row = taskRow(t);
      return { kind: "task" as const, id: t.id, title: t.title, detail: row.qtyLabel, amount: row.amount, done };
    });
    available.push(
      ...extras.map((r) => ({
        kind: "extra" as const,
        id: r.extra_expense_id as number,
        title: r.description,
        detail: r.qtyLabel,
        amount: r.amount,
        done: true,
      })),
    );
    needsPrice = needingPrice(tasks, invoiceId).map((t) => ({ id: t.id, title: t.title }));
    shortfall = belowMinimum(Number(inv.total_cents), settings?.minimum_job_charge);
    agreed = agreedTotal(
      (estimates ?? []).map((e) => ({
        version: e.version,
        status: e.status,
        computed_price: e.computed_price === null ? null : Number(e.computed_price),
        manual_override_price: e.manual_override_price === null ? null : Number(e.manual_override_price),
      })),
    );
    attachments = (attached ?? []).flatMap((e) =>
      receiptPathsFor({
        receipt_path: e.receipt_path,
        purchase: e.purchase as unknown as { receipt_paths: string[] | null; receipt_path: string | null } | null,
      }).map((path, i) => ({
        url: `/api/estimator/invoices/${invoiceId}/receipts/${e.id}?i=${i}`,
        filename: receiptFilename(inv.invoice_number, e.id, i, path),
      })),
    );
  }

  const blocked =
    rows.length === 0
      ? "Add at least one line before sending."
      : needsPrice.length > 0
        ? `Still needs a price: ${needsPrice.map((t) => `"${t.title}"`).join(", ")}. Price it on the job or mark it not billable.`
        : null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
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
            {inv.customer_company && <> ({inv.customer_company})</>}
            {entity && <> · {entity.name}</>} · Issued {fmtDate(inv.created_at, tz)}
            {inv.sent_at && <> · Sent {fmtDate(inv.sent_at, tz)}</>}
            {inv.paid_at && <> · Paid {fmtDate(inv.paid_at, tz)}</>}
            {inv.voided_at && <> · Voided {fmtDate(inv.voided_at, tz)}</>}
          </div>
        </div>
        <InvoiceStatusChip status={inv.status} />
      </header>

      <div className="flex flex-wrap gap-3">
        {job && (
          <Link
            href={`/app/jobs/${job.id}`}
            className="inline-flex items-center gap-1.5 text-2xs text-field-500 hover:text-field-400 min-h-[44px]"
          >
            <Briefcase size={12} />
            Open job
          </Link>
        )}
        {inv.estimate_id && (
          <Link
            href={`/app/estimator/${inv.estimate_id}`}
            className="inline-flex items-center gap-1.5 text-2xs text-field-500 hover:text-field-400 min-h-[44px]"
          >
            Open estimate
          </Link>
        )}
        {inv.stripe_hosted_invoice_url && inv.status !== "voided" && (
          <a
            href={inv.stripe_hosted_invoice_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-2xs text-field-500 hover:text-field-400 min-h-[44px]"
          >
            <ExternalLink size={12} />
            Hosted pay page
          </a>
        )}
      </div>

      {(agreed || shortfall !== null) && sendable && (
        <div className="space-y-1.5" data-testid="draft-checks">
          {agreed && (
            <div className="panel px-4 py-2.5 flex items-center gap-3 text-sm">
              <span className="text-bone-300">Agreed (estimate v{agreed.version})</span>
              <span className="num text-bone-100">{usd.format(agreed.total)}</span>
              <span className="text-bone-500">vs this invoice</span>
              <span className={`num ml-auto ${Math.round(agreed.total * 100) === Number(inv.total_cents) ? "text-bone-100" : "text-status-lead"}`}>
                {usd.format(Number(inv.total_cents) / 100)}
              </span>
            </div>
          )}
          {shortfall !== null && (
            <div className="panel px-4 py-2.5 text-sm text-status-lead" data-testid="min-charge">
              {usd.format(shortfall)} under your minimum job charge. It isn&apos;t added
              automatically; add an adjustment line if it should apply.
            </div>
          )}
        </div>
      )}

      <section className="panel">
        {editable ? (
          <DraftLines
            // Remount when the saved lines change (a line added from the job,
            // extras refreshed), so a later Save can't send a stale list.
            key={JSON.stringify(rows.map((r) => [r.description, r.amount, r.task_id, r.extra_expense_id]))}
            invoiceId={inv.id}
            rows={rows}
            taxRatePct={Number(inv.tax_rate_pct ?? 0)}
            dueTerms={inv.due_terms ?? "Due on receipt"}
          />
        ) : (
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
                <td className="py-2.5 text-right num font-semibold text-bone-50" data-testid="draft-total">
                  {usd.format(Number(inv.total_cents) / 100)}
                </td>
              </tr>
            </tbody>
          </table>
          <div className="text-2xs text-bone-400 mt-2">
            Terms: {inv.due_terms ?? "Due on receipt"}
          </div>
        </div>
        )}
      </section>

      {editable && job && (
        <JobLinesPanel invoiceId={inv.id} jobId={job.id} available={available} needsPrice={needsPrice} />
      )}

      {sendable && (
        <SendPanel
          invoiceId={inv.id}
          invoiceNumber={inv.invoice_number}
          entityName={entity?.name ?? ""}
          totalCents={Number(inv.total_cents)}
          customerEmail={inv.customer_email}
          cardLinkDefault={billTo?.card_link_default ?? false}
          hostedUrl={inv.stripe_hosted_invoice_url}
          stripeReady={Boolean(process.env.ESTIMATOR_STRIPE_SECRET_KEY)}
          blocked={blocked}
          attachments={attachments}
        />
      )}

      <PaymentsPanel
        invoiceId={inv.id}
        status={inv.status}
        totalCents={Number(inv.total_cents)}
        payments={payments}
        today={dayKeyInTz(new Date(), tz)}
        canRemove={!inv.stripe_invoice_id}
        stripeIssued={Boolean(inv.stripe_invoice_id)}
        draftBlocked={editable ? blocked : null}
      />

      <InvoiceActionsBar
        invoiceId={inv.id}
        invoiceNumber={inv.invoice_number}
        status={inv.status}
        hasStripe={Boolean(inv.stripe_invoice_id)}
        hostedUrl={inv.stripe_hosted_invoice_url}
        hasPayments={payments.length > 0}
      />
    </div>
  );
}
