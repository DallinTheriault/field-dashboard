import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stripe webhook for ESTIMATOR customer invoices (invoice.paid → instant
 * PAID + bell notification). Deliberately a SEPARATE endpoint from the n8n
 * WF-Billing subscription webhook — that flow is untouched. Configure a
 * dedicated webhook endpoint in the tenant's Stripe dashboard pointing at
 * this route on the DASHBOARD domain (sharpline.getfield.co) with the
 * `invoice.paid` event, and put its signing secret in
 * ESTIMATOR_STRIPE_WEBHOOK_SECRET.
 */
export async function POST(request: Request) {
  const secret = process.env.ESTIMATOR_STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = await Stripe.webhooks.constructEventAsync(body, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type !== "invoice.paid") {
    // Not ours to handle — acknowledge so Stripe stops retrying.
    return NextResponse.json({ received: true });
  }

  const stripeInvoice = event.data.object as Stripe.Invoice;
  const admin = createAdminClient();

  const { data: inv, error } = await admin
    .from("invoices")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("stripe_invoice_id", stripeInvoice.id)
    .neq("status", "paid") // idempotent: Stripe retries deliveries
    .select("id, client_id, invoice_number, job_id, total_cents")
    .maybeSingle();

  if (error) {
    // 500 → Stripe retries; transient DB issues self-heal.
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!inv) {
    // Unknown or already-paid invoice (e.g. subscription invoices if the
    // endpoint is ever pointed at the wrong account) — acknowledge.
    return NextResponse.json({ received: true });
  }

  await admin.rpc("create_notification", {
    p_client_id: inv.client_id,
    p_kind: "invoice_paid",
    p_title: `Invoice ${inv.invoice_number} paid`,
    p_body: `$${(Number(inv.total_cents) / 100).toFixed(2)} received via Stripe.`,
    p_link_url: `/app/estimator/invoices/${inv.id}`,
    p_source_job_id: inv.job_id,
    p_source_message_id: null,
    p_source_call_summary_id: null,
  });

  return NextResponse.json({ received: true });
}
