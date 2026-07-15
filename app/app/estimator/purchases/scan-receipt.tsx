"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  ImagePlus,
  Loader2,
  Paperclip,
  Plus,
  ScanLine,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
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
export function ScanReceipt({ clientId }: { clientId: number }) {
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
      for (const f of Array.from(files).slice(0, 6)) {
        const blob = await compressImage(f, 2400, 0.85); // receipt preset
        compressed.push(
          new File([blob], "receipt.jpg", { type: blob.type || "image/jpeg" }),
        );
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
}: {
  purchaseId: number;
  scan: ScanResult | null;
  parseFailed: boolean;
  onDone: () => void;
}) {
  const supabase = createClient();
  const [vendor, setVendor] = useState(scan?.vendor ?? "");
  const [date, setDate] = useState(scan?.date ?? todayISO());
  const [taxStr, setTaxStr] = useState(scan?.tax === null || !scan ? "" : String(scan.tax));
  const [totalStr, setTotalStr] = useState(scan?.total === null || !scan ? "" : String(scan.total));
  const [rows, setRows] = useState<ConfirmRow[]>(
    scan && scan.items.length > 0 ? rowsFromScan(scan.items) : [blankConfirmRow()],
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const statedTotal = parseFloat(totalStr);
  const statedTax = parseFloat(taxStr);
  const { itemSum, expected, mismatch } = scanTotalsMismatch({
    total: Number.isFinite(statedTotal) ? statedTotal : null,
    tax: Number.isFinite(statedTax) ? statedTax : null,
    items: rows.map((r) => ({ amount: rowAmount(r) })),
  });

  const patch = (key: number, p: Partial<ConfirmRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...p } : r)));

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
    setBusy(true);
    try {
      const tax = parseFloat(taxStr);
      const total = parseFloat(totalStr);
      const sub = Number.isFinite(total) && Number.isFinite(tax) ? round2(total - tax) : null;
      const { error: uErr } = await supabase
        .from("purchases")
        .update({
          vendor: vendor.trim(),
          purchase_date: date || todayISO(),
          subtotal: sub,
          tax: Number.isFinite(tax) ? round2(tax) : null,
          total: Number.isFinite(total) ? round2(total) : null,
        })
        .eq("id", purchaseId);
      if (uErr) throw new Error(uErr.message);

      const { data: purchase } = await supabase
        .from("purchases")
        .select("client_id")
        .eq("id", purchaseId)
        .single();

      const { error: iErr } = await supabase.from("expenses").insert(
        items.map((r) => {
          const qty = parseFloat(r.qtyStr);
          const unit = parseFloat(r.unitStr);
          return {
            client_id: purchase!.client_id,
            purchase_id: purchaseId,
            expense_date: date || todayISO(),
            category: "Materials & supplies",
            description: r.description.trim(),
            sku: r.sku,
            qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
            unit_price: Number.isFinite(unit) ? round2(unit) : null,
            amount: rowAmount(r)!,
            assignment: "unassigned", // assign from the couch (§2.1)
          };
        }),
      );
      if (iErr) throw new Error(iErr.message);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

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

      {mismatch && (
        <div className="form-error flex items-start gap-2">
          <TriangleAlert size={13} className="shrink-0 mt-0.5" />
          <span>
            Items add to <span className="num">{usd.format(itemSum)}</span> but
            the receipt says they should be{" "}
            <span className="num">{usd.format(expected ?? 0)}</span>
            {Number.isFinite(statedTax) ? " before tax" : ""} — a line may be
            missing, doubled, or misread.
          </span>
        </div>
      )}

      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.key} className="bg-ink-2 rounded-sm shadow-inset-line p-2 space-y-1.5">
            <div className="flex gap-2">
              <input
                value={r.description}
                onChange={(e) => patch(r.key, { description: e.target.value })}
                placeholder="Item"
                className="flex-1 min-w-0 text-sm"
              />
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
                  className="w-12"
                />
              </label>
              <label className="flex items-center gap-1">
                <span className="text-2xs text-bone-400">$/ea</span>
                <input
                  inputMode="decimal"
                  value={r.unitStr}
                  onChange={(e) => patch(r.key, { unitStr: e.target.value })}
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
