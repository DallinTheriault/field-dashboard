"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Check,
  ImagePlus,
  Loader2,
  Lock,
  Plus,
  Receipt,
  ScanLine,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { compressImage } from "@/lib/photos/compress";
import {
  scanTotalsMismatch,
  type ScanResult,
} from "@/lib/estimator/receipt-scan";
import {
  ASSIGNMENT_LABELS,
  splitMaterials,
  type Assignment,
} from "@/lib/estimator/expenses";
import {
  allowedAssignmentsForRole,
  canReassignExpense,
} from "@/lib/estimator/expense-roles";
import type { Role } from "@/lib/permissions/roles";
import { setItemAssignment } from "../../estimator/purchases/purchase-actions";
import {
  createJobExpense,
  saveJobScanItems,
  startJobReceiptScan,
  type ScanItemInput,
} from "./job-expense-actions";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const round2 = (n: number) => Math.round((n + 1e-9) * 100) / 100;

export type JobExpenseItem = {
  id: number;
  description: string;
  amount: number;
  assignment: string;
  /** Invoice number when frozen onto a finalized invoice; null when editable. */
  lockedToInvoice?: string | null;
};

const CHIP_SHORT: Record<string, string> = {
  unassigned: "unassigned",
  job_in_bid: "in bid",
  job_extra: "extra",
  job_internal: "internal",
  stock: "stock",
};

/** The four destinations offered inline, in the order the money moves:
 *  covered by the bid → billed on top → eaten → not this job's cost at all. */
const REASSIGN_ORDER: Assignment[] = ["job_in_bid", "job_extra", "job_internal", "stock"];

const REASSIGN_LABELS: Record<string, string> = {
  job_in_bid: "In bid",
  job_extra: "Extra",
  job_internal: "Internal",
  stock: "Stock",
};

/** What just happened, in the user's terms. Stock and internal get the
 *  consequence spelled out: stock makes the row vanish from the job, and
 *  internal silently moves money into the absorbed figure. */
const MOVE_TOAST: Record<string, string> = {
  job_in_bid: "Moved to in bid",
  job_extra: "Moved to extra — billable",
  job_internal: "Moved to internal — now absorbed",
  stock: "Moved to stock — off this job",
};

/**
 * Job-level expense capture (Business/job-expense handoff §2). Scan a receipt
 * or log a manual expense from inside the job; assignment defaults to in-bid
 * and is changeable within the caller's role. Writes the SAME purchases +
 * expenses rows as the Expenses page — only the pre-filled job_id and entry
 * point differ. Deliberately shows NO margin, hours, variance, or totals:
 * that's JobActuals (owner/manager). Members get exactly this surface.
 */
export function JobExpenseCapture({
  jobId,
  role,
  receiptAiEnabled,
  items,
}: {
  jobId: number;
  role: Role;
  receiptAiEnabled: boolean;
  items: JobExpenseItem[];
}) {
  const router = useRouter();
  const options = allowedAssignmentsForRole(role);
  const canReassign = canReassignExpense(role);

  // Local mirror of the server list so a reassignment shows immediately —
  // including in the split below — instead of waiting on the refresh round
  // trip. Re-syncs whenever the server sends a new list, so the server stays
  // the source of truth and a failed write can never leave a phantom row.
  const [rows, setRows] = useState<JobExpenseItem[]>(items);
  useEffect(() => setRows(items), [items]);

  const [openId, setOpenId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function reassign(item: JobExpenseItem, next: Assignment) {
    setErr(null);
    setBusyId(item.id);
    // Same action the Expenses page calls — one ledger, one set of guards.
    const r = await setItemAssignment(item.id, {
      assignment: next,
      jobId: next === "stock" ? null : jobId,
    });
    setBusyId(null);
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    setRows((prev) =>
      next === "stock"
        ? prev.filter((x) => x.id !== item.id) // stock leaves the job entirely
        : prev.map((x) => (x.id === item.id ? { ...x, assignment: next } : x)),
    );
    setOpenId(null);
    setToast(MOVE_TOAST[next] ?? "Moved");
    router.refresh();
  }

  const split = splitMaterials(rows);
  return (
    <div className="panel px-4 py-3 mb-5 space-y-4">
      <div className="flex items-center gap-2">
        <Receipt size={13} className="text-field-500" />
        <div className="label-eyebrow">Job expenses</div>
      </div>

      {receiptAiEnabled && <JobScan jobId={jobId} options={options} />}
      <ManualExpense jobId={jobId} options={options} />

      {/* Absorbed vs recovered (§6.2). Zeros render so absence is visible;
          stock is excluded — it's a business asset, not a job cost. */}
      <div className="flex flex-wrap items-center gap-x-2 text-2xs text-bone-400 pt-2 border-t border-line-subtle">
        <span>Materials:</span>
        <span className="num text-bone-100">{usd.format(split.inBid)}</span>
        <span>in bid ·</span>
        <span className="num text-bone-100">{usd.format(split.billed)}</span>
        <span>billed ·</span>
        <span className="num text-status-lead">{usd.format(split.absorbed)}</span>
        <span>absorbed</span>
      </div>

      {err && <div className="form-error">{err}</div>}

      {rows.length > 0 && (
        <ul className="space-y-1 pt-2 border-t border-line-subtle">
          {rows.map((it) => (
            <ExpenseRow
              key={it.id}
              item={it}
              canReassign={canReassign}
              options={options}
              open={openId === it.id}
              busy={busyId === it.id}
              onToggle={() => setOpenId((cur) => (cur === it.id ? null : it.id))}
              onPick={(a) => reassign(it, a)}
            />
          ))}
        </ul>
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          // Clears the mobile nav (h-16 + safe area, z-30) the way the estimate
          // builder's action bar does — a confirmation that covers the nav
          // trades one moment of reassurance for a moment of lost navigation.
          className="fixed inset-x-0 bottom-[calc(4.5rem_+_env(safe-area-inset-bottom))] md:bottom-6 z-40 flex justify-center px-4 pointer-events-none"
        >
          <span className="flex items-center gap-2 rounded-md bg-ink-1 border border-line-strong shadow-lg px-3 py-2 text-sm text-bone-50">
            <Check size={13} className="text-status-completed shrink-0" />
            {toast}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * One ledger line. Tapping it opens the reassignment control in place — the
 * same four destinations the Expenses page offers, writing through the same
 * action. An item frozen onto a finalized invoice shows WHY it can't move
 * rather than a control that the server would refuse.
 */
function ExpenseRow({
  item,
  canReassign,
  options,
  open,
  busy,
  onToggle,
  onPick,
}: {
  item: JobExpenseItem;
  canReassign: boolean;
  options: Assignment[];
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onPick: (a: Assignment) => void;
}) {
  // Pending destination, discarded when the row collapses so reopening always
  // starts from what the item actually is.
  const [pick, setPick] = useState<Assignment | null>(null);
  useEffect(() => {
    if (!open) setPick(null);
  }, [open]);

  const locked = !!item.lockedToInvoice;
  const chip = (
    <span
      className={`chip normal-case tracking-normal shrink-0 ${
        item.assignment === "job_extra"
          ? "border-status-danger/40 text-status-danger"
          : item.assignment === "unassigned"
            ? "border-status-lead/50 text-status-lead"
            : "border-line-strong text-bone-400"
      }`}
    >
      {CHIP_SHORT[item.assignment] ?? item.assignment}
    </span>
  );
  const amount = (
    <span className="num text-bone-100 w-20 text-right shrink-0">
      {usd.format(item.amount)}
    </span>
  );

  if (locked) {
    return (
      <li className="flex items-start gap-2 text-sm">
        <span className="flex-1 min-w-0 leading-snug">
          <span className="text-bone-100 line-clamp-2">{item.description}</span>
          <span className="flex items-center gap-1 text-2xs text-bone-500 mt-0.5">
            <Lock size={9} className="shrink-0" />
            on invoice {item.lockedToInvoice} — locked
          </span>
        </span>
        {chip}
        {amount}
      </li>
    );
  }

  if (!canReassign) {
    return (
      <li className="flex items-start gap-2 text-sm">
        <span className="flex-1 min-w-0 text-bone-100 line-clamp-2 leading-snug">
          {item.description}
        </span>
        {chip}
        {amount}
      </li>
    );
  }

  const choices = REASSIGN_ORDER.filter((a) => options.includes(a));
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`Reassign ${item.description}`}
        className="flex items-start gap-2 text-sm w-full text-left py-1 -my-0.5 rounded-sm hover:bg-ink-2"
      >
        <span className="flex-1 min-w-0 text-bone-100 line-clamp-2 leading-snug">
          {item.description}
        </span>
        {chip}
        {amount}
      </button>

      {open && (
        <div className="flex flex-wrap items-center gap-1.5 pb-2 pt-1">
          {choices.map((a) => {
            const selected = a === (pick ?? item.assignment);
            return (
              <button
                key={a}
                type="button"
                disabled={busy}
                onClick={() => setPick(a)}
                aria-label={`Assign to ${REASSIGN_LABELS[a]}`}
                aria-pressed={selected}
                className={`chip normal-case tracking-normal min-h-[34px] ${
                  selected
                    ? "border-field-500/60 text-bone-100"
                    : "border-line-strong text-bone-300 hover:text-bone-50 hover:border-field-500/50"
                }`}
              >
                {REASSIGN_LABELS[a]}
              </button>
            );
          })}
          <button
            type="button"
            // Deliberate second step: moving to stock makes the row disappear,
            // so the destination is chosen and then committed, never in one tap.
            disabled={busy || !pick || pick === item.assignment}
            onClick={() => pick && onPick(pick)}
            className="btn-secondary text-xs min-h-[34px] ml-auto"
          >
            {busy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
            Apply
          </button>
        </div>
      )}
    </li>
  );
}

function AssignmentSelect({
  value,
  onChange,
  options,
}: {
  value: Assignment;
  onChange: (a: Assignment) => void;
  options: Assignment[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Assignment)}
      className="text-sm"
      aria-label="Assignment"
    >
      {options.map((a) => (
        <option key={a} value={a}>
          {ASSIGNMENT_LABELS[a]}
        </option>
      ))}
    </select>
  );
}

/* ---------- manual single expense ---------- */

function ManualExpense({
  jobId,
  options,
}: {
  jobId: number;
  options: Assignment[];
}) {
  const router = useRouter();
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("1");
  const [assignment, setAssignment] = useState<Assignment>("job_in_bid");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const p = parseFloat(price);
  const q = parseFloat(qty);
  const preview =
    Number.isFinite(p) && p >= 0
      ? round2(p * (Number.isFinite(q) && q > 0 ? q : 1))
      : null;

  async function add() {
    setErr(null);
    setBusy(true);
    const r = await createJobExpense({
      jobId,
      description: desc,
      pricePerEach: parseFloat(price),
      qty: parseFloat(qty),
      assignment,
    });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setDesc("");
    setPrice("");
    setQty("1");
    setAssignment("job_in_bid");
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="label-eyebrow text-bone-400">Log an expense</div>
      <input
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="Item (e.g. Paint, 2 gal)"
        className="w-full"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">
          <span className="text-2xs text-bone-400">$/ea</span>
          <input
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
            className="w-20"
          />
        </label>
        <span className="text-bone-500">×</span>
        <input
          inputMode="decimal"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="1"
          className="w-12"
          aria-label="Quantity"
        />
        {preview !== null && (
          <span className="num text-2xs text-bone-300">= {usd.format(preview)}</span>
        )}
        <AssignmentSelect value={assignment} onChange={setAssignment} options={options} />
        <button
          type="button"
          onClick={add}
          disabled={busy}
          aria-label="Log expense"
          className="btn-secondary shrink-0 min-h-[42px] ml-auto"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          Add
        </button>
      </div>
      {err && <div className="form-error">{err}</div>}
    </div>
  );
}

/* ---------- receipt scan ---------- */

type ConfirmRow = {
  key: number;
  description: string;
  sku: string | null;
  qtyStr: string;
  unitStr: string;
  amountStr: string;
};
let rowKey = 5000;

function rowAmount(r: ConfirmRow): number | null {
  const amt = parseFloat(r.amountStr);
  if (Number.isFinite(amt)) return round2(amt);
  const unit = parseFloat(r.unitStr);
  const q = parseFloat(r.qtyStr);
  if (Number.isFinite(unit)) {
    return round2(unit * (Number.isFinite(q) && q > 0 ? q : 1));
  }
  return null;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function JobScan({ jobId, options }: { jobId: number; options: Assignment[] }) {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"idle" | "working" | "confirm">("idle");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [purchaseId, setPurchaseId] = useState<number | null>(null);

  const [vendor, setVendor] = useState("");
  const [date, setDate] = useState(todayISO());
  const [taxStr, setTaxStr] = useState("");
  const [totalStr, setTotalStr] = useState("");
  const [rows, setRows] = useState<ConfirmRow[]>([]);
  const [assignment, setAssignment] = useState<Assignment>("job_in_bid");
  const [busy, setBusy] = useState(false);

  function seedFromScan(scan: ScanResult | null) {
    setVendor(scan?.vendor ?? "");
    setDate(scan?.date ?? todayISO());
    setTaxStr(scan?.tax == null ? "" : String(scan.tax));
    setTotalStr(scan?.total == null ? "" : String(scan.total));
    setRows(
      scan && scan.items.length > 0
        ? scan.items.map((it) => ({
            key: ++rowKey,
            description: it.description,
            sku: it.sku,
            qtyStr: it.qty == null ? "" : String(it.qty),
            unitStr: it.unit_price == null ? "" : String(it.unit_price),
            amountStr: it.amount == null ? "" : String(it.amount),
          }))
        : [{ key: ++rowKey, description: "", sku: null, qtyStr: "1", unitStr: "", amountStr: "" }],
    );
  }

  async function start(files: FileList | null) {
    if (!files || files.length === 0) return;
    setErr(null);
    setPhase("working");
    try {
      setMsg("Starting…");
      const started = await startJobReceiptScan(jobId);
      if (!started.ok) throw new Error(started.error);
      const pid = started.data!.purchaseId;
      setPurchaseId(pid);

      setMsg("Compressing…");
      const compressed: File[] = [];
      const thumbs: File[] = [];
      for (const f of Array.from(files).slice(0, 6)) {
        const blob = await compressImage(f, 2400, 0.85); // receipt preset
        compressed.push(new File([blob], "receipt.jpg", { type: blob.type || "image/jpeg" }));
        // Best-effort small rendition for the Receipts list (never fatal).
        try {
          const t = await compressImage(f, 400, 0.7);
          thumbs.push(new File([t], "thumb.jpg", { type: t.type || "image/jpeg" }));
        } catch {
          /* degrade to full-image fallback */
        }
      }

      setMsg("Uploading…");
      const fd = new FormData();
      for (const f of compressed) fd.append("receipts", f);
      if (thumbs.length === compressed.length) {
        for (const t of thumbs) fd.append("thumbs", t);
      }
      const up = await fetch(`/api/estimator/purchases/${pid}/receipts`, {
        method: "POST",
        body: fd,
      });
      if (!up.ok) throw new Error((await up.json().catch(() => ({}))).error ?? "Upload failed.");

      setMsg("Reading the receipt…");
      const res = await fetch(`/api/estimator/purchases/${pid}/scan`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Extraction failed.");

      seedFromScan(data.status === "parse_failed" ? null : (data.result as ScanResult));
      setPhase("confirm");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Scan failed.");
      setPhase(purchaseId ? "confirm" : "idle");
      if (purchaseId) seedFromScan(null);
    } finally {
      if (cameraRef.current) cameraRef.current.value = "";
      if (libraryRef.current) libraryRef.current.value = "";
    }
  }

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
    if (purchaseId === null) return;
    setErr(null);
    const items = rows.filter((r) => r.description.trim());
    if (items.length === 0) return setErr("Add at least one item.");
    for (const r of items) {
      if (rowAmount(r) === null) return setErr(`"${r.description.trim()}": needs an amount.`);
    }
    setBusy(true);
    const payload: ScanItemInput[] = items.map((r) => ({
      description: r.description.trim(),
      sku: r.sku,
      qty: (() => {
        const q = parseFloat(r.qtyStr);
        return Number.isFinite(q) && q > 0 ? q : null;
      })(),
      unitPrice: (() => {
        const u = parseFloat(r.unitStr);
        return Number.isFinite(u) ? u : null;
      })(),
      amount: rowAmount(r)!,
    }));
    const r = await saveJobScanItems({
      purchaseId,
      jobId,
      assignment,
      vendor,
      date,
      tax: Number.isFinite(statedTax) ? round2(statedTax) : null,
      total: Number.isFinite(statedTotal) ? round2(statedTotal) : null,
      items: payload,
    });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setPhase("idle");
    setPurchaseId(null);
    router.refresh();
  }

  if (phase === "confirm") {
    return (
      <div className="space-y-3 border-b border-line-subtle pb-3">
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
            <input inputMode="decimal" value={taxStr} onChange={(e) => setTaxStr(e.target.value)} placeholder="0.00" className="w-20" />
          </label>
          <label className="flex items-center gap-1">
            <span className="text-2xs text-bone-400">Total</span>
            <input inputMode="decimal" value={totalStr} onChange={(e) => setTotalStr(e.target.value)} placeholder="0.00" className="w-24" />
          </label>
        </div>

        {mismatch && (
          <div className="form-error flex items-start gap-2">
            <TriangleAlert size={13} className="shrink-0 mt-0.5" />
            <span>
              Items add to <span className="num">{usd.format(itemSum)}</span> but the receipt says{" "}
              <span className="num">{usd.format(expected ?? 0)}</span>
              {Number.isFinite(statedTax) ? " before tax" : ""} — a line may be missing or misread.
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
                  <input inputMode="decimal" value={r.qtyStr} onChange={(e) => patch(r.key, { qtyStr: e.target.value })} className="w-12" />
                </label>
                <label className="flex items-center gap-1">
                  <span className="text-2xs text-bone-400">$/ea</span>
                  <input inputMode="decimal" value={r.unitStr} onChange={(e) => patch(r.key, { unitStr: e.target.value })} className="w-20" />
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
              </div>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() =>
              setRows((prev) => [
                ...prev,
                { key: ++rowKey, description: "", sku: null, qtyStr: "1", unitStr: "", amountStr: "" },
              ])
            }
            className="btn-ghost text-xs h-8"
          >
            <Plus size={12} />
            Add row
          </button>
          <span className="text-2xs text-bone-400">Assign as</span>
          <AssignmentSelect value={assignment} onChange={setAssignment} options={options} />
          <span className="num text-sm text-bone-100 ml-auto">Items {usd.format(itemSum)}</span>
          <button
            type="button"
            onClick={() => {
              setPhase("idle");
              setPurchaseId(null);
              router.refresh();
            }}
            className="btn-secondary text-sm min-h-[42px]"
          >
            Later
          </button>
          <button type="button" onClick={accept} disabled={busy} className="btn-primary text-sm min-h-[42px]">
            {busy ? <Loader2 size={13} className="animate-spin" /> : "Accept"}
          </button>
        </div>
        {err && <div className="form-error">{err}</div>}
      </div>
    );
  }

  return (
    <div className="space-y-2 border-b border-line-subtle pb-3">
      <div className="flex items-center gap-2 flex-wrap">
        <ScanLine size={13} className="text-field-500 shrink-0" />
        <span className="text-2xs text-bone-400">
          Scan a receipt — photo → items, you review before it saves
        </span>
        <span className="ml-auto flex gap-2">
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => start(e.target.files)} />
          <input ref={libraryRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => start(e.target.files)} />
          <button type="button" onClick={() => cameraRef.current?.click()} disabled={phase === "working"} className="btn-primary text-xs h-8">
            {phase === "working" ? <Loader2 size={11} className="animate-spin" /> : <Camera size={11} />}
            Camera
          </button>
          <button type="button" onClick={() => libraryRef.current?.click()} disabled={phase === "working"} className="btn-secondary text-xs h-8">
            <ImagePlus size={11} />
            Photos
          </button>
        </span>
      </div>
      {phase === "working" && <div className="text-2xs text-bone-400">{msg}</div>}
      {err && <div className="form-error">{err}</div>}
    </div>
  );
}
