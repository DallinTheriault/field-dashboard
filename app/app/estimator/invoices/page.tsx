import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/permissions/current-role";
import { canViewSettings } from "@/lib/permissions/roles";
import { getTenantFeatureFlags } from "@/lib/features/flags";
import { FeatureDisabledPanel } from "@/components/ui/feature-disabled-panel";
import { InvoiceStatusChip } from "./invoice-status";
import { getTenantTimezone } from "@/lib/dates";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function fmtDate(d: string | null, tz: string): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" });
}

/** Customer invoices (estimator module) — subscription rows are excluded. */
export default async function InvoicesPage() {
  const tz = await getTenantTimezone();
  const [session, flags] = await Promise.all([
    getCurrentUserRole(),
    getTenantFeatureFlags(),
  ]);
  if (!session) redirect("/login");
  if (!canViewSettings(session.role)) redirect("/app");
  if (!flags.estimator) return <FeatureDisabledPanel featureName="Estimator" />;

  const supabase = await createClient();
  const { data: invoices } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, status, total_cents, customer_name, created_at, paid_at, stripe_invoice_id",
    )
    .not("invoice_number", "is", null)
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = invoices ?? [];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <Link
        href="/app/estimator"
        className="inline-flex items-center gap-1.5 text-2xs text-bone-400 hover:text-bone-100"
      >
        <ArrowLeft size={12} />
        Estimator
      </Link>
      <header>
        <h1 className="text-xl font-semibold text-bone-50">Invoices</h1>
        <p className="text-sm text-bone-400 mt-0.5">
          Created from accepted estimates. Numbered per letterhead, per year.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="panel px-6 py-12 text-center">
          <p className="text-sm text-bone-300 mb-1">No invoices yet.</p>
          <p className="text-xs text-bone-400">
            Open an accepted estimate and tap &ldquo;Create invoice.&rdquo;
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((inv) => (
            <li key={inv.id}>
              <Link
                href={`/app/estimator/invoices/${inv.id}`}
                className="flex items-center gap-3 px-3 py-2.5 bg-ink-1 hover:bg-ink-2 rounded-sm shadow-inset-line transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-bone-100 font-medium truncate">
                    <span className="font-mono">{inv.invoice_number}</span>
                    {" · "}
                    {inv.customer_name}
                  </div>
                  <div className="text-2xs text-bone-400">
                    {inv.status === "paid"
                      ? `Paid ${fmtDate(inv.paid_at, tz)}`
                      : `Issued ${fmtDate(inv.created_at, tz)}`}
                    {inv.stripe_invoice_id ? " · Stripe" : ""}
                  </div>
                </div>
                <span className="num text-sm text-bone-50">
                  {usd.format(Number(inv.total_cents) / 100)}
                </span>
                <InvoiceStatusChip status={inv.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
