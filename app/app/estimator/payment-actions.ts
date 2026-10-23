"use server";

import { revalidatePath } from "next/cache";
import { requireWriter } from "@/lib/estimator/auth";
import { getEstimatorStripe } from "@/lib/estimator/stripe";
import { RECORDABLE_METHODS, type PaymentMethod } from "@/lib/invoices/payments";

type Result = { ok: true; warning?: string } | { ok: false; error: string };

function revalidate(invoiceId: number) {
  revalidatePath(`/app/estimator/invoices/${invoiceId}`);
  revalidatePath("/app/estimator/invoices");
  revalidatePath("/app");
}

/**
 * Record money received against an invoice. The database does the rest:
 * a draft becomes sent on the payment date, and the invoice is paid, dated
 * by the last payment, once payments reach its total (payments_apply).
 */
export async function recordPayment(
  invoiceId: number,
  p: { receivedOn: string; amountCents: number; method: PaymentMethod; reference?: string },
): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.receivedOn)) return { ok: false, error: "Pick the date the money came in." };
  if (!Number.isInteger(p.amountCents) || p.amountCents <= 0) return { ok: false, error: "Enter the amount received." };
  if (!RECORDABLE_METHODS.includes(p.method)) return { ok: false, error: "Pick how it was paid." };

  const { data: inv } = await supabase
    .from("invoices")
    .select("id, client_id, stripe_invoice_id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv) return { ok: false, error: "Invoice not found." };

  const { error } = await supabase.from("payments").insert({
    client_id: inv.client_id,
    invoice_id: invoiceId,
    received_on: p.receivedOn,
    amount_cents: p.amountCents,
    method: p.method,
    reference: (p.reference ?? "").trim() || null,
  });
  if (error) return { ok: false, error: error.message };

  // Paid another way: close the Stripe invoice too, so its card link can't
  // take the same money a second time.
  let warning: string | undefined;
  if (inv.stripe_invoice_id) {
    const { data: after } = await supabase.from("invoices").select("status").eq("id", invoiceId).maybeSingle();
    if (after?.status === "paid") {
      const stripe = await getEstimatorStripe();
      try {
        if (!stripe) throw new Error("Stripe isn't connected");
        await stripe.invoices.pay(inv.stripe_invoice_id, { paid_out_of_band: true });
      } catch (e) {
        warning = `Recorded, but Stripe's copy is still open (${e instanceof Error ? e.message : "Stripe call failed"}). Mark it paid in Stripe so the card link can't be paid twice.`;
      }
    }
  }

  revalidate(invoiceId);
  return { ok: true, warning };
}

/** Remove a mistyped payment. A paid invoice it completed goes back to sent. */
export async function deletePayment(paymentId: number): Promise<Result> {
  const auth = await requireWriter();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const { data: pay } = await supabase
    .from("payments")
    .select("id, invoice_id, method, invoices(stripe_invoice_id)")
    .eq("id", paymentId)
    .maybeSingle();
  if (!pay) return { ok: false, error: "Payment not found." };
  if (pay.method === "card") return { ok: false, error: "Card payments come from Stripe and stay on the invoice." };
  const inv = pay.invoices as unknown as { stripe_invoice_id: string | null } | null;
  if (inv?.stripe_invoice_id) {
    return { ok: false, error: "This invoice was issued through Stripe, which already shows it paid; the payment stays." };
  }

  const { data: gone, error } = await supabase.from("payments").delete().eq("id", paymentId).select("id");
  if (error) return { ok: false, error: error.message };
  if (!gone?.length) return { ok: false, error: "You don't have permission to remove payments." };
  revalidate(pay.invoice_id);
  return { ok: true };
}
