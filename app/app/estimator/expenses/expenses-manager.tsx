"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EXPENSE_CATEGORIES } from "@/lib/estimator/expenses";

type Expense = {
  id: number;
  expense_date: string;
  category: string;
  description: string;
  amount: number;
  qty: number | null;
  job_id: number | null;
  jobName: string | null;
  vendor: string | null;
  hasReceipt: boolean;
  purchaseId: number | null;
  purchaseHasReceipt: boolean;
};

const round2 = (n: number) => Math.round((n + 1e-9) * 100) / 100;

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Expense list for one year (+ optional quick entry). Server recomputes
 * the P&L. readOnly = the Money view: entry/edit lives on /purchases. */
export function ExpensesManager({
  clientId,
  expenses,
  readOnly = false,
}: {
  clientId: number;
  expenses: Expense[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
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
    });
    setBusy(false);
    if (error) return setErr(error.message);
    setDescription("");
    setAmount("");
    router.refresh();
  }

  async function remove(e: Expense) {
    if (!confirm(`Delete "${e.description}" (${usd.format(e.amount)})?`)) return;
    const { error } = await supabase.from("expenses").delete().eq("id", e.id);
    if (error) setErr(error.message);
    else router.refresh();
  }

  async function attachReceipt(e: Expense, file: File) {
    setErr(null);
    const fd = new FormData();
    fd.append("receipt", file);
    const res = await fetch(`/api/estimator/expenses/${e.id}/receipt`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr(data.error ?? "Receipt upload failed.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="px-4 py-3 space-y-3">
      {/* One-thumb quick add */}
      {!readOnly && (
      <div className="flex flex-wrap gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-36"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-44"
        >
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What was it? (e.g. Sherwin-Williams run)"
          className="flex-1 min-w-40"
        />
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="$"
          className="w-24"
        />
        <button
          type="button"
          onClick={add}
          disabled={busy}
          className="btn-primary shrink-0 min-h-[42px]"
        >
          <Plus size={13} />
          Log
        </button>
      </div>
      )}
      {err && <div className="form-error">{err}</div>}

      {/* Entries */}
      {expenses.length === 0 ? (
        <p className="text-2xs text-bone-400">
          Nothing logged this year yet. Fuel, tools, insurance payments,
          license renewals — log them as they happen and tax season is a
          download, not an archaeology dig.
        </p>
      ) : (
        <ul className="space-y-1">
          {expenses.map((e) => (
            <li key={e.id} className="flex items-center gap-2.5 text-sm">
              <span className="font-mono text-2xs text-bone-400 w-20 shrink-0">
                {e.expense_date.slice(5)}
              </span>
              <span
                className={`chip normal-case tracking-normal shrink-0 max-w-32 truncate ${
                  e.jobName
                    ? "border-field-500/40 text-field-400"
                    : "border-line-strong text-bone-300"
                }`}
              >
                {e.jobName ?? e.category}
              </span>
              <span className="flex-1 min-w-0 text-bone-100 truncate">
                {e.description}
                {e.vendor && (
                  <span className="text-2xs text-bone-400"> · {e.vendor}</span>
                )}
              </span>
              {e.qty !== null && e.qty !== 1 && (
                <span className="text-2xs text-bone-400 shrink-0">
                  {e.qty} × {usd.format(round2(e.amount / e.qty))}
                </span>
              )}
              <span className="num text-bone-100">{usd.format(e.amount)}</span>
              {e.hasReceipt || e.purchaseHasReceipt ? (
                <a
                  href={
                    e.hasReceipt
                      ? `/api/estimator/expenses/${e.id}/receipt`
                      : `/api/estimator/purchases/${e.purchaseId}/receipt`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="text-field-500 hover:text-field-400 p-1"
                  title="View receipt"
                >
                  <Paperclip size={12} />
                </a>
              ) : readOnly ? null : (
                <label
                  className="text-bone-500 hover:text-bone-300 p-1 cursor-pointer"
                  title="Attach receipt (photo or PDF)"
                >
                  <Paperclip size={12} />
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(ev) => {
                      const f = ev.target.files?.[0];
                      if (f) attachReceipt(e, f);
                      ev.target.value = "";
                    }}
                  />
                </label>
              )}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => remove(e)}
                  className="text-bone-500 hover:text-status-danger p-1"
                  aria-label={`Delete ${e.description}`}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
