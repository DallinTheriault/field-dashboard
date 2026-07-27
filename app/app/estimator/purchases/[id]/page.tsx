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
  const [{ data: purchase }, { data: items }] = await Promise.all([
    supabase
      .from("purchases")
      .select("id, vendor, purchase_date, source, subtotal, tax, total, receipt_path, receipt_paths")
      .eq("id", purchaseId)
      .maybeSingle(),
    supabase
      .from("expenses")
      .select("id, description, sku, qty, unit_price, amount, assignment, job_id, jobs(name)")
      .eq("purchase_id", purchaseId)
      .order("id"),
  ]);
  if (!purchase) notFound(); // RLS-scoped: another tenant's id is simply absent

  // One batched signing pass for every photo on this purchase.
  const photoUrls = await mintPurchasePhotoUrls(purchase);

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
          {purchase.vendor}
        </h1>
        <p className="text-sm text-bone-400 mt-1 num">
          {String(purchase.purchase_date).slice(0, 10)}
          {purchase.total !== null && ` · ${usd.format(Number(purchase.total))}`}
          {purchase.tax !== null && ` · tax ${usd.format(Number(purchase.tax))}`}
          {purchase.source ? ` · ${purchase.source}` : ""}
        </p>
      </header>

      {photoUrls.length > 0 ? (
        <PurchasePhotos urls={photoUrls} vendor={purchase.vendor} />
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
