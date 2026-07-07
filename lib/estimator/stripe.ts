import Stripe from "stripe";

/**
 * Stripe client for ESTIMATOR customer invoicing (Hosted Invoices).
 *
 * This is deliberately a DIFFERENT key from STRIPE_SECRET_KEY (Field's own
 * subscription billing). The estimator invoices the tenant's customers from
 * the tenant's Stripe account. Restricted-key permissions required:
 * Customers (write), Invoices (write), Invoice Items (write).
 *
 * Unset key = feature cleanly disabled: actions return a helpful error and
 * the UI still supports manual (check/cash/Venmo) invoicing + PDFs.
 */
export function getEstimatorStripe(): Stripe | null {
  const key = process.env.ESTIMATOR_STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

export const STRIPE_NOT_CONFIGURED =
  "Stripe isn't connected yet. Add ESTIMATOR_STRIPE_SECRET_KEY (a restricted key with Customers/Invoices/Invoice Items write) to the environment — the invoice still works with the PDF + your payment instructions.";
