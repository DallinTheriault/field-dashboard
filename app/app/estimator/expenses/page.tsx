import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, FileDown } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/permissions/current-role";
import { canViewSettings } from "@/lib/permissions/roles";
import { getTenantFeatureFlags } from "@/lib/features/flags";
import { FeatureDisabledPanel } from "@/components/ui/feature-disabled-panel";
import { dayKeyInTz, getTenantTimezone } from "@/lib/dates";
import { summarizePnl } from "@/lib/estimator/expenses";
import {
  ALTERNATIVE_METHODS_NOTE,
  buildRateMap,
  summarizeMileage,
} from "@/lib/estimator/mileage";
import { ExpensesManager } from "./expenses-manager";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/**
 * Money — the tax-season page. Income = paid estimator invoices; costs =
 * logged expenses + job materials from Actuals. One year, one screen,
 * one CSV for the accountant.
 */
export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string }>;
}) {
  const [session, flags, tz, { y: yParam }] = await Promise.all([
    getCurrentUserRole(),
    getTenantFeatureFlags(),
    getTenantTimezone(),
    searchParams,
  ]);
  if (!session) redirect("/login");
  if (!canViewSettings(session.role)) redirect("/app");
  if (!flags.estimator) return <FeatureDisabledPanel featureName="Estimator" />;

  const currentYear = Number(dayKeyInTz(new Date(), tz).slice(0, 4));
  const year = /^\d{4}$/.test(yParam ?? "") ? Number(yParam) : currentYear;

  const supabase = await createClient();
  // Timestamp rows are fetched with a padded window, then bucketed by
  // tenant-timezone year, so New Year's Eve payments land in the right year.
  const windowStart = `${year - 1}-12-30`;
  const windowEnd = `${year + 1}-01-02`;
  const [
    { data: expenseRows },
    { data: invoiceRows },
    { data: mileageRows },
    { data: rateRows },
  ] = await Promise.all([
    supabase
      .from("expenses")
      .select(
        "id, expense_date, category, description, amount, qty, receipt_path, job_id, purchase_id, jobs(name), purchases(vendor, receipt_path)",
      )
      .gte("expense_date", `${year}-01-01`)
      .lte("expense_date", `${year}-12-31`)
      .order("expense_date", { ascending: false })
      .order("id", { ascending: false }),
    supabase
      .from("invoices")
      .select("total_cents, paid_at")
      .eq("status", "paid")
      .not("invoice_number", "is", null)
      .gte("paid_at", windowStart)
      .lte("paid_at", windowEnd),
    // Mileage is stated separately and NEVER summed into the P&L (§6.3):
    // standard mileage and actual vehicle costs are alternative methods.
    supabase
      .from("mileage_entries")
      .select("trip_date, miles")
      .gte("trip_date", `${year}-01-01`)
      .lte("trip_date", `${year}-12-31`),
    supabase.from("mileage_rates").select("year, rate_per_mile"),
  ]);

  const expenses = (expenseRows ?? []).map((e) => {
    const job = e.jobs as unknown as { name: string | null } | null;
    const purchase = e.purchases as unknown as {
      vendor: string;
      receipt_path: string | null;
    } | null;
    return {
      id: e.id,
      expense_date: e.expense_date,
      category: e.category,
      description: e.description,
      amount: Number(e.amount),
      qty: e.qty === null ? null : Number(e.qty),
      job_id: e.job_id,
      jobName: job?.name ?? null,
      vendor: purchase?.vendor ?? null,
      hasReceipt: Boolean(e.receipt_path),
      purchaseId: e.purchase_id,
      purchaseHasReceipt: Boolean(purchase?.receipt_path),
    };
  });
  const paidInvoiceCents = (invoiceRows ?? [])
    .filter((i) => i.paid_at && dayKeyInTz(i.paid_at, tz).startsWith(String(year)))
    .map((i) => Number(i.total_cents));

  // NOTE: mileage is deliberately absent from summarizePnl — it must never
  // enter income, totalExpenses, net, or byCategory.
  const pnl = summarizePnl({ paidInvoiceCents, expenses });

  const mileage = summarizeMileage(
    (mileageRows ?? []).map((m) => ({
      trip_date: String(m.trip_date),
      miles: Number(m.miles),
    })),
    year,
    buildRateMap(rateRows ?? []),
  );
  const vehicleExpenseTotal =
    pnl.byCategory.find((c) => c.category === "Vehicle & fuel")?.total ?? 0;

  const clientId = session.clientId;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <Link
        href="/app/estimator"
        className="inline-flex items-center gap-1.5 text-2xs text-bone-400 hover:text-bone-100"
      >
        <ArrowLeft size={12} />
        Estimator
      </Link>

      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-bone-50">Money</h1>
          <p className="text-sm text-bone-400 mt-1">
            Income counts invoices marked paid — invoice every job, even the
            cash ones. Job materials flow in from Actuals automatically.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={`/app/estimator/expenses?y=${year - 1}`}
            className="btn-secondary h-8 w-8 px-0"
            aria-label="Previous year"
          >
            <ChevronLeft size={14} />
          </Link>
          <span className="num text-sm text-bone-100 px-2">{year}</span>
          <Link
            href={`/app/estimator/expenses?y=${year + 1}`}
            className="btn-secondary h-8 w-8 px-0"
            aria-label="Next year"
          >
            <ChevronRight size={14} />
          </Link>
          <a
            href={`/api/estimator/expenses/csv?y=${year}`}
            className="btn-secondary text-xs h-8 ml-2"
          >
            <FileDown size={12} />
            CSV for taxes
          </a>
        </div>
      </header>

      {/* P&L summary */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: `Income`, value: usd.format(pnl.income), tone: "text-status-completed" },
          { label: "Expenses", value: usd.format(pnl.totalExpenses), tone: "text-status-danger" },
          {
            label: "Net profit",
            value: usd.format(pnl.net),
            tone: pnl.net >= 0 ? "text-bone-50" : "text-status-danger",
          },
        ].map((m) => (
          <div key={m.label} className="bg-ink-1 rounded-md px-3 py-3 shadow-inset-line">
            <div className="label-eyebrow">{m.label}</div>
            <div className={`num text-lg mt-0.5 ${m.tone}`}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Vehicle: two ALTERNATIVE figures, never summed (§6.3). The app
          states them; it does not choose a method. */}
      {(mileage.miles > 0 || vehicleExpenseTotal > 0) && (
        <section className="panel">
          <div className="px-4 py-3 border-b border-line">
            <h2 className="text-sm font-semibold text-bone-100">Vehicle</h2>
            <p className="text-2xs text-bone-400 mt-0.5">
              {ALTERNATIVE_METHODS_NOTE}
            </p>
          </div>
          <div className="px-4 py-3 grid grid-cols-2 gap-3">
            <div>
              <div className="label-eyebrow">Standard mileage</div>
              <div className="num text-base text-bone-50 mt-0.5">
                {mileage.rateSet ? usd.format(mileage.dollars) : "—"}
              </div>
              <div className="text-2xs text-bone-400 num mt-0.5">
                {mileage.miles} miles
                {mileage.rateSet ? ` × ${mileage.rate}` : ""}
              </div>
              {!mileage.rateSet && mileage.miles > 0 && (
                <Link
                  href="/app/estimator/mileage"
                  className="text-2xs text-status-lead hover:text-status-lead/80 underline underline-offset-2"
                >
                  Rate not set for {year}
                </Link>
              )}
            </div>
            <div>
              <div className="label-eyebrow">Actual vehicle expenses</div>
              <div className="num text-base text-bone-50 mt-0.5">
                {usd.format(vehicleExpenseTotal)}
              </div>
              <div className="text-2xs text-bone-400 mt-0.5">
                logged under Vehicle &amp; fuel
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Category breakdown */}
      {pnl.byCategory.length > 0 && (
        <section className="panel">
          <div className="px-4 py-3 border-b border-line">
            <h2 className="text-sm font-semibold text-bone-100">
              Where it went
            </h2>
            {pnl.jobAssigned > 0 && (
              <p className="text-2xs text-bone-400 mt-0.5">
                {usd.format(pnl.jobAssigned)} of it assigned to jobs · the rest
                is Stock &amp; overhead
              </p>
            )}
          </div>
          <div className="px-4 py-3">
            <table className="w-full text-sm">
              <tbody>
                {pnl.byCategory.map((c) => (
                  <tr key={c.category} className="border-b border-line-subtle last:border-0">
                    <td className="py-1.5 text-bone-100">{c.category}</td>
                    <td className="py-1.5 text-right num text-bone-100">
                      {usd.format(c.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Money is the P&L/tax VIEW — entry lives on the Expenses page. */}
      <section className="panel">
        <div className="px-4 py-3 border-b border-line flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-bone-100">
              Expenses — {year}
            </h2>
            <p className="text-2xs text-bone-400 mt-0.5">
              One list, every dollar out — including materials logged on jobs.
            </p>
          </div>
          <Link
            href="/app/estimator/purchases"
            className="btn-secondary text-xs h-8 shrink-0"
          >
            Log expenses →
          </Link>
        </div>
        <ExpensesManager clientId={clientId} expenses={expenses} readOnly />
      </section>
    </div>
  );
}
