"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWriter } from "@/lib/estimator/auth";
import { buildClientDocRows } from "@/lib/estimator/client-rows";
import { buildExtraInvoiceRows } from "@/lib/estimator/expenses";

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
      .in("id", (extraItems ?? []).map((it) => it.id))
      .is("invoiced_on", null); // never take one another draft claimed meanwhile
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

/** Manual fallback — paid by check/cash/Venmo. */
export async function markInvoicePaid(invoiceId: number): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, clientId } = auth;

  const { data: inv, error } = await supabase
    .from("invoices")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", invoiceId)
    .in("status", ["draft", "sent", "overdue"]) // never a void (a stale tab) or twice
    .select("id, invoice_number, job_id, total_cents")
    .maybeSingle();
  if (error || !inv) return { ok: false, error: error?.message ?? "Only an unpaid invoice can be marked paid. Reload it." };

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
