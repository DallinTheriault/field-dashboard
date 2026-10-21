"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Paperclip, RefreshCw, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Role } from "@/lib/permissions/roles";
import { SCAN_STALE_MS, type PendingReceipt, type ReceiptState } from "@/lib/receipts/state";
import { deletePurchase } from "./purchase-actions";
import type { JobOption, ReceiptTarget } from "./receipt-assignment";
import { ConfirmScan, requestScan, SCAN_FAILED_TEXT } from "./scan-receipt";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const CHIP: Partial<Record<NonNullable<ReceiptState>, { label: string; tone: string }>> = {
  reading: { label: "Reading…", tone: "border-line-strong text-bone-300" },
  check: { label: "Check this", tone: "border-field-500/50 text-field-400" },
  compare: { label: "New read", tone: "border-field-500/50 text-field-400" },
  needs_entry: { label: "Needs entry", tone: "border-status-lead/50 text-status-lead" },
};

/** The job a receipt was scanned from, preselected when it's in the list. */
export function targetForJob(jobId: number | null, jobs: JobOption[]): ReceiptTarget | undefined {
  if (!jobId || !jobs.some((j) => j.id === jobId)) return undefined;
  return { kind: "job", jobId, assignment: "job_in_bid" };
}

/**
 * While any receipt here is being read, look every few seconds; refresh the
 * page when one is done (or has sat long enough to count as failed).
 */
export function useScanFollow(readingIds: number[]) {
  const router = useRouter();
  const key = readingIds.join(",");
  useEffect(() => {
    if (!key) return;
    const ids = key.split(",").map(Number);
    const supabase = createClient();
    const since = Date.now();
    const timer = window.setInterval(async () => {
      const { data } = await supabase.from("purchases").select("id, scan_status").in("id", ids);
      const moved =
        (data ?? []).length < ids.length ||
        (data ?? []).some((r) => r.scan_status !== "queued" && r.scan_status !== "scanning");
      if (moved || Date.now() - since > SCAN_STALE_MS + 15_000) {
        window.clearInterval(timer);
        router.refresh();
      }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [key, router]);
}

/** Scan again: queue a new read and let the page follow it. */
export function ScanAgainButton({ purchaseId, label = "Scan again" }: { purchaseId: number; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        // The route answers as soon as it's queued; don't hang on a slow one.
        await Promise.race([requestScan(purchaseId), new Promise((r) => setTimeout(r, 2500))]);
        setBusy(false);
        router.refresh();
      }}
      className="btn-secondary text-xs min-h-[36px] shrink-0"
    >
      {busy ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
      {label}
    </button>
  );
}

/**
 * Receipts to check: saved receipts that are being read, have a read waiting
 * ("Check this"), failed ("Needs entry"), or were never read. Shared by the
 * Expenses page, the job page and Home.
 */
export function PendingReceipts({
  receipts,
  jobs,
  role,
  receiptAi,
  title = "Receipts to check",
  allHref,
}: {
  receipts: PendingReceipt[];
  jobs: JobOption[];
  role: Role;
  receiptAi: boolean;
  title?: string;
  allHref?: string;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const manager = role === "owner" || role === "manager";
  useScanFollow(receipts.filter((r) => r.state === "reading").map((r) => r.id));

  if (receipts.length === 0) return null;
  return (
    <section className="panel" id="receipts-to-check" data-testid="receipts-to-check">
      <div className="px-4 py-3 border-b border-line flex items-center gap-2">
        <h2 className="text-sm font-semibold text-bone-100 flex-1">{title}</h2>
        {allHref && (
          <Link href={allHref} className="text-2xs text-bone-400 hover:text-bone-50 min-h-[36px] inline-flex items-center">
            All receipts
          </Link>
        )}
      </div>
      {err && (
        <div className="px-4 pt-3">
          <div className="form-error">{err}</div>
        </div>
      )}
      <ul className="divide-y divide-line-subtle">
        {receipts.map((p) => {
          const chip = p.state ? CHIP[p.state] : undefined;
          const open = openId === p.id;
          const label = p.vendor ?? p.scan?.vendor ?? "Receipt";
          const canScan = receiptAi && p.hasPhotos;
          return (
            <li key={p.id} className="px-4 py-2.5" data-receipt={p.id} data-state={p.state ?? ""}>
              <div className="flex items-center gap-2 text-sm flex-wrap">
                <span className="font-mono text-2xs text-bone-400 w-12 shrink-0">{p.purchaseDate.slice(5)}</span>
                <span className="flex-1 min-w-0 text-bone-100 truncate">
                  {label}
                  {(p.scan?.total ?? p.total) !== null && (
                    <span className="num text-2xs text-bone-400"> · {usd.format((p.scan?.total ?? p.total) as number)}</span>
                  )}
                </span>
                {chip && (
                  <span className={`chip normal-case tracking-normal shrink-0 ${chip.tone}`}>
                    {p.state === "reading" && <Loader2 size={10} className="animate-spin" />}
                    {chip.label}
                  </span>
                )}
                {manager && p.hasPhotos && (
                  <a
                    href={`/api/estimator/purchases/${p.id}/receipt`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-field-500 hover:text-field-400 p-1 shrink-0"
                    title="View photo"
                    aria-label="View photo"
                  >
                    <Paperclip size={12} />
                  </a>
                )}
                {p.state === "check" && (
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : p.id)}
                    className="btn-primary text-xs min-h-[36px] shrink-0"
                  >
                    Check
                  </button>
                )}
                {(p.state === "needs_entry" || p.state === "waiting") && (
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : p.id)}
                    className="btn-secondary text-xs min-h-[36px] shrink-0"
                  >
                    {p.state === "needs_entry" ? "Type it in" : "Enter items"}
                  </button>
                )}
                {(p.state === "needs_entry" || p.state === "waiting") && canScan && (
                  <ScanAgainButton purchaseId={p.id} label={p.state === "waiting" ? "Scan" : "Scan again"} />
                )}
                {p.state === "compare" && manager && (
                  <Link href={`/app/estimator/purchases/${p.id}`} className="btn-primary text-xs min-h-[36px] shrink-0">
                    Compare
                  </Link>
                )}
                {manager && p.state !== "reading" && p.itemCount === 0 && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm(`Delete this receipt and its photo?`)) return;
                      setErr(null);
                      const r = await deletePurchase(p.id);
                      if (!r.ok) setErr(r.error);
                      else router.refresh();
                    }}
                    className="text-bone-500 hover:text-status-danger p-1 shrink-0"
                    aria-label={`Delete ${label}`}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
              {p.state === "reading" && (
                <p className="text-2xs text-bone-400 mt-1">Saved. Reading it now…</p>
              )}
              {p.state === "needs_entry" && <p className="text-2xs text-status-lead mt-1">{SCAN_FAILED_TEXT}</p>}
              {open && (
                <div className="mt-2 -mx-4">
                  <ConfirmScan
                    purchaseId={p.id}
                    scan={p.state === "check" ? p.scan : null}
                    jobs={jobs}
                    role={role}
                    canViewPhoto={manager}
                    initialVendor={p.vendor}
                    initialDate={p.purchaseDate}
                    initialTax={p.tax}
                    initialTotal={p.total}
                    initialTarget={targetForJob(p.scanJobId, jobs)}
                    onDone={() => {
                      setOpenId(null);
                      router.refresh();
                    }}
                    onCancel={() => setOpenId(null)}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
