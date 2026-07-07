"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWriter } from "@/lib/estimator/auth";
import { buildClientDocRows } from "@/lib/estimator/client-rows";
import { getEstimatorStripe, STRIPE_NOT_CONFIGURED } from "@/lib/estimator/stripe";

type Result<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/**
 * Create a customer invoice from an estimate's frozen snapshot. The invoice
 * freezes its own copy of the client rows (line_items JSON) — later estimate
 * edits never change an issued invoice. Numbering (PREFIX-YYYY-NNN) happens
 * transactionally in the estimator_create_invoice RPC.
 */
export async function createInvoiceFromEstimate(
  estimateId: number,
  opts: { taxRatePct?: number; dueTerms?: string } = {},
): Promise<Result<{ invoiceId: number; invoiceNumber: string }>> {
  const auth = await requireWriter();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, clientId } = auth;

  const taxRatePct = Number(opts.taxRatePct ?? 0);
  if (!Number.isFinite(taxRatePct) || taxRatePct < 0 || taxRatePct > 30) {
    return { ok: false, error: "Tax rate must be between 0 and 30%." };
  }

  const [{ data: est }, { data: lines }] = await Promise.all([
    supabase
      .from("estimates")
      .select(
        "id, job_id, status, billing_entity_id, computed_price, manual_override_price, resolved_travel_fee, jobs(name, email, phone, address), travel_zones(label)",
      )
      .eq("id", estimateId)
      .maybeSingle(),
    supabase
      .from("estimate_line_items")
      .select("description, qty, unit, resolved_client_amount")
      .eq("estimate_id", estimateId)
      .order("sort_order"),
  ]);
  if (!est) return { ok: false, error: "Estimate not found." };
  if (est.status === "lost") {
    return { ok: false, error: "This estimate is marked lost." };
  }
  if (!est.billing_entity_id) {
    return {
      ok: false,
      error: "The estimate has no billing entity — edit it and pick one first.",
    };
  }

  const job = est.jobs as unknown as {
    name: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
  } | null;
  const zone = est.travel_zones as unknown as { label: string } | null;

  const { rows, total } = buildClientDocRows({
    lines: (lines ?? []).map((l) => ({
      description: l.description,
      qty: Number(l.qty),
      unit: l.unit,
      resolved_client_amount: Number(l.resolved_client_amount),
    })),
    travelFee: Number(est.resolved_travel_fee ?? 0),
    zoneLabel: zone?.label ?? null,
    computedPrice: Number(est.computed_price ?? 0),
    overridePrice:
      est.manual_override_price === null
        ? null
        : Number(est.manual_override_price),
  });

  const subtotalCents = Math.round(total * 100);
  const taxCents = Math.round((subtotalCents * taxRatePct) / 100);

  const { data, error } = await supabase.rpc("estimator_create_invoice", {
    p: {
      client_id: clientId,
      job_id: est.job_id,
      estimate_id: est.id,
      billing_entity_id: est.billing_entity_id,
      customer_name: job?.name ?? "Customer",
      customer_email: job?.email,
      customer_phone: job?.phone,
      line_items: rows,
      subtotal_cents: subtotalCents,
      tax_rate_pct: taxRatePct,
      tax_cents: taxCents,
      total_cents: subtotalCents + taxCents,
      due_terms: (opts.dueTerms ?? "").trim() || "Due on receipt",
    },
  });
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Invoice creation failed." };
  }

  revalidatePath("/app/estimator");
  revalidatePath(`/app/estimator/${estimateId}`);
  return {
    ok: true,
    data: {
      invoiceId: Number((data as { invoice_id: number }).invoice_id),
      invoiceNumber: (data as { invoice_number: string }).invoice_number,
    },
  };
}

/**
 * Send via Stripe Hosted Invoice: real Stripe Customer + Invoice + Items,
 * finalized so Stripe hosts the pay page and emails receipts. Client rows
 * only — internals never reach Stripe.
 */
export async function sendInvoiceWithStripe(
  invoiceId: number,
): Promise<Result<{ hostedUrl: string }>> {
  const auth = await requireWriter();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const stripe = getEstimatorStripe();
  if (!stripe) return { ok: false, error: STRIPE_NOT_CONFIGURED };

  const { data: inv } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, status, customer_name, customer_email, customer_phone, line_items, tax_rate_pct, tax_cents, total_cents, due_terms, stripe_invoice_id, billing_entities(name)",
    )
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv) return { ok: false, error: "Invoice not found." };
  if (inv.stripe_invoice_id) {
    return { ok: false, error: "Already sent with Stripe." };
  }
  if (inv.status === "paid") return { ok: false, error: "Already paid." };

  const entity = inv.billing_entities as unknown as { name: string } | null;
  const rows = (inv.line_items ?? []) as Array<{
    description: string;
    qtyLabel: string | null;
    amount: number;
  }>;
  if (rows.length === 0) return { ok: false, error: "Invoice has no lines." };

  try {
    const customer = await stripe.customers.create({
      name: inv.customer_name,
      email: inv.customer_email ?? undefined,
      phone: inv.customer_phone ?? undefined,
      metadata: { field_invoice: inv.invoice_number ?? String(inv.id) },
    });

    const stripeInvoice = await stripe.invoices.create({
      customer: customer.id,
      collection_method: "send_invoice",
      days_until_due: 7,
      currency: "usd",
      description: `${entity?.name ?? ""} — ${inv.invoice_number}`.trim(),
      footer: inv.due_terms ?? undefined,
      metadata: {
        field_invoice_id: String(inv.id),
        field_invoice_number: inv.invoice_number ?? "",
      },
      auto_advance: false,
    });

    for (const row of rows) {
      await stripe.invoiceItems.create({
        customer: customer.id,
        invoice: stripeInvoice.id,
        amount: Math.round(row.amount * 100),
        currency: "usd",
        description: row.qtyLabel
          ? `${row.description} (${row.qtyLabel})`
          : row.description,
      });
    }
    if (Number(inv.tax_cents) > 0) {
      await stripe.invoiceItems.create({
        customer: customer.id,
        invoice: stripeInvoice.id,
        amount: Number(inv.tax_cents),
        currency: "usd",
        description: `Tax (${Number(inv.tax_rate_pct)}%)`,
      });
    }

    const finalized = await stripe.invoices.finalizeInvoice(stripeInvoice.id!);
    // Email it when we can; the hosted URL works either way (text it).
    if (inv.customer_email) {
      await stripe.invoices.sendInvoice(finalized.id!);
    }

    const hostedUrl = finalized.hosted_invoice_url ?? "";
    const { error: updateErr } = await supabase
      .from("invoices")
      .update({
        stripe_invoice_id: finalized.id,
        stripe_hosted_invoice_url: hostedUrl,
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);
    if (updateErr) return { ok: false, error: updateErr.message };

    revalidatePath(`/app/estimator/invoices/${invoiceId}`);
    return { ok: true, data: { hostedUrl } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? `Stripe: ${e.message}` : "Stripe call failed.",
    };
  }
}

/** Manual fallback — paid by check/cash/Venmo. */
export async function markInvoicePaid(invoiceId: number): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, clientId } = auth;

  const { data: inv, error } = await supabase
    .from("invoices")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", invoiceId)
    .select("id, invoice_number, job_id, total_cents")
    .maybeSingle();
  if (error || !inv) return { ok: false, error: error?.message ?? "Not found." };

  // create_notification is deliberately service-role-only (SECURITY DEFINER,
  // no membership check) — the RLS-checked update above already proved the
  // caller may act on this tenant's invoice.
  const { data: notif } = await createAdminClient().rpc("create_notification", {
    p_client_id: clientId,
    p_kind: "invoice_paid",
    p_title: `Invoice ${inv.invoice_number} paid`,
    p_body: `$${(Number(inv.total_cents) / 100).toFixed(2)} received (marked manually).`,
    p_link_url: `/app/estimator/invoices/${inv.id}`,
    p_source_job_id: inv.job_id,
    p_source_message_id: null,
    p_source_call_summary_id: null,
  });
  if (!(notif as { ok?: boolean } | null)?.ok) {
    console.error("[invoice] notification failed", notif);
  }

  revalidatePath(`/app/estimator/invoices/${invoiceId}`);
  revalidatePath("/app/estimator/invoices");
  return { ok: true };
}

export async function deleteInvoice(invoiceId: number): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const { data: inv } = await supabase
    .from("invoices")
    .select("id, status, stripe_invoice_id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv) return { ok: false, error: "Invoice not found." };
  if (inv.status !== "draft" || inv.stripe_invoice_id) {
    return { ok: false, error: "Only unsent drafts can be deleted." };
  }
  const { error } = await supabase.from("invoices").delete().eq("id", invoiceId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/estimator/invoices");
  return { ok: true };
}
