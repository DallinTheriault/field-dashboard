import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/permissions/current-role";
import { canViewSettings } from "@/lib/permissions/roles";
import { getTenantFeatureFlags } from "@/lib/features/flags";
import { buildExtraInvoiceRows } from "@/lib/estimator/expenses";
import {
  doneUnbilled,
  needingPrice,
  openUnbilled,
  pickBillingEntity,
  taskRow,
  type DraftTask,
} from "@/lib/invoices/job-draft";
import { CreateInvoiceForm } from "./create-invoice-form";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/**
 * Create an invoice from the job: pick the letterhead (it sets the invoice
 * number's prefix, so it's chosen here, not on the draft), tax and terms, and
 * see what the draft will take. Review and edits happen on the draft.
 */
export default async function NewJobInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const [session, flags] = await Promise.all([getCurrentUserRole(), getTenantFeatureFlags()]);
  if (!session) redirect("/login");
  if (!canViewSettings(session.role) || !flags.estimator) redirect("/app");

  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isInteger(jobId)) notFound();

  const supabase = await createClient();
  const [{ data: job }, { data: taskRows }, { data: extraRows }, { data: entities }, { data: estimates }, { data: settings }, { data: drafts }] =
    await Promise.all([
      supabase.from("jobs").select("id, name, job_number, billing_entity_id").eq("id", jobId).maybeSingle(),
      supabase.from("tasks").select("id, title, status, sort_order, qty, unit, unit_price, billable, invoice_id").eq("job_id", jobId),
      supabase
        .from("expenses")
        .select("id, description, qty, unit_price, amount, bill_markup, purchases(tax, subtotal)")
        .eq("job_id", jobId)
        .eq("assignment", "job_extra")
        .is("invoiced_on", null)
        .order("id"),
      supabase.from("billing_entities").select("id, name, invoice_prefix, is_default, active").order("created_at"),
      supabase.from("estimates").select("billing_entity_id").eq("job_id", jobId).order("version", { ascending: false }),
      supabase.from("pricing_settings").select("material_markup_pct").maybeSingle(),
      supabase
        .from("invoices")
        .select("id, invoice_number, total_cents")
        .eq("job_id", jobId)
        .eq("status", "draft")
        .is("stripe_invoice_id", null)
        .order("id"),
    ]);
  if (!job) notFound();

  const tasks: DraftTask[] = (taskRows ?? []).map((t) => ({
    ...t,
    qty: Number(t.qty),
    unit_price: t.unit_price === null ? null : Number(t.unit_price),
  }));
  const lines = doneUnbilled(tasks).map(taskRow);
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
    Number(settings?.material_markup_pct ?? 0),
  ).rows;
  const preview = [...lines, ...extras];
  const open = openUnbilled(tasks);
  const unpriced = needingPrice(tasks, null);
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
          <div className="text-2xs text-bone-400">A new draft only takes lines that aren&apos;t on it.</div>
        </div>
      )}

      <section className="panel px-4 py-3 space-y-2" data-testid="invoice-preview">
        <div className="label-eyebrow">The draft will take</div>
        {preview.length === 0 ? (
          <p className="text-2xs text-bone-400">
            Nothing finished to bill yet. You can still make the draft and add open lines to it on purpose.
          </p>
        ) : (
          <ul className="text-sm space-y-1">
            {preview.map((r, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex-1 min-w-0 text-bone-100 break-words">
                  {r.description}
                  {r.qtyLabel && <span className="text-2xs text-bone-400"> {r.qtyLabel}</span>}
                </span>
                <span className="num text-bone-300">{usd.format(r.amount)}</span>
              </li>
            ))}
          </ul>
        )}
        {open.length > 0 && (
          <p className="text-2xs text-bone-400">
            {open.length} line{open.length === 1 ? " isn't" : "s aren't"} done yet; the draft lists {open.length === 1 ? "it" : "them"} to add on purpose.
          </p>
        )}
        {unpriced.length > 0 && (
          <p className="text-2xs text-status-lead">
            Needs a price before the invoice can be sent: {unpriced.map((t) => t.title).join(", ")}.
          </p>
        )}
      </section>

      <CreateInvoiceForm
        jobId={jobId}
        entities={active.map((e) => ({ id: e.id, label: `${e.name} (${e.invoice_prefix})` }))}
        defaultEntityId={defaultEntity}
      />
    </div>
  );
}
