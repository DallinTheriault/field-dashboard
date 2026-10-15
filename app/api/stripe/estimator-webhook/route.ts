import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { dayKeyInTz } from "@/lib/dates";
import { getEstimatorStripe } from "@/lib/estimator/stripe";

/**
 * Stripe webhook for ESTIMATOR customer invoices: invoice.paid records a card
 * payment (dated by Stripe's paid time in the tenant's timezone) and the
 * database marks the invoice paid (payments_apply), then a bell notification.
 * Configure a dedicated webhook endpoint in the tenant's Stripe dashboard pointing at
 * this route on the dashboard domain (app.getfield.co) with the
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

  const { data: inv, error: findErr } = await admin
    .from("invoices")
    .select("id, client_id, invoice_number, job_id, Clients(timezone)")
    .eq("stripe_invoice_id", stripeInvoice.id)
    .maybeSingle();
  if (findErr) {
    // 500 → Stripe retries; transient DB issues self-heal.
    return NextResponse.json({ error: findErr.message }, { status: 500 });
  }
  if (!inv) {
    // Not one of ours (e.g. the endpoint pointed at the wrong account): acknowledge.
    return NextResponse.json({ received: true });
  }

  // Field marks a Stripe invoice paid out of band after recording a check or
  // cash payment; that money is already on the books. Only card money counts.
  // Events carry the endpoint's API version, which may predate
  // amount_paid_off_stripe; then ask Stripe (our SDK's pinned version) rather
  // than guess, and let Stripe retry if that fails.
  let offStripe = stripeInvoice.amount_paid_off_stripe;
  if (offStripe === undefined || offStripe === null) {
    try {
      const stripe = getEstimatorStripe();
      if (!stripe) throw new Error("Stripe isn't configured");
      offStripe = (await stripe.invoices.retrieve(stripeInvoice.id!)).amount_paid_off_stripe ?? 0;
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Stripe lookup failed" }, { status: 500 });
    }
  }
  const amountCents = stripeInvoice.amount_paid - offStripe;
  if (!(amountCents > 0)) {
    return NextResponse.json({ received: true });
  }

  const tz = (inv.Clients as unknown as { timezone: string | null } | null)?.timezone || "America/Denver";
  const paidAtSec = stripeInvoice.status_transitions?.paid_at ?? event.created;
  const { error } = await admin.from("payments").insert({
    client_id: inv.client_id,
    invoice_id: inv.id,
    received_on: dayKeyInTz(paidAtSec * 1000, tz),
    amount_cents: amountCents,
    method: "card",
    reference: stripeInvoice.id,
    created_by: null,
  });
  if (error?.code === "23505") {
    // Already recorded: Stripe retries deliveries.
    return NextResponse.json({ received: true });
  }
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin.rpc("create_notification", {
    p_client_id: inv.client_id,
    p_kind: "invoice_paid",
    p_title: `Invoice ${inv.invoice_number} paid`,
    p_body: `$${(amountCents / 100).toFixed(2)} received via Stripe.`,
    p_link_url: `/app/estimator/invoices/${inv.id}`,
    p_source_job_id: inv.job_id,
    p_source_message_id: null,
    p_source_call_summary_id: null,
  });

  return NextResponse.json({ received: true });
}
