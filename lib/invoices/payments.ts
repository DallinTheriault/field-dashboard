/**
 * Payments against customer invoices (billing slice 4). The database decides
 * paid status (payments_apply); these helpers only shape what the screens
 * show and parse what people type.
 */

export type PaymentMethod = "e_check" | "check" | "cash" | "card" | "other" | "unknown";

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  e_check: "E-check",
  check: "Check",
  cash: "Cash",
  card: "Card (Stripe)",
  other: "Other",
  unknown: "Not recorded",
};

/** What a person can pick when recording one. Card payments come from Stripe. */
export const RECORDABLE_METHODS: PaymentMethod[] = ["e_check", "check", "cash", "other"];

export type Payment = {
  id: number;
  received_on: string;
  amount_cents: number;
  method: PaymentMethod;
  reference: string | null;
};

export function paidCents(payments: Array<Pick<Payment, "amount_cents">>): number {
  return payments.reduce((s, p) => s + Number(p.amount_cents), 0);
}

export function balanceDueCents(totalCents: number, payments: Array<Pick<Payment, "amount_cents">>): number {
  return Math.max(0, totalCents - paidCents(payments));
}

/** "$1,234.5" / "1234.50" → 123450 cents; null when it isn't a positive amount. */
export function parseDollarsToCents(input: string): number | null {
  const clean = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  const cents = Math.round(Number(clean) * 100);
  return cents > 0 ? cents : null;
}

/** Whole days from one YYYY-MM-DD to another (never negative). */
export function daysBetween(fromDay: string, toDay: string): number {
  const ms = Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

export type InvoiceTab = "unpaid" | "drafts" | "paid" | "voided";

/**
 * Which list an invoice belongs in. A Stripe-issued invoice not yet marked
 * sent is still a draft here: nobody has confirmed it went to the customer.
 */
export function invoiceTab(status: string): InvoiceTab {
  if (status === "paid") return "paid";
  if (status === "voided") return "voided";
  if (status === "draft") return "drafts";
  return "unpaid"; // sent, overdue
}
