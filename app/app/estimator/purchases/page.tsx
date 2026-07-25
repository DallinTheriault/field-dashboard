import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/permissions/current-role";
import { canViewSettings } from "@/lib/permissions/roles";
import { getTenantFeatureFlags } from "@/lib/features/flags";
import { FeatureDisabledPanel } from "@/components/ui/feature-disabled-panel";
import { PurchasesClient, type ExpenseItemRow } from "./purchases-client";

/**
 * Expenses — the single intake / list / assignment surface (ruling Q2).
 * Enter a purchase once; every downstream surface (job materials, invoice
 * extras, costing, Money P&L, tax CSV) reads from it. Money is the pure
 * P&L/tax view and links here for entry.
 */
export default async function ExpenseIntakePage() {
  const [session, flags] = await Promise.all([
    getCurrentUserRole(),
    getTenantFeatureFlags(),
  ]);
  if (!session) redirect("/login");
  if (!canViewSettings(session.role)) redirect("/app");
  if (!flags.estimator) return <FeatureDisabledPanel featureName="Estimator" />;

  const supabase = await createClient();
  const [{ data: itemRows }, { data: jobRows }, { data: purchaseRows }] = await Promise.all([
    supabase
      .from("expenses")
      .select(
        "id, expense_date, category, description, amount, qty, unit_price, sku, job_id, assignment, customer_notified, stock_category, invoiced_on, receipt_path, purchase_id, jobs(name), purchases(vendor, purchase_date, receipt_path, receipt_paths, source), invoices:invoiced_on(invoice_number)",
      )
      .order("expense_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(300),
    // Job picker source (JOB_NUMBERING_SPEC Part A): list JOBS with enough
    // context to tell two jobs for the same contact apart. Include completed
    // jobs — a late receipt legitimately belongs to a finished job — and
    // exclude only cancelled. Newest first.
    supabase
      .from("jobs")
      .select("id, name, job_number, address, status")
      .is("archived_at", null)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(100),
    // Receipts photographed but not yet confirmed into items (scan flow
    // "later" path, or parse failures) — they need entry, not oblivion.
    supabase
      .from("purchases")
      .select("id, vendor, purchase_date, source, receipt_paths, expenses(count)")
      .order("id", { ascending: false })
      .limit(50),
  ]);

  const items: ExpenseItemRow[] = (itemRows ?? []).map((e) => {
    const job = e.jobs as unknown as { name: string | null } | null;
    const purchase = e.purchases as unknown as {
      vendor: string;
      purchase_date: string | null;
      receipt_path: string | null;
      receipt_paths: string[] | null;
      source: string;
    } | null;
    const invoice = e.invoices as unknown as { invoice_number: string } | null;
    return {
      id: e.id,
      expense_date: e.expense_date,
      category: e.category,
      description: e.description,
      amount: Number(e.amount),
      qty: e.qty === null ? null : Number(e.qty),
      unit_price: e.unit_price === null ? null : Number(e.unit_price),
      sku: e.sku,
      job_id: e.job_id,
      jobName: job?.name ?? null,
      assignment: e.assignment,
      customer_notified: e.customer_notified,
      stock_category: e.stock_category,
      invoiced_on: e.invoiced_on,
      invoiceNumber: invoice?.invoice_number ?? null,
      purchaseId: e.purchase_id,
      vendor: purchase?.vendor ?? null,
      purchaseDate: purchase?.purchase_date ?? null,
      hasReceipt: Boolean(
        e.receipt_path ||
          purchase?.receipt_path ||
          (purchase?.receipt_paths ?? []).length > 0,
      ),
    };
  });

  const jobs = (jobRows ?? []).map((j) => ({
    id: j.id as number,
    name: (j.name as string | null) ?? `Job #${j.id}`,
    jobNumber: (j.job_number as string | null) ?? null,
    address: (j.address as string | null) ?? null,
    status: (j.status as string | null) ?? null,
  }));

  const pendingPurchases = (purchaseRows ?? [])
    .filter((p) => {
      const c = p.expenses as unknown as Array<{ count: number }> | null;
      return (c?.[0]?.count ?? 0) === 0;
    })
    .map((p) => ({
      id: p.id as number,
      vendor: p.vendor as string,
      purchase_date: p.purchase_date as string,
      hasPhotos: ((p.receipt_paths as string[] | null) ?? []).length > 0,
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
          <h1 className="text-xl font-semibold text-bone-50">Expenses</h1>
          <p className="text-sm text-bone-400 mt-1">
            Enter it once — assign each item to a job or Stock, and the job
            costing, invoices, and tax CSV all follow.
          </p>
        </div>
        <Link href="/app/estimator/expenses" className="btn-secondary text-xs h-8">
          <Wallet size={12} />
          P&amp;L / taxes
        </Link>
      </header>

      <PurchasesClient
        clientId={session.clientId}
        items={items}
        jobs={jobs}
        pendingPurchases={pendingPurchases}
        receiptAi={flags.receiptAi}
      />
    </div>
  );
}
