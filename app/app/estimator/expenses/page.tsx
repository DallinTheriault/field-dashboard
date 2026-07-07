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
  const [{ data: expenseRows }, { data: invoiceRows }, { data: materialRows }] =
    await Promise.all([
      supabase
        .from("expenses")
        .select("id, expense_date, category, description, amount, receipt_path")
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
      supabase
        .from("actual_materials")
        .select("actual_cost, created_at")
        .gte("created_at", windowStart)
        .lte("created_at", windowEnd),
    ]);

  const expenses = (expenseRows ?? []).map((e) => ({
    ...e,
    amount: Number(e.amount),
  }));
  const paidInvoiceCents = (invoiceRows ?? [])
    .filter((i) => i.paid_at && dayKeyInTz(i.paid_at, tz).startsWith(String(year)))
    .map((i) => Number(i.total_cents));
  const jobMaterialCosts = (materialRows ?? [])
    .filter((m) => dayKeyInTz(m.created_at, tz).startsWith(String(year)))
    .map((m) => Number(m.actual_cost));

  const pnl = summarizePnl({
    paidInvoiceCents,
    expenses,
    jobMaterialCosts,
  });

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

      {/* Category breakdown */}
      {(pnl.byCategory.length > 0 || pnl.jobMaterials > 0) && (
        <section className="panel">
          <div className="px-4 py-3 border-b border-line">
            <h2 className="text-sm font-semibold text-bone-100">
              Where it went
            </h2>
          </div>
          <div className="px-4 py-3">
            <table className="w-full text-sm">
              <tbody>
                {pnl.jobMaterials > 0 && (
                  <tr className="border-b border-line-subtle">
                    <td className="py-1.5 text-bone-100">
                      Job materials{" "}
                      <span className="text-2xs text-bone-400">
                        (logged on jobs via Actuals)
                      </span>
                    </td>
                    <td className="py-1.5 text-right num text-bone-100">
                      {usd.format(pnl.jobMaterials)}
                    </td>
                  </tr>
                )}
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

      {/* Expense log */}
      <section className="panel">
        <div className="px-4 py-3 border-b border-line">
          <h2 className="text-sm font-semibold text-bone-100">
            Expenses — {year}
          </h2>
        </div>
        <ExpensesManager clientId={clientId} expenses={expenses} />
      </section>
    </div>
  );
}
