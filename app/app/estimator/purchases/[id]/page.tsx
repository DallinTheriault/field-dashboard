import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ImageOff } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/permissions/current-role";
import { canViewSettings } from "@/lib/permissions/roles";
import { getTenantFeatureFlags } from "@/lib/features/flags";
import { FeatureDisabledPanel } from "@/components/ui/feature-disabled-panel";
import { mintPurchasePhotoUrls } from "@/lib/estimator/receipt-urls";
import { ASSIGNMENT_LABELS, type Assignment } from "@/lib/estimator/expenses";
import { PurchasePhotos } from "./purchase-photos";
import { PurchaseScanPanel } from "./purchase-scan-panel";
import { JOB_LOCATION_SELECT, toJobPick, withBilling } from "@/lib/jobs/address";
import { BILLING_COLS, billingByJob } from "@/lib/jobs/billing";
import { PURCHASE_SCAN_COLS, toPendingReceipt } from "@/lib/receipts/state";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/**
 * One purchase: its photo(s) full-size with paging, the header the user
 * agreed to at capture, and its items with assignments. Owner/manager only,
 * inheriting the Business gate (§6.4) — members capture from inside a job.
 */
export default async function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [session, flags] = await Promise.all([
    getCurrentUserRole(),
    getTenantFeatureFlags(),
  ]);
  if (!session) redirect("/login");
  if (!canViewSettings(session.role)) redirect("/app");
  if (!flags.estimator) return <FeatureDisabledPanel featureName="Business" />;

  const { id } = await params;
  const purchaseId = Number(id);
  if (!Number.isInteger(purchaseId)) notFound();

  const supabase = await createClient();
  const [{ data: purchase }, { data: items }, { data: jobRows }, { data: billingRows }] = await Promise.all([
    supabase
      .from("purchases")
      .select(`id, vendor, purchase_date, source, subtotal, tax, total, receipt_path, receipt_paths, ${PURCHASE_SCAN_COLS}`)
      .eq("id", purchaseId)
      .maybeSingle(),
    supabase
      .from("expenses")
      .select("id, description, sku, qty, unit_price, amount, assignment, job_id, jobs(name)")
      .eq("purchase_id", purchaseId)
      .order("id"),
    // Job picker for checking a read (same list as the Expenses page).
    supabase
      .from("jobs")
      .select(`id, name, job_number, status, ${JOB_LOCATION_SELECT}`)
      .is("archived_at", null)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("job_billing").select(BILLING_COLS),
  ]);
  if (!purchase) notFound(); // RLS-scoped: another tenant's id is simply absent
  const receipt = toPendingReceipt(
    purchase as unknown as Parameters<typeof toPendingReceipt>[0],
    (items ?? []).length,
  );
  const jobs = withBilling(
    ((jobRows ?? []) as unknown as Parameters<typeof toJobPick>[0][]).map(toJobPick),
    billingByJob(billingRows as Array<Record<string, unknown>> | null),
  );

  // One batched signing pass for every photo on this purchase.
  const photoFiles = await mintPurchasePhotoUrls(purchase);

  const rows = (items ?? []).map((it) => {
    const job = it.jobs as unknown as { name: string | null } | null;
    return {
      id: it.id as number,
      description: it.description as string,
      sku: (it.sku as string | null) ?? null,
      qty: it.qty === null ? null : Number(it.qty),
      unitPrice: it.unit_price === null ? null : Number(it.unit_price),
      amount: Number(it.amount),
      assignment: (it.assignment as string) ?? "unassigned",
      jobId: (it.job_id as number | null) ?? null,
      jobName: job?.name ?? null,
    };
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <Link
        href="/app/estimator/purchases"
        className="inline-flex items-center gap-1.5 text-2xs text-bone-400 hover:text-bone-100"
      >
        <ArrowLeft size={12} />
        Expenses
      </Link>

      <header>
        <h1 className="text-xl font-semibold text-bone-50 break-words">
          {purchase.vendor ?? "Receipt"}
        </h1>
        <p className="text-sm text-bone-400 mt-1 num">
          {String(purchase.purchase_date).slice(0, 10)}
          {purchase.total !== null && ` · ${usd.format(Number(purchase.total))}`}
          {purchase.tax !== null && ` · tax ${usd.format(Number(purchase.tax))}`}
          {purchase.source ? ` · ${purchase.source}` : ""}
        </p>
      </header>

      <PurchaseScanPanel
        purchase={{
          id: receipt.id,
          vendor: receipt.vendor,
          purchaseDate: receipt.purchaseDate,
          tax: receipt.tax,
          total: receipt.total,
          hasPhotos: receipt.hasPhotos,
        }}
        state={receipt.state}
        scan={receipt.scan}
        scanJobId={receipt.scanJobId}
        saved={rows.map((r) => ({ description: r.description, amount: r.amount, assignment: r.assignment, jobId: r.jobId }))}
        jobs={jobs}
        role={session.role}
        receiptAi={flags.receiptAi}
      />

      {photoFiles.length > 0 ? (
        <PurchasePhotos files={photoFiles} vendor={purchase.vendor ?? "Receipt"} />
      ) : (
        <div className="panel px-4 py-6 flex items-center gap-2 text-2xs text-bone-400">
          <ImageOff size={14} />
          No photo on this purchase (entered manually).
        </div>
      )}

      <section className="panel">
        <div className="px-4 py-3 border-b border-line">
          <h2 className="text-sm font-semibold text-bone-100">
            Items{" "}
            <span className="text-2xs text-bone-400 font-normal">
              ({rows.length})
            </span>
          </h2>
          <p className="text-2xs text-bone-400 mt-0.5">
            Assign items from the Expenses list.
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-4 text-2xs text-bone-400">
            No items entered from this receipt yet.
          </p>
        ) : (
          <ul className="divide-y divide-line-subtle">
            {rows.map((it) => (
              <li key={it.id} className="px-4 py-2.5 flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-bone-100 break-words leading-snug">
                    {it.description}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 text-2xs text-bone-400 mt-0.5">
                    {it.qty !== null && it.unitPrice !== null && (
                      <span className="num">
                        {it.qty} × {usd.format(it.unitPrice)}
                      </span>
                    )}
                    {it.sku && <span className="font-mono">SKU {it.sku}</span>}
                    {it.jobName && <span className="text-field-400">{it.jobName}</span>}
                  </div>
                </div>
                <span className="chip normal-case tracking-normal shrink-0 border-line-strong text-bone-400">
                  {ASSIGNMENT_LABELS[it.assignment as Assignment] ?? it.assignment}
                </span>
                <span className="num text-sm text-bone-100 shrink-0">
                  {usd.format(it.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
