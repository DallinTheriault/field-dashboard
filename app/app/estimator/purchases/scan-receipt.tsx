"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  CopyCheck,
  ImagePlus,
  Loader2,
  Plus,
  ScanLine,
  SplitSquareHorizontal,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import {
  findDuplicatePurchase,
  mergePurchaseIntoExisting,
  type DuplicateHit,
} from "./duplicate-actions";
import { discardEmptyReceipt, saveScannedReceipt, startReceipt } from "./purchase-actions";
import {
  ReceiptAssignment,
  resolveTarget,
  type JobOption,
  type ReceiptTarget,
} from "./receipt-assignment";
import type { Role } from "@/lib/permissions/roles";
import { prepareReceipt, type PreparedReceipt } from "@/lib/receipts/prepare";
import { scanTotalsMismatch, type StoredScan } from "@/lib/estimator/receipt-scan";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const round2 = (n: number) => Math.round((n + 1e-9) * 100) / 100;

/** What a failed scan says, everywhere it shows. */
export const SCAN_FAILED_TEXT =
  "Couldn't read this receipt right now. Your photo is saved. Type it in or tap Scan again later.";
/** The self-check's note when the items still don't add up. */
export const SCAN_MISMATCH_TEXT = "Items don't add up to the total, check the numbers.";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function uploadReceipt(purchaseId: number, prepared: PreparedReceipt[]): Promise<void> {
  const fd = new FormData();
  for (const p of prepared) {
    fd.append("receipts", p.file);
    // Same order as the files; an empty one means "no thumbnail" (a PDF).
    fd.append("thumbs", p.thumb ?? new File([], "none.jpg", { type: "image/jpeg" }));
  }
  if (prepared.some((p) => p.pieces.length > 0)) {
    for (const p of prepared) for (const piece of p.pieces) fd.append("pieces", piece);
    fd.append("plan", JSON.stringify(prepared.map((p) => p.pieces.length)));
  }
  const up = await fetch(`/api/estimator/purchases/${purchaseId}/receipts`, { method: "POST", body: fd });
  if (!up.ok) {
    const data = await up.json().catch(() => ({}));
    throw new Error(data.error ?? "Upload failed.");
  }
}

/**
 * Ask for a scan of a saved receipt. keepalive: it still goes if the page is
 * closed right after. The answer isn't needed: the list follows the scan.
 */
export function requestScan(purchaseId: number): Promise<unknown> {
  return fetch(`/api/estimator/purchases/${purchaseId}/scan`, { method: "POST", keepalive: true }).catch(
    () => undefined,
  );
}

/**
 * Scan intake: photograph (or pick photos, or an emailed PDF) → readied on
 * the phone → saved → read in the background. Nothing waits on the read: the
 * receipt shows "Reading…", then "Check this" in Receipts to check, where
 * nothing is saved as the purchase until Save.
 */
export function ScanReceipt({
  variant = "panel",
  jobId = null,
}: {
  /** "tile": the big Home button. "inline": the job page's row. */
  variant?: "panel" | "tile" | "inline";
  /** Scanned from a job: checking it starts on that job. */
  jobId?: number | null;
}) {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!saved) return;
    const t = window.setTimeout(() => setSaved(false), variant === "tile" ? 5000 : 8000);
    return () => window.clearTimeout(t);
  }, [saved, variant]);

  async function start(files: FileList | null) {
    if (!files || files.length === 0) return;
    setErr(null);
    setSaved(false);
    setBusy(true);
    let pid: number | null = null;
    try {
      setMsg("Getting the photo ready…");
      const prepared: PreparedReceipt[] = [];
      for (const f of Array.from(files).slice(0, 6)) prepared.push(await prepareReceipt(f));
      setMsg("Saving…");
      const started = await startReceipt({ jobId, date: todayISO(), scan: true });
      if (!started.ok) throw new Error(started.error);
      pid = started.purchaseId;
      await uploadReceipt(pid, prepared);
      void requestScan(pid);
      setSaved(true);
      router.refresh();
    } catch (e) {
      // The photo never made it: don't leave an empty receipt behind.
      if (pid !== null) await discardEmptyReceipt(pid).catch(() => undefined);
      setErr(e instanceof Error ? e.message : "Couldn't save the receipt.");
    } finally {
      setMsg(null);
      setBusy(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (libraryRef.current) libraryRef.current.value = "";
    }
  }

  const inputs = (
    <>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-label="Take a photo of a receipt"
        onChange={(e) => start(e.target.files)}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*,.heic,.heif,application/pdf"
        multiple
        className="hidden"
        aria-label="Choose receipt photos or a PDF"
        onChange={(e) => start(e.target.files)}
      />
    </>
  );
  const status = (
    <>
      {busy && msg && <div className="text-2xs text-bone-400">{msg}</div>}
      {saved && (
        <div role="status" className="flex items-center gap-2 text-2xs text-status-completed">
          <Check size={13} className="shrink-0" />
          Saved. Reading it now. You can leave this page.
        </div>
      )}
      {err && <div className="form-error">{err}</div>}
    </>
  );

  if (variant === "tile") {
    return (
      <>
        {inputs}
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={busy}
          className="home-tile"
        >
          {busy ? <Loader2 size={26} className="animate-spin" /> : <Camera size={26} />}
          <span>{busy ? (msg ?? "Saving…") : "Scan receipt"}</span>
        </button>
        {(saved || err) && (
          <div
            role="status"
            aria-live="polite"
            className="fixed inset-x-0 bottom-[calc(4.5rem_+_env(safe-area-inset-bottom))] md:bottom-6 z-40 flex justify-center px-4"
          >
            <div className="panel max-w-md w-full px-3 py-2.5 shadow-lg space-y-1">
              {saved && (
                <div className="flex items-center gap-2 text-sm text-bone-50">
                  <Check size={14} className="text-status-completed shrink-0" />
                  Receipt saved. It&apos;s being read now.
                </div>
              )}
              {err && (
                <div className="flex items-start gap-2">
                  <div className="form-error flex-1">{err}</div>
                  <button type="button" onClick={() => setErr(null)} className="btn-ghost text-xs min-h-[44px]">
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </>
    );
  }

  const buttons = (
    <span className="ml-auto flex gap-2">
      {inputs}
      <button
        type="button"
        onClick={() => cameraRef.current?.click()}
        disabled={busy}
        className="btn-primary text-xs h-8"
      >
        {busy ? <Loader2 size={11} className="animate-spin" /> : <Camera size={11} />}
        Camera
      </button>
      <button
        type="button"
        onClick={() => libraryRef.current?.click()}
        disabled={busy}
        className="btn-secondary text-xs h-8"
      >
        <ImagePlus size={11} />
        Photos or PDF
      </button>
    </span>
  );

  if (variant === "inline") {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <ScanLine size={13} className="text-field-500 shrink-0" />
          <span className="text-2xs text-bone-400">Scan a receipt: it saves now and reads on its own</span>
          {buttons}
        </div>
        {status}
      </div>
    );
  }

  return (
    <section className="panel">
      <div className="px-4 py-3 flex items-center gap-2 flex-wrap">
        <ScanLine size={14} className="text-field-500 shrink-0" />
        <span className="text-sm font-semibold text-bone-100">Scan a receipt</span>
        <span className="text-2xs text-bone-400">saves now, reads on its own, you check it</span>
        {buttons}
      </div>
      {(busy || saved || err) && <div className="px-4 pb-3 space-y-1">{status}</div>}
    </section>
  );
}

/* ---------- the check screen ---------- */

type ConfirmRow = {
  key: number;
  description: string;
  sku: string | null;
  qtyStr: string;
  unitStr: string;
  amountStr: string;
};
let rowKey = 1000;

function rowsFromScan(items: StoredScan["items"]): ConfirmRow[] {
  return items.map((it) => ({
    key: ++rowKey,
    description: it.description,
    sku: it.sku,
    qtyStr: it.qty === null ? "" : String(it.qty),
    unitStr: it.unit_price === null ? "" : String(it.unit_price),
    amountStr: it.amount === null ? "" : String(it.amount),
  }));
}

const blankConfirmRow = (): ConfirmRow => ({
  key: ++rowKey,
  description: "",
  sku: null,
  qtyStr: "1",
  unitStr: "",
  amountStr: "",
});

function rowAmount(r: ConfirmRow): number | null {
  const amt = parseFloat(r.amountStr);
  if (Number.isFinite(amt)) return round2(amt);
  const unit = parseFloat(r.unitStr);
  const qty = parseFloat(r.qtyStr);
  if (Number.isFinite(unit)) {
    return round2(unit * (Number.isFinite(qty) && qty > 0 ? qty : 1));
  }
  return null;
}

/**
 * Check a read (or type a receipt in): vendor, date, tax, total and job at
 * the top, filled in from the read; the items folded underneath; one tap to
 * save. Everything stays editable and nothing is saved until Save (§6.3).
 * `replace`: "Use the new read" on a purchase already saved — Save swaps its
 * items for these.
 */
export function ConfirmScan({
  purchaseId,
  scan,
  onDone,
  onCancel,
  jobs = [],
  role = "owner",
  initialVendor,
  initialDate,
  initialTax,
  initialTotal,
  initialTarget,
  replace = false,
  canViewPhoto = true,
}: {
  purchaseId: number;
  scan: StoredScan | null;
  onDone: () => void;
  /** "Later": close without saving (defaults to onDone). */
  onCancel?: () => void;
  jobs?: JobOption[];
  role?: Role;
  /** Header the purchase already carries — prefilled so the user verifies
   *  rather than retypes. The read wins where it has a value. */
  initialVendor?: string | null;
  initialDate?: string | null;
  initialTax?: number | null;
  initialTotal?: number | null;
  /** Where the receipt goes, preselected (the job it was scanned from). */
  initialTarget?: ReceiptTarget;
  replace?: boolean;
  /** The photo route is owner/manager only. */
  canViewPhoto?: boolean;
}) {
  const [target, setTarget] = useState<ReceiptTarget>(initialTarget ?? { kind: "unset" });
  const [splitOpen, setSplitOpen] = useState(false);
  const [receiptDefault, setReceiptDefault] = useState<ReceiptTarget>({ kind: "unset" });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rowTargets, setRowTargets] = useState<Map<number, ReceiptTarget>>(new Map());
  const [vendor, setVendor] = useState(scan?.vendor ?? initialVendor ?? "");
  const [date, setDate] = useState(scan?.date ?? initialDate?.slice(0, 10) ?? todayISO());
  const [taxStr, setTaxStr] = useState(
    scan?.tax != null ? String(scan.tax) : initialTax != null ? String(initialTax) : "",
  );
  const [totalStr, setTotalStr] = useState(
    scan?.total != null ? String(scan.total) : initialTotal != null ? String(initialTotal) : "",
  );
  const [rows, setRows] = useState<ConfirmRow[]>(
    scan && scan.items.length > 0 ? rowsFromScan(scan.items) : [blankConfirmRow()],
  );
  // Folded when there's a read to trust; open when typing it in.
  const [itemsOpen, setItemsOpen] = useState(!(scan && scan.items.length > 0));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dupe, setDupe] = useState<DuplicateHit | null>(null);
  const [dupeDismissed, setDupeDismissed] = useState(false);
  const [merging, setMerging] = useState(false);
  const router = useRouter();

  const statedTotal = parseFloat(totalStr);
  const statedTax = parseFloat(taxStr);
  const { itemSum, expected, mismatch } = scanTotalsMismatch({
    total: Number.isFinite(statedTotal) ? statedTotal : null,
    tax: Number.isFinite(statedTax) ? statedTax : null,
    items: rows.map((r) => ({ amount: rowAmount(r) })),
  });
  const itemCount = rows.filter((r) => r.description.trim()).length;

  const patch = (key: number, p: Partial<ConfirmRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...p } : r)));

  // Duplicate check (§5.1): before anything persists. Re-runs when the user
  // edits vendor/date/total, since those are the match fields. Never blocks.
  // Not when replacing: that IS the saved purchase.
  useEffect(() => {
    const v = vendor.trim();
    const t = parseFloat(totalStr);
    if (replace || !v || !date || !Number.isFinite(t)) {
      setDupe(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const res = await findDuplicatePurchase({
        vendor: v,
        purchaseDate: date,
        total: t,
        excludePurchaseId: purchaseId,
      });
      if (!cancelled && res.ok) setDupe(res.data ?? null);
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [vendor, date, totalStr, purchaseId, replace]);

  async function mergePhotos(alsoItems: boolean) {
    if (!dupe) return;
    setErr(null);
    setMerging(true);
    const items = rows
      .filter((r) => r.description.trim() && rowAmount(r) !== null)
      .map((r) => {
        const q = parseFloat(r.qtyStr);
        const u = parseFloat(r.unitStr);
        return {
          description: r.description.trim(),
          sku: r.sku,
          qty: Number.isFinite(q) && q > 0 ? q : null,
          unitPrice: Number.isFinite(u) ? u : null,
          amount: rowAmount(r)!,
        };
      });
    const res = await mergePurchaseIntoExisting({
      placeholderId: purchaseId,
      targetId: dupe.id,
      alsoMoveItems: alsoItems,
      items,
    });
    setMerging(false);
    if (!res.ok) return setErr(res.error);
    router.push(`/app/estimator/purchases/${dupe.id}`);
  }

  async function save() {
    setErr(null);
    if (!vendor.trim()) return setErr("Who was the vendor?");
    const items = rows.filter((r) => r.description.trim());
    if (items.length === 0) {
      setItemsOpen(true);
      return setErr("Add at least one item.");
    }
    for (const r of items) {
      if (rowAmount(r) === null) {
        setItemsOpen(true);
        return setErr(`"${r.description.trim()}": needs an amount (or $/ea).`);
      }
    }
    // The receipt-level choice governs everything unless a row was split off.
    // `unassigned` stays legal: declining to choose is still allowed.
    const receipt = resolveTarget(target) ?? { assignment: "unassigned" as const, jobId: null };
    setBusy(true);
    try {
      const tax = parseFloat(taxStr);
      const total = parseFloat(totalStr);
      const r = await saveScannedReceipt({
        purchaseId,
        assignment: receipt.assignment,
        jobId: receipt.jobId,
        vendor: vendor.trim(),
        date: date || todayISO(),
        tax: Number.isFinite(tax) ? round2(tax) : null,
        total: Number.isFinite(total) ? round2(total) : null,
        replace,
        items: items.map((row) => {
          const qty = parseFloat(row.qtyStr);
          const unit = parseFloat(row.unitStr);
          const override = splitOpen ? rowTargets.get(row.key) : undefined;
          const res = override ? resolveTarget(override) : null;
          return {
            description: row.description.trim(),
            sku: row.sku,
            qty: Number.isFinite(qty) && qty > 0 ? qty : null,
            unitPrice: Number.isFinite(unit) ? round2(unit) : null,
            amount: rowAmount(row)!,
            ...(res ? { assignment: res.assignment, jobId: res.jobId } : {}),
          };
        }),
      });
      if (!r.ok) throw new Error(r.error);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Apply the currently-shown choice to the checked rows (§5.3), then snap the
   * control back to the receipt-level default. Without the restore, picking an
   * assignment for two odd items would silently re-bucket the whole receipt.
   */
  function applyToSelected() {
    if (selected.size === 0 || target.kind === "unset") return;
    setRowTargets((prev) => {
      const next = new Map(prev);
      for (const key of selected) next.set(key, target);
      return next;
    });
    setSelected(new Set());
    setTarget(receiptDefault);
  }

  const targetChip = (t: ReceiptTarget | undefined): string => {
    if (!t) return "receipt";
    if (t.kind === "stock") return "stock";
    if (t.kind === "internal") return "absorbed";
    if (t.kind === "job") return t.assignment === "job_extra" ? "bill to customer" : "included";
    return "receipt";
  };

  const field = (label: string, input: React.ReactNode) => (
    <label className="field-group min-w-0">
      <span className="field-label">{label}</span>
      {input}
    </label>
  );

  return (
    <div className="px-4 pb-4 space-y-3 border-t border-line-subtle pt-3" data-testid="confirm-scan">
      {/* Possible duplicate (§5.3). Three explicit actions, nothing
          preselected, never a hard stop. */}
      {dupe && !dupeDismissed && (
        <div className="panel px-3 py-2.5 border-status-lead/50 bg-status-lead/[0.06] space-y-2">
          <div className="flex items-start gap-2">
            <CopyCheck size={13} className="text-status-lead shrink-0 mt-0.5" />
            <p className="text-2xs text-bone-100 leading-relaxed">
              <span className="font-medium">Possible duplicate.</span> You
              already logged{" "}
              <span className="text-bone-50">{dupe.vendor}</span>,{" "}
              <span className="num">{dupe.purchaseDate}</span>
              {dupe.total !== null && (
                <>
                  , <span className="num">{usd.format(dupe.total)}</span>
                </>
              )}{" "}
              with <span className="num">{dupe.itemCount}</span> item
              {dupe.itemCount === 1 ? "" : "s"}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/app/estimator/purchases/${dupe.id}`}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary text-xs h-8"
            >
              View it
            </a>
            <button
              type="button"
              onClick={() => mergePhotos(false)}
              disabled={merging}
              className="btn-secondary text-xs h-8"
            >
              {merging ? <Loader2 size={11} className="animate-spin" /> : null}
              Add these photos to it
            </button>
            {dupe.itemCount === 0 && (
              <button
                type="button"
                onClick={() => mergePhotos(true)}
                disabled={merging}
                className="btn-secondary text-xs h-8"
              >
                …and add these items
              </button>
            )}
            <button
              type="button"
              onClick={() => setDupeDismissed(true)}
              className="btn-ghost text-xs h-8"
            >
              Save as separate purchase
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="col-span-2">
          {field(
            "Vendor",
            <input
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="e.g. Home Depot"
              aria-label="Vendor"
              className="w-full min-h-[44px]"
            />,
          )}
        </div>
        <div className="col-span-2 sm:col-span-2">
          {field(
            "Date",
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Date"
              className="w-full min-h-[44px]"
            />,
          )}
        </div>
        {field(
          "Tax",
          <input
            inputMode="decimal"
            value={taxStr}
            onChange={(e) => setTaxStr(e.target.value)}
            placeholder="0.00"
            aria-label="Receipt tax"
            className="w-full min-h-[44px]"
          />,
        )}
        {field(
          "Total",
          <input
            inputMode="decimal"
            value={totalStr}
            onChange={(e) => setTotalStr(e.target.value)}
            placeholder="0.00"
            aria-label="Receipt total"
            className="w-full min-h-[44px]"
          />,
        )}
        {canViewPhoto && (
          <a
            href={`/api/estimator/purchases/${purchaseId}/receipt`}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost text-xs min-h-[44px] self-end col-span-2 justify-start"
          >
            View the photo
          </a>
        )}
      </div>

      {/* Receipt-level assignment: one choice for the whole run (§5.1). */}
      <ReceiptAssignment value={target} onChange={setTarget} jobs={jobs} role={role} disabled={busy} />

      {/* Verify the total, not every word (§5.4). */}
      {mismatch ? (
        <div className="form-error flex items-start gap-2" data-testid="scan-mismatch">
          <TriangleAlert size={13} className="shrink-0 mt-0.5" />
          <span>
            {SCAN_MISMATCH_TEXT}{" "}
            <span className="text-bone-300 num">
              Items {usd.format(itemSum)} · receipt {usd.format(expected ?? 0)}
              {Number.isFinite(statedTax) ? " before tax" : ""}
            </span>
          </span>
        </div>
      ) : (
        itemSum > 0 && (
          <div className="flex items-center gap-2 text-2xs text-status-completed">
            <Check size={13} className="shrink-0" />
            <span>
              Items add up to the receipt
              {Number.isFinite(statedTax) ? " before tax" : ""}:{" "}
              <span className="num">{usd.format(itemSum)}</span>.
            </span>
          </div>
        )
      )}

      <button
        type="button"
        onClick={() => setItemsOpen((v) => !v)}
        aria-expanded={itemsOpen}
        className="w-full flex items-center gap-2 text-left text-sm text-bone-100 min-h-[44px] rounded-sm px-2 bg-ink-2 shadow-inset-line"
      >
        {itemsOpen ? <ChevronDown size={14} className="text-bone-400" /> : <ChevronRight size={14} className="text-bone-400" />}
        <span className="flex-1">
          {itemCount} item{itemCount === 1 ? "" : "s"}
        </span>
        <span className="num">{usd.format(itemSum)}</span>
      </button>

      {itemsOpen && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() =>
              setSplitOpen((v) => {
                if (!v) setReceiptDefault(target);
                return !v;
              })
            }
            className="btn-ghost text-xs h-8"
          >
            <SplitSquareHorizontal size={12} />
            {splitOpen ? "Done splitting" : "Split this receipt"}
          </button>

          {splitOpen && (
            <div className="flex flex-wrap items-center gap-2 bg-ink-2 rounded-sm shadow-inset-line p-2">
              <span className="text-2xs text-bone-400">Tick the odd ones out, pick above, then</span>
              <button
                type="button"
                onClick={applyToSelected}
                disabled={selected.size === 0 || target.kind === "unset"}
                className="btn-secondary text-xs h-8"
              >
                Apply to {selected.size} selected
              </button>
              {rowTargets.size > 0 && (
                <button
                  type="button"
                  onClick={() => setRowTargets(new Map())}
                  className="btn-ghost text-xs h-8 ml-auto"
                >
                  Clear overrides
                </button>
              )}
            </div>
          )}

          <ul className="space-y-1.5">
            {rows.map((r) => (
              <li key={r.key} className="bg-ink-2 rounded-sm shadow-inset-line p-2 space-y-1.5">
                <div className="flex gap-2">
                  {splitOpen && (
                    <input
                      type="checkbox"
                      checked={selected.has(r.key)}
                      onChange={(e) =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(r.key);
                          else next.delete(r.key);
                          return next;
                        })
                      }
                      aria-label={`Select ${r.description || "item"}`}
                      className="mt-2 shrink-0"
                    />
                  )}
                  <input
                    value={r.description}
                    onChange={(e) => patch(r.key, { description: e.target.value })}
                    placeholder="Item"
                    aria-label="Item"
                    className="flex-1 min-w-0 text-sm"
                  />
                  {splitOpen && rowTargets.has(r.key) && (
                    <span className="chip normal-case tracking-normal shrink-0 self-center border-field-500/40 text-field-400">
                      {targetChip(rowTargets.get(r.key))}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                    className="text-bone-500 hover:text-status-danger p-1"
                    aria-label="Remove row"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <label className="flex items-center gap-1">
                    <span className="text-2xs text-bone-400">qty</span>
                    <input
                      inputMode="decimal"
                      value={r.qtyStr}
                      onChange={(e) => patch(r.key, { qtyStr: e.target.value })}
                      aria-label="Quantity"
                      className="w-12"
                    />
                  </label>
                  <label className="flex items-center gap-1">
                    <span className="text-2xs text-bone-400">$/ea</span>
                    <input
                      inputMode="decimal"
                      value={r.unitStr}
                      onChange={(e) => patch(r.key, { unitStr: e.target.value })}
                      aria-label="Unit price"
                      className="w-20"
                    />
                  </label>
                  <label className="flex items-center gap-1">
                    <span className="text-2xs text-bone-400">amount</span>
                    <input
                      inputMode="decimal"
                      value={r.amountStr}
                      onChange={(e) => patch(r.key, { amountStr: e.target.value })}
                      placeholder={rowAmount(r) === null ? "" : String(rowAmount(r))}
                      aria-label="Amount"
                      className="w-20"
                    />
                  </label>
                  {r.sku && (
                    <span className="text-2xs text-bone-500 truncate max-w-40" title={r.sku}>
                      {r.sku}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setRows((prev) => [...prev, blankConfirmRow()])}
            className="btn-ghost text-xs h-8"
          >
            <Plus size={12} />
            Add row
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button type="button" onClick={onCancel ?? onDone} className="btn-secondary text-sm min-h-[44px]">
          Later
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="btn-primary text-sm min-h-[44px] flex-1 sm:flex-none sm:ml-auto sm:min-w-[140px]"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : replace ? "Save the new read" : "Save"}
        </button>
      </div>
      {err && <div className="form-error">{err}</div>}
    </div>
  );
}
