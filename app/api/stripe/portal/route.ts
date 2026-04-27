import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const STRIPE_API_BASE = "https://api.stripe.com/v1";

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find the user's tenant + Stripe customer
  const { data: clients } = await supabase
    .from("Clients")
    .select("id")
    .limit(1);
  const clientId = clients?.[0]?.id;
  if (!clientId) {
    return NextResponse.json({ error: "No tenant" }, { status: 404 });
  }

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("client_id", clientId)
    .maybeSingle();

  if (!sub?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No subscription found for this account" },
      { status: 404 },
    );
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json(
      { error: "Stripe not configured (STRIPE_SECRET_KEY env var missing)" },
      { status: 500 },
    );
  }

  // Build the absolute return URL so Stripe can come back to us
  const url = new URL(request.url);
  const returnUrl = `${url.origin}/app/billing`;

  // Create a Stripe Customer Portal session
  const params = new URLSearchParams({
    customer: sub.stripe_customer_id,
    return_url: returnUrl,
  });

  const stripeRes = await fetch(`${STRIPE_API_BASE}/billing_portal/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!stripeRes.ok) {
    const errBody = await stripeRes.text();
    return NextResponse.json(
      { error: "Stripe error", details: errBody },
      { status: 500 },
    );
  }

  const session = await stripeRes.json();
  return NextResponse.redirect(session.url, { status: 303 });
}
