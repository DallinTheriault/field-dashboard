"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWriter } from "@/lib/estimator/auth";
import { buildClientDocRows } from "@/lib/estimator/client-rows";
import {
  buildExtraInvoiceRows,
  withoutExtraRows,
  type InvoiceRow,
} from "@/lib/estimator/expenses";
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
        "id, job_id, status, billing_entity_id, computed_price, manual_override_price, resolved_travel_fee, jobs(name, email, phone, address, property_id, bill_to_contact_id), travel_zones(label)",
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
    property_id: number | null;
    bill_to_contact_id: number | null;
  } | null;
  const zone = est.travel_zones as unknown as { label: string } | null;

  // Bill-to snapshot (§5.4), frozen onto the invoice AT creation: an explicit
  // bill_to_contact_id wins; otherwise the property's contact is the default
  // biller; otherwise (property-less job) the job's own captured name. The
  // WHERE the work happened — the address — stays the property/job address on
  // the PDF and is deliberately NOT overridden (architect Q3).
  let billerName = job?.name ?? "Customer";
  let billerEmail = job?.email ?? null;
  let billerPhone = job?.phone ?? null;
  let billerContactId = job?.bill_to_contact_id ?? null;
  if (!billerContactId && job?.property_id) {
    const { data: prop } = await supabase
      .from("properties")
      .select("contact_id")
      .eq("id", job.property_id)
      .maybeSingle();
    billerContactId = prop?.contact_id ?? null;
  }
  if (billerContactId) {
    // RLS-scoped: the user client only resolves a same-tenant contact.
    const { data: bc } = await supabase
      .from("contacts")
      .select("name, email, phone")
      .eq("id", billerContactId)
      .maybeSingle();
    if (bc) {
      billerName = bc.name ?? billerName;
      billerEmail = bc.email ?? billerEmail;
      billerPhone = bc.phone ?? billerPhone;
    }
  }

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

  // Uninvoiced job_extra items ride along AT COST (ruling Q1a): clearly
  // labeled, added to the subtotal, and stamped with this invoice below.
  const { data: extraItems } = await supabase
    .from("expenses")
    .select("id, description, qty, unit_price, amount, purchases(tax, subtotal)")
    .eq("job_id", est.job_id)
    .eq("assignment", "job_extra")
    .is("invoiced_on", null)
    .order("id");
  const extras = buildExtraInvoiceRows(
    (extraItems ?? []).map((it) => {
      const purchase = it.purchases as unknown as {
        tax: number | string | null;
        subtotal: number | string | null;
      } | null;
      return {
        id: it.id,
        description: it.description,
        qty: it.qty === null ? null : Number(it.qty),
        unit_price: it.unit_price === null ? null : Number(it.unit_price),
        amount: Number(it.amount),
        purchaseTax: purchase?.tax == null ? null : Number(purchase.tax),
        purchaseSubtotal: purchase?.subtotal == null ? null : Number(purchase.subtotal),
      };
    }),
  );

  const allRows = [...rows, ...extras.rows];
  const subtotalCents = Math.round((total + extras.addedTotal) * 100);
  const taxCents = Math.round((subtotalCents * taxRatePct) / 100);

  const { data, error } = await supabase.rpc("estimator_create_invoice", {
    p: {
      client_id: clientId,
      job_id: est.job_id,
      estimate_id: est.id,
      billing_entity_id: est.billing_entity_id,
      customer_name: billerName,
      customer_email: billerEmail,
      customer_phone: billerPhone,
      line_items: allRows,
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
  const invoiceId = Number((data as { invoice_id: number }).invoice_id);

  // Stamp the included extras (ruling Q1 refinement): the reliable basis
  // for "already invoiced" guards and the uninvoiced-extras job badge.
  if ((extraItems ?? []).length > 0) {
    await supabase
      .from("expenses")
      .update({ invoiced_on: invoiceId })
      .in("id", (extraItems ?? []).map((it) => it.id));
  }

  revalidatePath("/app/estimator");
  revalidatePath(`/app/estimator/${estimateId}`);
  return {
    ok: true,
    data: {
      invoiceId,
      invoiceNumber: (data as { invoice_number: string }).invoice_number,
    },
  };
}

/**
 * Re-pull the job's uninvoiced extras into a DRAFT invoice (ruling Q1b):
 * strips previously-injected extra rows, unstamps them, re-adds the current
 * set, recomputes totals. Sent/paid invoices are immutable — Stripe
 * finalization is a hard wall (ruling Q1c).
 */
export async function refreshInvoiceExtras(invoiceId: number): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const { data: inv } = await supabase
    .from("invoices")
    .select("id, job_id, status, stripe_invoice_id, line_items, tax_rate_pct")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv) return { ok: false, error: "Invoice not found." };
  if (inv.status !== "draft" || inv.stripe_invoice_id) {
    return {
      ok: false,
      error: "Only draft invoices can refresh extras — this one is final.",
    };
  }

  // Release everything currently stamped with this invoice, then re-pull.
  const { error: unstampErr } = await supabase
    .from("expenses")
    .update({ invoiced_on: null })
    .eq("invoiced_on", invoiceId);
  if (unstampErr) return { ok: false, error: unstampErr.message };

  const { data: extraItems } = await supabase
    .from("expenses")
    .select("id, description, qty, unit_price, amount, purchases(tax, subtotal)")
    .eq("job_id", inv.job_id)
    .eq("assignment", "job_extra")
    .is("invoiced_on", null)
    .order("id");
  const extras = buildExtraInvoiceRows(
    (extraItems ?? []).map((it) => {
      const purchase = it.purchases as unknown as {
        tax: number | string | null;
        subtotal: number | string | null;
      } | null;
      return {
        id: it.id,
        description: it.description,
        qty: it.qty === null ? null : Number(it.qty),
        unit_price: it.unit_price === null ? null : Number(it.unit_price),
        amount: Number(it.amount),
        purchaseTax: purchase?.tax == null ? null : Number(purchase.tax),
        purchaseSubtotal: purchase?.subtotal == null ? null : Number(purchase.subtotal),
      };
    }),
  );

  const baseRows = withoutExtraRows((inv.line_items ?? []) as InvoiceRow[]);
  const allRows = [...baseRows, ...extras.rows];
  const subtotalCents = Math.round(
    allRows.reduce((s, r) => s + r.amount, 0) * 100,
  );
  const taxRatePct = Number(inv.tax_rate_pct ?? 0);
  const taxCents = Math.round((subtotalCents * taxRatePct) / 100);

  const { error: updErr } = await supabase
    .from("invoices")
    .update({
      line_items: allRows,
      subtotal_cents: subtotalCents,
      tax_cents: taxCents,
      total_cents: subtotalCents + taxCents,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoiceId);
  if (updErr) return { ok: false, error: updErr.message };

  if ((extraItems ?? []).length > 0) {
    await supabase
      .from("expenses")
      .update({ invoiced_on: invoiceId })
      .in("id", (extraItems ?? []).map((it) => it.id));
  }

  revalidatePath(`/app/estimator/invoices/${invoiceId}`);
  return { ok: true };
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
  // Stripe hard-requires a customer email for send_invoice collection.
  if (!inv.customer_email) {
    return {
      ok: false,
      error:
        "Stripe needs the customer's email to issue a hosted invoice. Add an email on the job, recreate the invoice, or collect by PDF + payment instructions instead.",
    };
  }

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

/**
 * Edit a DRAFT invoice's line amounts in place / add explicit adjustment
 * lines (micro-fix 2026-07-15). No auto-generated "price adjustment"
 * rows — what the user typed is what the invoice says. Totals recompute
 * from the lines at the invoice's tax rate. Finalized invoices stay
 * immutable (ruling Q1c).
 */
export async function updateDraftInvoiceLines(
  invoiceId: number,
  lines: Array<{
    description: string;
    qtyLabel?: string | null;
    amount: number;
    extra_expense_id?: number;
  }>,
): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const { data: inv } = await supabase
    .from("invoices")
    .select("id, status, stripe_invoice_id, tax_rate_pct")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv) return { ok: false, error: "Invoice not found." };
  if (inv.status !== "draft" || inv.stripe_invoice_id) {
    return { ok: false, error: "Only draft invoices can be edited — this one is final." };
  }

  if (!Array.isArray(lines) || lines.length === 0) {
    return { ok: false, error: "An invoice needs at least one line." };
  }
  const clean: InvoiceRow[] = [];
  for (const l of lines) {
    const description = (l.description ?? "").trim();
    const amount = Number(l.amount);
    if (!description) return { ok: false, error: "Every line needs a description." };
    if (!Number.isFinite(amount)) {
      return { ok: false, error: `"${description}": amount must be a number.` };
    }
    clean.push({
      description,
      qtyLabel: l.qtyLabel ? String(l.qtyLabel) : null,
      amount: Math.round(amount * 100) / 100,
      ...(Number.isInteger(l.extra_expense_id)
        ? { extra_expense_id: Number(l.extra_expense_id) }
        : {}),
    });
  }

  const subtotalCents = Math.round(clean.reduce((s, r) => s + r.amount, 0) * 100);
  const taxRatePct = Number(inv.tax_rate_pct ?? 0);
  const taxCents = Math.round((subtotalCents * taxRatePct) / 100);

  const { error } = await supabase
    .from("invoices")
    .update({
      line_items: clean,
      subtotal_cents: subtotalCents,
      tax_cents: taxCents,
      total_cents: subtotalCents + taxCents,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoiceId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/app/estimator/invoices/${invoiceId}`);
  return { ok: true };
}
