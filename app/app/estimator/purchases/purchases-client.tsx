"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Lock,
  Package,
  Paperclip,
  Plus,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  ASSIGNMENT_LABELS,
  EXPENSE_CATEGORIES,
  JOB_ASSIGNMENTS,
  type Assignment,
} from "@/lib/estimator/expenses";
import {
  deleteExpenseItem,
  deletePurchase,
  setCustomerNotified,
  setItemAssignment,
} from "./purchase-actions";
import { ConfirmScan, ScanReceipt } from "./scan-receipt";

export type PendingPurchase = {
  id: number;
  vendor: string;
  purchase_date: string;
  hasPhotos: boolean;
};

export type ExpenseItemRow = {
  id: number;
  expense_date: string;
  category: string;
  description: string;
  amount: number;
  qty: number | null;
  unit_price: number | null;
  sku: string | null;
  job_id: number | null;
  jobName: string | null;
  assignment: string;
  customer_notified: boolean;
  stock_category: string | null;
  invoiced_on: number | null;
  invoiceNumber: string | null;
  purchaseId: number | null;
  vendor: string | null;
  purchaseDate: string | null;
  hasReceipt: boolean;
};

/** Compact assignment labels for the dense collapsed row — the full
 *  ASSIGNMENT_LABELS ("Job — extra (invoiced at cost)") starved the
 *  description column on phones. Full labels live in the expanded panel. */
const ASSIGNMENT_SHORT: Record<string, string> = {
  unassigned: "unassigned",
  job_in_bid: "in bid",
  job_extra: "extra",
  job_internal: "internal",
  stock: "stock",
};

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const round2 = (n: number) => Math.round((n + 1e-9) * 100) / 100;

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type ManualRow = {
  key: number;
  description: string;
  priceStr: string;
  qtyStr: string;
  jobId: string; // "" = leave unassigned
};
let rowKey = 0;
const blankRow = (): ManualRow => ({
  key: ++rowKey,
  description: "",
  priceStr: "",
  qtyStr: "1",
  jobId: "",
});
const rowTotal = (r: ManualRow) => {
  const p = parseFloat(r.priceStr);
  const q = parseFloat(r.qtyStr);
  if (!Number.isFinite(p) || p < 0) return 0;
  return round2(p * (Number.isFinite(q) && q > 0 ? q : 1));
};

export function PurchasesClient({
  clientId,
  items,
  jobs,
  pendingPurchases = [],
  receiptAi = false,
}: {
  clientId: number;
  items: ExpenseItemRow[];
  jobs: Array<{ id: number; name: string }>;
  pendingPurchases?: PendingPurchase[];
  receiptAi?: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [err, setErr] = useState<string | null>(null);
  const [enteringId, setEnteringId] = useState<number | null>(null);

  const unassigned = items.filter((i) => i.assignment === "unassigned");
  const stock = items.filter((i) => i.assignment === "stock");
  const stockByCat = new Map<string, ExpenseItemRow[]>();
  for (const s of stock) {
    const k = s.stock_category || s.category || "Uncategorized";
    stockByCat.set(k, [...(stockByCat.get(k) ?? []), s]);
  }

  return (
    <div className="space-y-5">
      {unassigned.length > 0 && (
        <div className="panel px-4 py-2.5 border-status-lead/40 text-sm text-bone-100">
          <span className="num">{unassigned.length}</span> item
          {unassigned.length === 1 ? "" : "s"} waiting for an assignment —
          scan in the parking lot, assign from the couch.
        </div>
      )}
      {err && <div className="form-error">{err}</div>}

      {/* AI scan — hidden when the entitlement is off (the route enforces
          it server-side regardless; hiding is UX, not security). */}
      {receiptAi && <ScanReceipt clientId={clientId} />}

      {/* Receipts photographed but not yet turned into items */}
      {pendingPurchases.length > 0 && (
        <section className="panel">
          <div className="px-4 py-3 border-b border-line">
            <h2 className="text-sm font-semibold text-bone-100">
              Receipts waiting for items
            </h2>
          </div>
          <ul className="divide-y divide-line-subtle">
            {pendingPurchases.map((p) => (
              <li key={p.id} className="px-4 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-mono text-2xs text-bone-400 w-14 shrink-0">
                    {p.purchase_date.slice(5)}
                  </span>
                  <span className="flex-1 min-w-0 text-bone-100 truncate">{p.vendor}</span>
                  {p.hasPhotos && (
                    <a
                      href={`/api/estimator/purchases/${p.id}/receipt`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-field-500 hover:text-field-400 p-1 shrink-0"
                      title="View photo"
                    >
                      <Paperclip size={12} />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setEnteringId(enteringId === p.id ? null : p.id)}
                    className="btn-secondary text-xs h-8 shrink-0"
                  >
                    Enter items
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm(`Delete "${p.vendor}" and its photos?`)) return;
                      const r = await deletePurchase(p.id);
                      if (!r.ok) setErr(r.error);
                      else router.refresh();
                    }}
                    className="text-bone-500 hover:text-status-danger p-1 shrink-0"
                    aria-label={`Delete ${p.vendor}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                {enteringId === p.id && (
                  <ConfirmScan
                    purchaseId={p.id}
                    scan={null}
                    parseFailed={false}
                    onDone={() => {
                      setEnteringId(null);
                      router.refresh();
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <LogManualPurchase clientId={clientId} jobs={jobs} onDone={() => router.refresh()} />
      <QuickExpense clientId={clientId} onDone={() => router.refresh()} />

      {/* The ledger, newest first */}
      <section className="panel">
        <div className="px-4 py-3 border-b border-line">
          <h2 className="text-sm font-semibold text-bone-100">Items</h2>
          <p className="text-2xs text-bone-400 mt-0.5">
            Tap an item to assign it. Items on an invoice are locked.
          </p>
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-4 text-2xs text-bone-400">
            Nothing yet — log a purchase above.
          </p>
        ) : (
          <ul className="divide-y divide-line-subtle">
            {items.map((it) => (
              <ItemRow
                key={it.id}
                item={it}
                jobs={jobs}
                onChanged={() => router.refresh()}
                onError={setErr}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Stock — flat list by category (locked decision: no inventory) */}
      {stock.length > 0 && (
        <section className="panel">
          <div className="px-4 py-3 border-b border-line flex items-center gap-2">
            <Package size={13} className="text-bone-400" />
            <h2 className="text-sm font-semibold text-bone-100">Stock</h2>
            <span className="text-2xs text-bone-400">
              company tools &amp; supplies · not job cost
            </span>
          </div>
          <div className="px-4 py-3 space-y-2">
            {[...stockByCat.entries()].map(([cat, rows]) => (
              <div key={cat}>
                <div className="label-eyebrow mb-1">{cat}</div>
                <ul className="space-y-0.5">
                  {rows.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 min-w-0 text-bone-100 truncate">
                        {s.description}
                        {s.vendor && (
                          <span className="text-2xs text-bone-400"> · {s.vendor}</span>
                        )}
                      </span>
                      <span className="num text-bone-100">{usd.format(s.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ---------- one item row with the assignment controls ---------- */

function ItemRow({
  item,
  jobs,
  onChanged,
  onError,
}: {
  item: ExpenseItemRow;
  jobs: Array<{ id: number; name: string }>;
  onChanged: () => void;
  onError: (m: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [assignment, setAssignment] = useState<Assignment>(item.assignment as Assignment);
  const [jobId, setJobId] = useState<string>(item.job_id ? String(item.job_id) : "");
  const [stockCat, setStockCat] = useState(item.stock_category ?? "");
  const locked = item.invoiced_on !== null;
  const isJob = JOB_ASSIGNMENTS.includes(assignment);

  async function apply() {
    onError(null);
    setBusy(true);
    const r = await setItemAssignment(item.id, {
      assignment,
      jobId: isJob && jobId ? Number(jobId) : null,
      stockCategory: assignment === "stock" ? stockCat : null,
      customerNotified: item.customer_notified,
    });
    setBusy(false);
    if (!r.ok) return onError(r.error);
    setOpen(false);
    onChanged();
  }

  async function toggleNotified() {
    onError(null);
    const r = await setCustomerNotified(item.id, !item.customer_notified);
    if (!r.ok) onError(r.error);
    else onChanged();
  }

  async function remove() {
    if (!confirm(`Delete "${item.description}" (${usd.format(item.amount)})?`)) return;
    onError(null);
    const r = await deleteExpenseItem(item.id);
    if (!r.ok) onError(r.error);
    else onChanged();
  }

  const chipTone =
    item.assignment === "unassigned"
      ? "border-status-lead/50 text-status-lead"
      : item.assignment === "job_extra"
        ? "border-status-danger/40 text-status-danger"
        : item.assignment === "stock"
          ? "border-line-strong text-bone-300"
          : "border-field-500/40 text-field-400";

  return (
    <li className="px-4 py-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-start gap-2 text-left text-sm"
      >
        <span className="font-mono text-2xs text-bone-400 w-11 shrink-0 pt-0.5">
          {item.expense_date.slice(5)}
        </span>
        {/* Description gets the width: wraps to 2 lines then ellipsis,
            instead of hard-truncating at ~8 chars. */}
        <span className="flex-1 min-w-0 text-bone-100 line-clamp-2 leading-snug">
          {item.description}
          {item.vendor && <span className="text-2xs text-bone-400"> · {item.vendor}</span>}
          {item.jobName && (
            <span className="text-2xs text-field-400"> · {item.jobName}</span>
          )}
        </span>
        <span className={`chip normal-case tracking-normal shrink-0 ${chipTone}`}>
          {ASSIGNMENT_SHORT[item.assignment] ?? item.assignment}
        </span>
        {locked && (
          <span
            className="chip normal-case tracking-normal border-line-strong text-bone-300 shrink-0"
            title={`On invoice ${item.invoiceNumber ?? item.invoiced_on}`}
          >
            <Lock size={9} />
          </span>
        )}
        {item.hasReceipt && item.purchaseId && (
          <a
            href={`/api/estimator/purchases/${item.purchaseId}/receipt`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-field-500 hover:text-field-400 p-1 shrink-0"
            title="View receipt"
          >
            <Paperclip size={12} />
          </a>
        )}
        <span className="num text-bone-100 shrink-0 pt-0.5">{usd.format(item.amount)}</span>
        {open ? (
          <ChevronDown size={13} className="text-bone-500 shrink-0 mt-0.5" />
        ) : (
          <ChevronRight size={13} className="text-bone-500 shrink-0 mt-0.5" />
        )}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {/* Full item context — the collapsed row is intentionally terse, so
              identify the item unambiguously here before assigning it. */}
          <div className="bg-ink-2 rounded-sm shadow-inset-line p-2.5 space-y-1">
            <p className="text-sm text-bone-100 break-words leading-snug">
              {item.description}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs text-bone-400">
              {item.qty !== null && item.unit_price !== null && (
                <span className="num">
                  {item.qty} × {usd.format(item.unit_price)}
                </span>
              )}
              <span className="num text-bone-100">{usd.format(item.amount)}</span>
              {item.sku && <span className="font-mono">SKU {item.sku}</span>}
              {item.vendor && <span>{item.vendor}</span>}
              {(item.purchaseDate ?? item.expense_date) && (
                <span className="font-mono">
                  {(item.purchaseDate ?? item.expense_date).slice(0, 10)}
                </span>
              )}
            </div>
          </div>
          {locked && (
            <p className="text-2xs text-bone-400">
              On invoice {item.invoiceNumber ?? `#${item.invoiced_on}`}. While
              that invoice is a draft its lines follow your changes here; once
              it goes out, it&apos;s final and this item locks.
            </p>
          )}
          {(
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={assignment}
                onChange={(e) => setAssignment(e.target.value as Assignment)}
                className="text-sm"
                aria-label="Assignment"
              >
                {Object.entries(ASSIGNMENT_LABELS).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
              {isJob && (
                <select
                  value={jobId}
                  onChange={(e) => setJobId(e.target.value)}
                  className="text-sm max-w-44"
                  aria-label="Job"
                >
                  <option value="">Pick a job…</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.name}
                    </option>
                  ))}
                </select>
              )}
              {assignment === "stock" && (
                <input
                  value={stockCat}
                  onChange={(e) => setStockCat(e.target.value)}
                  placeholder="Category (e.g. Tools)"
                  className="w-36 text-sm"
                />
              )}
              <button
                type="button"
                onClick={apply}
                disabled={busy}
                className="btn-primary text-xs h-8"
              >
                {busy ? <Loader2 size={11} className="animate-spin" /> : "Apply"}
              </button>
              <button
                type="button"
                onClick={remove}
                className="btn-ghost text-xs h-8 text-bone-500 hover:text-status-danger ml-auto"
                aria-label={`Delete ${item.description}`}
              >
                <Trash2 size={11} />
              </button>
            </div>
          )}
          {item.assignment === "job_extra" && (
            <label className="flex items-center gap-2 text-2xs text-bone-300 cursor-pointer">
              <input
                type="checkbox"
                checked={item.customer_notified}
                onChange={toggleNotified}
              />
              Customer knows about this extra (the honesty flag — unexpected
              invoice lines are dispute #1)
            </label>
          )}
        </div>
      )}
    </li>
  );
}

/* ---------- manual multi-item purchase (one receipt, N items) ---------- */

function LogManualPurchase({
  clientId,
  jobs,
  onDone,
}: {
  clientId: number;
  jobs: Array<{ id: number; name: string }>;
  onDone: () => void;
}) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [vendor, setVendor] = useState("");
  const [date, setDate] = useState(todayISO());
  const [receipt, setReceipt] = useState<File | null>(null);
  const [rows, setRows] = useState<ManualRow[]>([blankRow()]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const total = round2(rows.reduce((s, r) => s + rowTotal(r), 0));

  const patch = (key: number, p: Partial<ManualRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...p } : r)));

  async function save() {
    setErr(null);
    if (!vendor.trim()) return setErr("Where was the purchase? (e.g. Home Depot)");
    const items = rows.filter((r) => r.description.trim());
    if (items.length === 0) return setErr("Add at least one item.");
    for (const r of items) {
      const p = parseFloat(r.priceStr);
      if (!Number.isFinite(p) || p < 0) {
        return setErr(`"${r.description}": price must be 0 or more.`);
      }
    }
    setBusy(true);
    try {
      const { data: purchase, error: pErr } = await supabase
        .from("purchases")
        .insert({
          client_id: clientId,
          vendor: vendor.trim(),
          purchase_date: date || todayISO(),
          source: "manual",
          total,
        })
        .select("id")
        .single();
      if (pErr || !purchase) throw new Error(pErr?.message ?? "Purchase failed.");

      if (receipt) {
        const fd = new FormData();
        fd.append("receipt", receipt);
        const res = await fetch(`/api/estimator/purchases/${purchase.id}/receipt`, {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Receipt upload failed.");
        }
      }

      const { error: lErr } = await supabase.from("expenses").insert(
        items.map((r) => {
          const q = parseFloat(r.qtyStr);
          const qty = Number.isFinite(q) && q > 0 ? q : 1;
          const unit = parseFloat(r.priceStr);
          return {
            client_id: clientId,
            purchase_id: purchase.id,
            expense_date: date || todayISO(),
            category: "Materials & supplies",
            description: r.description.trim(),
            qty,
            unit_price: Number.isFinite(unit) ? unit : null,
            amount: rowTotal(r),
            job_id: r.jobId ? Number(r.jobId) : null,
            assignment: r.jobId ? "job_in_bid" : "unassigned",
          };
        }),
      );
      if (lErr) throw new Error(lErr.message);

      setVendor("");
      setDate(todayISO());
      setReceipt(null);
      setRows([blankRow()]);
      setOpen(false);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-center gap-2 text-left"
      >
        {open ? (
          <ChevronDown size={14} className="text-bone-400" />
        ) : (
          <ChevronRight size={14} className="text-bone-400" />
        )}
        <span className="text-sm font-semibold text-bone-100">Log a purchase</span>
        <span className="text-2xs text-bone-400">
          one receipt, N items — assign now or later
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-line-subtle pt-3">
          <div className="flex flex-wrap gap-2">
            <input
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="Vendor (e.g. Home Depot)"
              className="flex-1 min-w-40"
            />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-36"
            />
            <label className="btn-secondary text-xs h-10 cursor-pointer">
              <Paperclip size={12} />
              {receipt ? receipt.name.slice(0, 18) : "Receipt"}
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.key} className="bg-ink-2 rounded-sm shadow-inset-line p-2.5 space-y-2">
                <div className="flex gap-2">
                  <input
                    value={r.description}
                    onChange={(e) => patch(r.key, { description: e.target.value })}
                    placeholder="Item"
                    className="flex-1 min-w-0"
                  />
                  <button
                    type="button"
                    onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                    className="text-bone-500 hover:text-status-danger p-1.5"
                    aria-label="Remove item"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1">
                    <span className="text-2xs text-bone-400">$/ea</span>
                    <input
                      inputMode="decimal"
                      value={r.priceStr}
                      onChange={(e) => patch(r.key, { priceStr: e.target.value })}
                      placeholder="0.00"
                      className="w-20"
                    />
                  </label>
                  <span className="text-bone-500">×</span>
                  <input
                    inputMode="decimal"
                    value={r.qtyStr}
                    onChange={(e) => patch(r.key, { qtyStr: e.target.value })}
                    placeholder="1"
                    className="w-12"
                    aria-label="Quantity"
                  />
                  <span className="num text-2xs text-bone-300">= {usd.format(rowTotal(r))}</span>
                  <select
                    value={r.jobId}
                    onChange={(e) => patch(r.key, { jobId: e.target.value })}
                    className="text-sm ml-auto max-w-44"
                    aria-label="Assign to"
                  >
                    <option value="">Assign later</option>
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        Job: {j.name}
                      </option>
                    ))}
                  </select>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRows((prev) => [...prev, blankRow()])}
              className="btn-ghost text-xs h-8"
            >
              <Plus size={12} />
              Add item
            </button>
            <span className="num text-sm text-bone-100 ml-auto">
              Total {usd.format(total)}
            </span>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="btn-primary text-sm min-h-[42px]"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : "Log purchase"}
            </button>
          </div>
          {err && <div className="form-error">{err}</div>}
        </div>
      )}
    </section>
  );
}

/* ---------- quick single expense (fuel, insurance, one-offs) ---------- */

function QuickExpense({
  clientId,
  onDone,
}: {
  clientId: number;
  onDone: () => void;
}) {
  const supabase = createClient();
  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[2]); // Vehicle & fuel
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add() {
    setErr(null);
    const amt = parseFloat(amount);
    if (!description.trim()) return setErr("Describe the expense.");
    if (!Number.isFinite(amt) || amt <= 0) return setErr("Amount must be > 0.");
    setBusy(true);
    const { error } = await supabase.from("expenses").insert({
      client_id: clientId,
      expense_date: date || todayISO(),
      category,
      description: description.trim(),
      amount: amt,
      assignment: "stock",
      stock_category: category,
    });
    setBusy(false);
    if (error) return setErr(error.message);
    setDescription("");
    setAmount("");
    onDone();
  }

  return (
    <section className="panel px-4 py-3 space-y-2">
      <div className="label-eyebrow">Quick expense — fuel, insurance, one-offs</div>
      <div className="flex flex-wrap gap-2">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-36" />
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-44">
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What was it?"
          className="flex-1 min-w-40"
        />
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="$"
          className="w-24"
        />
        <button type="button" onClick={add} disabled={busy} className="btn-primary shrink-0 min-h-[42px]">
          <Plus size={13} />
          Log
        </button>
      </div>
      {err && <div className="form-error">{err}</div>}
    </section>
  );
}
