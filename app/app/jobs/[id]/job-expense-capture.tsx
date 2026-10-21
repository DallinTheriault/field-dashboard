"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Lock, Plus, Receipt } from "lucide-react";
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
import { setExtraBilling, setItemAssignment } from "../../estimator/purchases/purchase-actions";
import { ScanReceipt } from "../../estimator/purchases/scan-receipt";
import { PendingReceipts } from "../../estimator/purchases/pending-receipts";
import type { PendingReceipt } from "@/lib/receipts/state";
import type { JobPick } from "@/lib/jobs/address";
import { createJobExpense } from "./job-expense-actions";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const round2 = (n: number) => Math.round((n + 1e-9) * 100) / 100;

export type JobExpenseItem = {
  id: number;
  description: string;
  amount: number;
  assignment: string;
  /** Invoice number when frozen onto a finalized invoice; null when editable. */
  lockedToInvoice?: string | null;
  /** Extras: billed marked up instead of at cost; the cost (with its share
   *  of the receipt's sales tax) and what it bills. */
  billMarkup?: boolean;
  cost?: number;
  billed?: number;
  /** Extras: the receipt photo goes out with the invoice. */
  attachReceipt?: boolean;
};

const CHIP_SHORT: Record<string, string> = {
  unassigned: "unassigned",
  job_in_bid: "covered",
  job_extra: "extra",
  job_internal: "internal",
  stock: "stock",
};

/** The four destinations offered inline, in the order the money moves:
 *  covered by the bid → billed on top → eaten → not this job's cost at all. */
const REASSIGN_ORDER: Assignment[] = ["job_in_bid", "job_extra", "job_internal", "stock"];

const REASSIGN_LABELS: Record<string, string> = {
  job_in_bid: "Covered by task price",
  job_extra: "Extra",
  job_internal: "Internal",
  stock: "Stock",
};

/** What just happened, in the user's terms. Stock and internal get the
 *  consequence spelled out: stock makes the row vanish from the job, and
 *  internal silently moves money into the absorbed figure. */
const MOVE_TOAST: Record<string, string> = {
  job_in_bid: "Moved to covered by task price",
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
  job,
  role,
  receiptAiEnabled,
  items,
  pending = [],
}: {
  jobId: number;
  /** This job, as the check screen's job choice. */
  job: JobPick;
  role: Role;
  receiptAiEnabled: boolean;
  items: JobExpenseItem[];
  /** Receipts scanned from this job that aren't saved yet. */
  pending?: PendingReceipt[];
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

  async function billing(item: JobExpenseItem, patch: { billMarkup?: boolean; attachReceipt?: boolean }) {
    setErr(null);
    setBusyId(item.id);
    // The box flips on tap; a refused write puts it back.
    const set = (p: typeof patch) => setRows((prev) => prev.map((x) => (x.id === item.id ? { ...x, ...p } : x)));
    set(patch);
    const r = await setExtraBilling(item.id, patch);
    setBusyId(null);
    if (!r.ok) {
      set({
        ...(patch.billMarkup !== undefined && { billMarkup: item.billMarkup }),
        ...(patch.attachReceipt !== undefined && { attachReceipt: item.attachReceipt }),
      });
      setErr(r.error);
      return;
    }
    router.refresh();
  }

  const split = splitMaterials(rows);
  return (
    <div className="panel px-4 py-3 mb-5 space-y-4">
      <div className="flex items-center gap-2">
        <Receipt size={13} className="text-field-500" />
        <div className="label-eyebrow">Job expenses</div>
      </div>

      {receiptAiEnabled && (
        <div className="space-y-2 border-b border-line-subtle pb-3">
          <ScanReceipt variant="inline" jobId={jobId} />
        </div>
      )}
      {pending.length > 0 && (
        <div className="-mx-4">
          <PendingReceipts
            receipts={pending}
            jobs={[job]}
            role={role}
            receiptAi={receiptAiEnabled}
            title="Receipts from this job to check"
          />
        </div>
      )}
      <ManualExpense jobId={jobId} options={options} />

      {/* Absorbed vs recovered (§6.2). Zeros render so absence is visible;
          stock is excluded — it's a business asset, not a job cost. */}
      <div className="flex flex-wrap items-center gap-x-2 text-2xs text-bone-400 pt-2 border-t border-line-subtle">
        <span>Materials:</span>
        <span className="num text-bone-100">{usd.format(split.inBid)}</span>
        <span>covered by task prices ·</span>
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
              onBilling={(patch) => billing(it, patch)}
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
  onBilling,
}: {
  item: JobExpenseItem;
  canReassign: boolean;
  options: Assignment[];
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onPick: (a: Assignment) => void;
  onBilling: (patch: { billMarkup?: boolean; attachReceipt?: boolean }) => void;
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
  // A marked-up extra shows both numbers: what it cost and what it bills.
  const marked = item.assignment === "job_extra" && item.billMarkup && item.billed !== undefined && item.billed !== item.cost;
  const amount = marked ? (
    <span className="num text-right shrink-0 leading-tight">
      <span className="block text-bone-100">{usd.format(item.billed as number)}</span>
      <span className="block text-2xs text-bone-400">cost {usd.format(item.cost ?? item.amount)}</span>
    </span>
  ) : (
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
      {open && item.assignment === "job_extra" && (
        <div className="flex flex-wrap gap-x-4 pb-2">
          <label className="flex items-center gap-2 text-sm text-bone-100 min-h-[44px]">
            <input
              type="checkbox"
              checked={!!item.billMarkup}
              disabled={busy}
              onChange={(e) => onBilling({ billMarkup: e.target.checked })}
              className="w-5 h-5"
            />
            Bill marked up
          </label>
          <label className="flex items-center gap-2 text-sm text-bone-100 min-h-[44px]">
            <input
              type="checkbox"
              checked={!!item.attachReceipt}
              disabled={busy}
              onChange={(e) => onBilling({ attachReceipt: e.target.checked })}
              className="w-5 h-5"
            />
            Attach receipt when sharing the invoice
          </label>
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
