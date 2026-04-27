import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const STRIPE_API_BASE = "https://api.stripe.com/v1";

// Stripe price IDs — keep here so admin doesn't need to remember them.
// If you rotate prices, update these and redeploy.
const PRICE_MONTHLY = "price_1TPp7mQ2C2PqpbCdqBQ3O53w"; // $397/mo recurring
const PRICE_SETUP = "price_1TPp7mQ2C2PqpbCd710OV6mH";   // $299 one-time

function parseAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminEmails = parseAdminEmails();
  if (!adminEmails.includes((user.email ?? "").toLowerCase())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json(
      { error: "STRIPE_SECRET_KEY not configured" },
      { status: 500 },
    );
  }

  let body: { client_id?: number | string; business_name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const clientId = Number(body.client_id);
  if (!Number.isInteger(clientId) || clientId < 1) {
    return NextResponse.json(
      { error: "client_id must be a positive integer" },
      { status: 400 },
    );
  }

  // Construct application/x-www-form-urlencoded body for Stripe
  const params = new URLSearchParams();
  params.append("line_items[0][price]", PRICE_SETUP);
  params.append("line_items[0][quantity]", "1");
  params.append("line_items[1][price]", PRICE_MONTHLY);
  params.append("line_items[1][quantity]", "1");
  // The metadata + client_reference_id will both flow through to the
  // checkout.session.completed event. Belt + suspenders.
  params.append("metadata[client_id]", String(clientId));
  if (body.business_name) {
    params.append("metadata[business_name]", body.business_name);
  }
  // Mode is auto-detected from line_items (recurring price → subscription).
  // We DO want to set after_completion so customer lands somewhere sensible.
  params.append("after_completion[type]", "hosted_confirmation");
  params.append(
    "after_completion[hosted_confirmation][custom_message]",
    "Payment received. Your operator will reach out shortly to schedule onboarding. Expect to be live within 3–5 business days.",
  );

  const stripeRes = await fetch(`${STRIPE_API_BASE}/payment_links`, {
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
      { error: "Stripe API error", details: errBody },
      { status: 500 },
    );
  }

  const link = await stripeRes.json();
  // Stripe Payment Links don't directly accept client_reference_id at creation —
  // it's a Checkout Session field. So we append it as a URL query param to the
  // Payment Link URL. Stripe forwards URL params as client_reference_id on the
  // session if the param is named correctly.
  const finalUrl = `${link.url}?client_reference_id=${encodeURIComponent(String(clientId))}`;

  return NextResponse.json({
    id: link.id,
    url: finalUrl,
    raw_url: link.url,
    client_id: clientId,
    created: link.created,
  });
}
