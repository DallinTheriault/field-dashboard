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
import { ExpensesManager } from "./expenses-manager";
import { LogPurchase } from "./log-purchase";

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
  const [{ data: expenseRows }, { data: invoiceRows }, { data: jobRows }] =
    await Promise.all([
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
      // Allocation targets for the purchase flow — recent active jobs.
      supabase
        .from("jobs")
        .select("id, name")
        .is("archived_at", null)
        .not("status", "in", "(completed,cancelled)")
        .order("created_at", { ascending: false })
        .limit(50),
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

  const pnl = summarizePnl({ paidInvoiceCents, expenses });

  const clientId = session.clientId;
  const jobs = (jobRows ?? []).map((j) => ({
    id: j.id as number,
    name: (j.name as string | null) ?? `Job #${j.id}`,
  }));

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

      {/* Log a multi-item receipt with per-item job/Stock allocation */}
      <LogPurchase clientId={clientId} jobs={jobs} />

      {/* Expense log — every line: job materials, purchases, one-offs */}
      <section className="panel">
        <div className="px-4 py-3 border-b border-line">
          <h2 className="text-sm font-semibold text-bone-100">
            Expenses — {year}
          </h2>
          <p className="text-2xs text-bone-400 mt-0.5">
            One list, every dollar out — including materials logged on jobs.
          </p>
        </div>
        <ExpensesManager clientId={clientId} expenses={expenses} />
      </section>
    </div>
  );
}
