"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Check,
  CopyCheck,
  ImagePlus,
  Loader2,
  Paperclip,
  Plus,
  ScanLine,
  SplitSquareHorizontal,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  findDuplicatePurchase,
  mergePurchaseIntoExisting,
  type DuplicateHit,
} from "./duplicate-actions";
import { saveScannedReceipt } from "./purchase-actions";
import {
  ReceiptAssignment,
  resolveTarget,
  type JobOption,
  type ReceiptTarget,
} from "./receipt-assignment";
import type { Role } from "@/lib/permissions/roles";
import { compressImage } from "@/lib/photos/compress";
import {
  scanTotalsMismatch,
  type ScanResult,
} from "@/lib/estimator/receipt-scan";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const round2 = (n: number) => Math.round((n + 1e-9) * 100) / 100;

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type ConfirmRow = {
  key: number;
  description: string;
  sku: string | null;
  qtyStr: string;
  unitStr: string;
  amountStr: string;
};
let rowKey = 1000;

function rowsFromScan(items: ScanResult["items"]): ConfirmRow[] {
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
 * Scan intake (spec §6.2–§6.3): photograph → compress (receipt preset:
 * 2400px/85% — thermal-paper 6pt print must survive) → upload → extract →
 * EDITABLE confirm screen. Nothing persists until Accept. Reject keeps
 * the photos on the purchase and drops into manual entry.
 */
export function ScanReceipt({
  clientId,
  jobs = [],
  role = "owner",
}: {
  clientId: number;
  jobs?: JobOption[];
  role?: Role;
}) {
  const router = useRouter();
  const supabase = createClient();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"idle" | "working" | "confirm">("idle");
  const [workingMsg, setWorkingMsg] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [purchaseId, setPurchaseId] = useState<number | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [parseFailed, setParseFailed] = useState(false);

  async function start(files: FileList | null) {
    if (!files || files.length === 0) return;
    setErr(null);
    setPhase("working");
    let pid: number | null = null;
    try {
      setWorkingMsg("Compressing…");
      const compressed: File[] = [];
      const thumbs: File[] = [];
      for (const f of Array.from(files).slice(0, 6)) {
        const blob = await compressImage(f, 2400, 0.85); // receipt preset
        compressed.push(
          new File([blob], "receipt.jpg", { type: blob.type || "image/jpeg" }),
        );
        // Small rendition for the Receipts list/grid. Best-effort: if it
        // fails, the upload proceeds and readers fall back to the full image.
        try {
          const t = await compressImage(f, 400, 0.7);
          thumbs.push(new File([t], "thumb.jpg", { type: t.type || "image/jpeg" }));
        } catch {
          /* degrade to full-image fallback */
        }
      }

      const { data: purchase, error: pErr } = await supabase
        .from("purchases")
        .insert({
          client_id: clientId,
          vendor: "Receipt (scanning…)",
          purchase_date: todayISO(),
          source: "scan",
        })
        .select("id")
        .single();
      if (pErr || !purchase) throw new Error(pErr?.message ?? "Couldn't start the scan.");
      pid = purchase.id;
      setPurchaseId(purchase.id);

      setWorkingMsg("Uploading…");
      const fd = new FormData();
      for (const f of compressed) fd.append("receipts", f);
      if (thumbs.length === compressed.length) {
        for (const t of thumbs) fd.append("thumbs", t);
      }
      const up = await fetch(`/api/estimator/purchases/${purchase.id}/receipts`, {
        method: "POST",
        body: fd,
      });
      if (!up.ok) {
        const data = await up.json().catch(() => ({}));
        throw new Error(data.error ?? "Upload failed.");
      }

      setWorkingMsg("Reading the receipt…");
      const res = await fetch(`/api/estimator/purchases/${purchase.id}/scan`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Extraction failed.");

      if (data.status === "parse_failed") {
        setScan(null);
        setParseFailed(true);
      } else {
        setScan(data.result as ScanResult);
        setParseFailed(false);
      }
      setPhase("confirm");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Scan failed.");
      // Photos (if uploaded) stay on the purchase — manual entry can pick
      // it up from the "needs items" list below.
      setPhase(pid ? "confirm" : "idle");
      if (pid) {
        setScan(null);
        setParseFailed(true);
      }
      router.refresh();
    } finally {
      if (cameraRef.current) cameraRef.current.value = "";
      if (libraryRef.current) libraryRef.current.value = "";
    }
  }

  function reset() {
    setPhase("idle");
    setPurchaseId(null);
    setScan(null);
    setParseFailed(false);
    router.refresh();
  }

  return (
    <section className="panel">
      <div className="px-4 py-3 flex items-center gap-2 flex-wrap">
        <ScanLine size={14} className="text-field-500 shrink-0" />
        <span className="text-sm font-semibold text-bone-100">Scan a receipt</span>
        <span className="text-2xs text-bone-400">
          photo → items, you review before anything saves
        </span>
        <span className="ml-auto flex gap-2">
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => start(e.target.files)}
          />
          <input
            ref={libraryRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => start(e.target.files)}
          />
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={phase === "working"}
            className="btn-primary text-xs h-8"
          >
            {phase === "working" ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Camera size={11} />
            )}
            Camera
          </button>
          <button
            type="button"
            onClick={() => libraryRef.current?.click()}
            disabled={phase === "working"}
            className="btn-secondary text-xs h-8"
          >
            <ImagePlus size={11} />
            Photos
          </button>
        </span>
      </div>
      {phase === "working" && (
        <div className="px-4 pb-3 text-2xs text-bone-400">{workingMsg}</div>
      )}
      {err && <div className="px-4 pb-3"><div className="form-error">{err}</div></div>}

      {phase === "confirm" && purchaseId !== null && (
        <ConfirmScan
          purchaseId={purchaseId}
          scan={scan}
          parseFailed={parseFailed}
          onDone={reset}
          jobs={jobs}
          role={role}
        />
      )}
    </section>
  );
}

/** The accuracy contract (§6.3): everything editable, nothing silently
 * committed, visible mismatch warning, add/delete rows. Also serves as
 * manual entry when extraction failed (photos already attached). */
export function ConfirmScan({
  purchaseId,
  scan,
  parseFailed,
  onDone,
  jobs = [],
  role = "owner",
  initialVendor,
  initialDate,
  initialTax,
  initialTotal,
}: {
  purchaseId: number;
  scan: ScanResult | null;
  parseFailed: boolean;
  onDone: () => void;
  jobs?: JobOption[];
  role?: Role;
  /** Header the purchase already carries (the "enter items later" path) —
   *  prefilled so the user verifies rather than retypes. */
  initialVendor?: string | null;
  initialDate?: string | null;
  initialTax?: number | null;
  initialTotal?: number | null;
}) {
  const [target, setTarget] = useState<ReceiptTarget>({ kind: "unset" });
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

  const patch = (key: number, p: Partial<ConfirmRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...p } : r)));

  // Duplicate check (§5.1): after extraction, before anything else persists.
  // Re-runs when the user edits vendor/date/total, since those are the match
  // fields. Never blocks — it surfaces choices.
  useEffect(() => {
    const v = vendor.trim();
    const t = parseFloat(totalStr);
    if (!v || !date || !Number.isFinite(t)) {
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
  }, [vendor, date, totalStr, purchaseId]);

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

  async function accept() {
    setErr(null);
    if (!vendor.trim()) return setErr("Who was the vendor?");
    const items = rows.filter((r) => r.description.trim());
    if (items.length === 0) return setErr("Add at least one item.");
    for (const r of items) {
      if (rowAmount(r) === null) {
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
    if (t.kind === "job") return t.assignment === "job_extra" ? "billed" : "in bid";
    return "receipt";
  };

  return (
    <div className="px-4 pb-4 space-y-3 border-t border-line-subtle pt-3">
      {parseFailed && (
        <div className="form-error flex items-start gap-2">
          <TriangleAlert size={13} className="shrink-0 mt-0.5" />
          <span>
            Couldn&apos;t read this one — the photo is saved. Type the items in
            below.
          </span>
        </div>
      )}

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
      <div className="flex flex-wrap gap-2">
        <input
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
          placeholder="Vendor"
          className="flex-1 min-w-40"
        />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-36" />
        <label className="flex items-center gap-1">
          <span className="text-2xs text-bone-400">Tax</span>
          <input
            inputMode="decimal"
            value={taxStr}
            onChange={(e) => setTaxStr(e.target.value)}
            placeholder="0.00"
            aria-label="Receipt tax"
            className="w-20"
          />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-2xs text-bone-400">Total</span>
          <input
            inputMode="decimal"
            value={totalStr}
            onChange={(e) => setTotalStr(e.target.value)}
            placeholder="0.00"
            aria-label="Receipt total"
            className="w-24"
          />
        </label>
        <a
          href={`/api/estimator/purchases/${purchaseId}/receipt`}
          target="_blank"
          rel="noreferrer"
          className="btn-ghost text-xs h-8"
          title="View the photo"
        >
          <Paperclip size={11} />
          Photo
        </a>
      </div>

      {/* Verify the total, not every word (§5.4). Amounts are the reliable
          part of extraction; descriptions are workable-but-imperfect. */}
      {mismatch ? (
        <div className="form-error flex items-start gap-2">
          <TriangleAlert size={13} className="shrink-0 mt-0.5" />
          <span>
            Items add to <span className="num">{usd.format(itemSum)}</span> but
            the receipt says they should be{" "}
            <span className="num">{usd.format(expected ?? 0)}</span>
            {Number.isFinite(statedTax) ? " before tax" : ""} — a line may be
            missing, doubled, or misread. Check the rows below, or accept
            anyway.
          </span>
        </div>
      ) : (
        itemSum > 0 && (
          <div className="flex items-center gap-2 text-2xs text-status-completed">
            <Check size={13} className="shrink-0" />
            <span>
              Items add up to the receipt total
              {Number.isFinite(statedTax) ? " before tax" : ""} —{" "}
              <span className="num">{usd.format(itemSum)}</span>.
            </span>
          </div>
        )
      )}

      {/* Receipt-level assignment: one choice for the whole run (§5.1). */}
      <ReceiptAssignment
        value={target}
        onChange={setTarget}
        jobs={jobs}
        role={role}
        disabled={busy}
      />

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
          <span className="text-2xs text-bone-400">
            Tick the odd ones out, pick above, then
          </span>
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

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setRows((prev) => [...prev, blankConfirmRow()])}
          className="btn-ghost text-xs h-8"
        >
          <Plus size={12} />
          Add row
        </button>
        <span className="num text-sm text-bone-100 ml-auto">
          Items {usd.format(itemSum)}
        </span>
        <button type="button" onClick={onDone} className="btn-secondary text-sm min-h-[42px]">
          Later
        </button>
        <button
          type="button"
          onClick={accept}
          disabled={busy}
          className="btn-primary text-sm min-h-[42px]"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : "Accept"}
        </button>
      </div>
      {err && <div className="form-error">{err}</div>}
    </div>
  );
}
