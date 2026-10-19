"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import type { Role } from "@/lib/permissions/roles";
import type { Assignment } from "@/lib/estimator/expenses";
import { scanTotalsMismatch, type StoredScan } from "@/lib/estimator/receipt-scan";
import type { ReceiptState } from "@/lib/receipts/state";
import { dismissScan } from "../purchase-actions";
import type { JobOption, ReceiptTarget } from "../receipt-assignment";
import { ConfirmScan, SCAN_FAILED_TEXT, SCAN_MISMATCH_TEXT } from "../scan-receipt";
import { ScanAgainButton, targetForJob, useScanFollow } from "../pending-receipts";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const money = (n: number | null | undefined) => (n === null || n === undefined ? "—" : usd.format(n));

export type SavedItem = { description: string; amount: number; assignment: string; jobId: number | null };

/** Where the saved items went, if they all went to one place. */
function savedTarget(items: SavedItem[]): ReceiptTarget | undefined {
  if (items.length === 0) return undefined;
  const [a] = items;
  if (!items.every((i) => i.assignment === a.assignment && i.jobId === a.jobId)) return undefined;
  if (a.assignment === "stock") return { kind: "stock" };
  if (a.assignment === "job_internal") return { kind: "internal", jobId: a.jobId };
  if (a.assignment === "job_in_bid" || a.assignment === "job_extra") {
    return { kind: "job", jobId: a.jobId, assignment: a.assignment as Assignment };
  }
  return undefined;
}

/**
 * The scan side of one purchase: Scan again on any purchase with a photo, and
 * what came of it. A new read of a receipt already saved shows next to what
 * was saved and changes nothing until "Use the new read" and Save.
 */
export function PurchaseScanPanel({
  purchase,
  state,
  scan,
  scanJobId,
  saved,
  jobs,
  role,
  receiptAi,
}: {
  purchase: { id: number; vendor: string | null; purchaseDate: string; tax: number | null; total: number | null; hasPhotos: boolean };
  state: ReceiptState;
  scan: StoredScan | null;
  scanJobId: number | null;
  saved: SavedItem[];
  jobs: JobOption[];
  role: Role;
  receiptAi: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [showItems, setShowItems] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useScanFollow(state === "reading" ? [purchase.id] : []);
  const canScan = receiptAi && purchase.hasPhotos;

  const done = () => {
    setEditing(false);
    router.refresh();
  };
  const keep = async () => {
    setErr(null);
    setBusy(true);
    const r = await dismissScan(purchase.id);
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    router.refresh();
  };

  if (state === "reading") {
    return (
      <section className="panel px-4 py-3 flex items-center gap-2 text-sm text-bone-300" data-testid="scan-panel">
        <Loader2 size={13} className="animate-spin text-field-500" />
        Reading the receipt… You can leave this page.
      </section>
    );
  }

  if (state === "check" || state === "needs_entry" || state === "waiting") {
    return (
      <section className="panel" data-testid="scan-panel">
        <div className="px-4 py-3 flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-bone-100 flex-1">
            {state === "check" ? "Check this" : state === "needs_entry" ? "Needs entry" : "No items yet"}
          </span>
          {state !== "check" && canScan && (
            <ScanAgainButton purchaseId={purchase.id} label={state === "waiting" ? "Scan" : "Scan again"} />
          )}
          {!editing && (
            <button type="button" onClick={() => setEditing(true)} className="btn-primary text-xs min-h-[36px]">
              {state === "check" ? "Check" : "Type it in"}
            </button>
          )}
        </div>
        {state === "needs_entry" && <p className="px-4 pb-3 text-2xs text-status-lead">{SCAN_FAILED_TEXT}</p>}
        {editing && (
          <ConfirmScan
            purchaseId={purchase.id}
            scan={state === "check" ? scan : null}
            jobs={jobs}
            role={role}
            initialVendor={purchase.vendor}
            initialDate={purchase.purchaseDate}
            initialTax={purchase.tax}
            initialTotal={purchase.total}
            initialTarget={targetForJob(scanJobId, jobs)}
            onDone={done}
            onCancel={() => setEditing(false)}
          />
        )}
      </section>
    );
  }

  if (state === "failed_again") {
    return (
      <section className="panel px-4 py-3 space-y-2" data-testid="scan-panel">
        <p className="text-sm text-status-lead">
          Couldn&apos;t read this receipt right now. What you saved hasn&apos;t changed. Tap Scan again later.
        </p>
        <div className="flex gap-2">
          {canScan && <ScanAgainButton purchaseId={purchase.id} />}
          <button type="button" onClick={keep} disabled={busy} className="btn-ghost text-xs min-h-[36px]">
            Dismiss
          </button>
        </div>
        {err && <div className="form-error">{err}</div>}
      </section>
    );
  }

  if (state === "compare" && scan) {
    const savedSum = Math.round(saved.reduce((s, i) => s + i.amount, 0) * 100) / 100;
    const readSum = scanTotalsMismatch(scan).itemSum;
    const rows: Array<[string, string, string]> = [
      ["Vendor", purchase.vendor ?? "—", scan.vendor ?? "—"],
      ["Date", purchase.purchaseDate || "—", scan.date ?? "—"],
      ["Tax", money(purchase.tax), money(scan.tax)],
      ["Total", money(purchase.total), money(scan.total)],
      [
        "Items",
        `${saved.length} · ${usd.format(savedSum)}`,
        `${scan.items.length} · ${usd.format(readSum)}`,
      ],
    ];
    return (
      <section className="panel" data-testid="scan-compare">
        <div className="px-4 py-3 border-b border-line">
          <h2 className="text-sm font-semibold text-bone-100">New read</h2>
          <p className="text-2xs text-bone-400 mt-0.5">
            Next to what you saved. Nothing changes until you use the new read and save it.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-2xs text-bone-400">
              <th className="text-left font-normal px-4 py-1.5 w-20"></th>
              <th className="text-left font-normal px-2 py-1.5">What you saved</th>
              <th className="text-left font-normal px-2 py-1.5">New read</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, a, b]) => (
              <tr key={label} className="border-t border-line-subtle" data-row={label}>
                <td className="px-4 py-1.5 text-2xs text-bone-400">{label}</td>
                <td className="px-2 py-1.5 text-bone-100 num break-words">{a}</td>
                <td className={`px-2 py-1.5 num break-words ${a !== b ? "text-field-400 font-medium" : "text-bone-100"}`}>
                  {b}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {scan.check?.mismatch && <p className="px-4 pt-2 text-2xs text-status-danger">{SCAN_MISMATCH_TEXT}</p>}

        <button
          type="button"
          onClick={() => setShowItems((v) => !v)}
          aria-expanded={showItems}
          className="w-full flex items-center gap-2 px-4 min-h-[44px] text-left text-2xs text-bone-300 border-t border-line-subtle mt-2"
        >
          {showItems ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          Show items
        </button>
        {showItems && (
          <div className="grid sm:grid-cols-2 gap-3 px-4 pb-3">
            {(
              [
                ["What you saved", saved.map((i) => ({ d: i.description, a: i.amount as number | null }))],
                ["New read", scan.items.map((i) => ({ d: i.description, a: i.amount }))],
              ] as const
            ).map(([title, list]) => (
              <div key={title}>
                <div className="label-eyebrow mb-1">{title}</div>
                <ul className="space-y-0.5">
                  {list.map((i, k) => (
                    <li key={k} className="flex gap-2 text-2xs">
                      <span className="flex-1 min-w-0 text-bone-100 break-words">{i.d}</span>
                      <span className="num text-bone-300 shrink-0">{money(i.a)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {!editing ? (
          <div className="flex flex-wrap gap-2 px-4 py-3 border-t border-line-subtle">
            <button type="button" onClick={keep} disabled={busy} className="btn-secondary text-sm min-h-[44px]">
              Keep what I saved
            </button>
            <button type="button" onClick={() => setEditing(true)} className="btn-primary text-sm min-h-[44px] ml-auto">
              Use the new read
            </button>
          </div>
        ) : (
          <ConfirmScan
            purchaseId={purchase.id}
            scan={scan}
            jobs={jobs}
            role={role}
            replace
            initialTarget={savedTarget(saved)}
            onDone={done}
            onCancel={() => setEditing(false)}
          />
        )}
        {err && (
          <div className="px-4 pb-3">
            <div className="form-error">{err}</div>
          </div>
        )}
      </section>
    );
  }

  // Saved, nothing waiting.
  if (!canScan) return null;
  return (
    <section className="panel px-4 py-3 flex items-center gap-3 flex-wrap" data-testid="scan-panel">
      <p className="text-2xs text-bone-400 flex-1 min-w-48">
        Read the photo again and see it next to what you saved. Nothing changes until you choose.
      </p>
      <ScanAgainButton purchaseId={purchase.id} />
    </section>
  );
}
