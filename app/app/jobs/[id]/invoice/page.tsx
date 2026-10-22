import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/permissions/current-role";
import { canViewSettings } from "@/lib/permissions/roles";
import { getTenantFeatureFlags } from "@/lib/features/flags";
import { buildExtraInvoiceRows } from "@/lib/estimator/expenses";
import {
  needingPrice,
  openUnbilled,
  pickBillingEntity,
  readyToBill,
  taskRow,
  type DraftTask,
} from "@/lib/invoices/job-draft";
import { InvoiceBuilder, type BuilderPart } from "./create-invoice-form";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/**
 * Create an invoice from the job: what it bills (work lines, logged hours,
 * receipt lines), itemized or as the minimum charge, plus the letterhead (it
 * sets the invoice number's prefix, so it's chosen here, not on the draft),
 * tax and terms. Review and edits happen on the draft.
 */
export default async function NewJobInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const [session, flags] = await Promise.all([getCurrentUserRole(), getTenantFeatureFlags()]);
  if (!session) redirect("/login");
  if (!canViewSettings(session.role) || !flags.estimator) redirect("/app");

  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isInteger(jobId)) notFound();

  const supabase = await createClient();
  const [
    { data: job },
    { data: taskRows },
    { data: partRows },
    { data: hourRows },
    { data: entities },
    { data: estimates },
    { data: settings },
    { data: drafts },
  ] = await Promise.all([
    supabase.from("jobs").select("id, name, job_number, status, billing_entity_id").eq("id", jobId).maybeSingle(),
    supabase.from("tasks").select("id, title, status, sort_order, qty, unit, unit_price, billable, invoice_id").eq("job_id", jobId),
    supabase
      .from("expenses")
      .select("id, description, qty, unit_price, amount, bill_markup, assignment, purchases(tax, subtotal)")
      .eq("job_id", jobId)
      .in("assignment", ["job_extra", "job_in_bid"])
      .is("invoiced_on", null)
      .order("id"),
    supabase
      .from("time_entries")
      .select("id, hours, entry_date")
      .eq("job_id", jobId)
      .is("invoice_id", null)
      .is("covered_at", null)
      .order("entry_date")
      .order("id"),
    supabase.from("billing_entities").select("id, name, invoice_prefix, is_default, active").order("created_at"),
    supabase.from("estimates").select("billing_entity_id").eq("job_id", jobId).order("version", { ascending: false }),
    supabase
      .from("pricing_settings")
      .select("material_markup_pct, default_hourly_rate, skilled_hourly_rate, minimum_job_charge")
      .maybeSingle(),
    supabase
      .from("invoices")
      .select("id, invoice_number, total_cents")
      .eq("job_id", jobId)
      .eq("status", "draft")
      .is("stripe_invoice_id", null)
      .order("id"),
  ]);
  if (!job) notFound();

  const completed = job.status === "completed";
  const tasks: DraftTask[] = (taskRows ?? []).map((t) => ({
    ...t,
    qty: Number(t.qty),
    unit_price: t.unit_price === null ? null : Number(t.unit_price),
  }));
  const work = readyToBill(tasks, completed);
  const open = openUnbilled(tasks, completed);
  const unpriced = needingPrice(tasks, null);
  const markup = Number(settings?.material_markup_pct ?? 0);
  // Each receipt line priced as it would bill to the customer (at cost, with
  // its share of the receipt's tax, or marked up when the line says so).
  const parts: BuilderPart[] = (partRows ?? []).map((it) => {
    const p = it.purchases as unknown as { tax: number | string | null; subtotal: number | string | null } | null;
    const item = {
      id: it.id,
      description: it.description,
      qty: it.qty === null ? null : Number(it.qty),
      unit_price: it.unit_price === null ? null : Number(it.unit_price),
      amount: Number(it.amount),
      purchaseTax: p?.tax == null ? null : Number(p.tax),
      purchaseSubtotal: p?.subtotal == null ? null : Number(p.subtotal),
      billMarkup: it.bill_markup,
    };
    return {
      id: it.id,
      description: it.description,
      qty: item.qty,
      billToCustomer: it.assignment === "job_extra",
      row: buildExtraInvoiceRows([item], markup).rows[0],
    };
  });
  const rate = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const active = (entities ?? []).filter((e) => e.active);
  const defaultEntity = pickBillingEntity(
    job.billing_entity_id,
    (estimates ?? []).map((e) => e.billing_entity_id),
    active,
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <Link href={`/app/jobs/${jobId}`} className="inline-flex items-center gap-1.5 text-2xs text-bone-400 hover:text-bone-100 min-h-[44px]">
        <ArrowLeft size={12} />
        Back to job
      </Link>
      <h1 className="text-xl font-semibold text-bone-50">Invoice {job.name ?? job.job_number ?? `job ${jobId}`}</h1>

      {(drafts ?? []).length > 0 && (
        <div className="panel px-4 py-3 text-sm space-y-1" data-testid="existing-drafts">
          <div className="text-status-lead">This job already has an unsent draft:</div>
          {(drafts ?? []).map((d) => (
            <Link key={d.id} href={`/app/estimator/invoices/${d.id}`} className="block text-field-500 underline min-h-[44px] leading-[44px]">
              {d.invoice_number} · {usd.format(Number(d.total_cents) / 100)}
            </Link>
          ))}
          <div className="text-2xs text-bone-400">A new draft only takes what isn&apos;t on it.</div>
        </div>
      )}

      {(open.length > 0 || unpriced.length > 0) && (
        <div className="panel px-4 py-3 space-y-1 text-2xs">
          {open.length > 0 && (
            <p className="text-bone-400">
              {open.length} work line{open.length === 1 ? " isn't" : "s aren't"} done yet; the draft lists{" "}
              {open.length === 1 ? "it" : "them"} to add on purpose.
            </p>
          )}
          {unpriced.length > 0 && (
            <p className="text-status-lead">
              Needs a price before the invoice can be sent: {unpriced.map((t) => t.title).join(", ")}.
            </p>
          )}
        </div>
      )}

      <InvoiceBuilder
        jobId={jobId}
        work={work.map(taskRow)}
        hours={(hourRows ?? []).map((h) => ({ id: Number(h.id), hours: Number(h.hours), date: String(h.entry_date) }))}
        parts={parts}
        rates={{ general: rate(settings?.default_hourly_rate), skilled: rate(settings?.skilled_hourly_rate) }}
        minimum={Number(settings?.minimum_job_charge ?? 0)}
        entities={active.map((e) => ({ id: e.id, label: `${e.name} (${e.invoice_prefix})` }))}
        defaultEntityId={defaultEntity}
      />
    </div>
  );
}
