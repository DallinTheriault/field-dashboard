"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Loader2, Paperclip, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EXPENSE_CATEGORIES } from "@/lib/estimator/expenses";

type ItemRow = {
  key: number;
  description: string;
  priceStr: string;
  qtyStr: string;
  category: string;
  jobId: string; // "" = Stock / overhead
};

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const round2 = (n: number) => Math.round((n + 1e-9) * 100) / 100;

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

let rowKey = 0;
function blankRow(): ItemRow {
  rowKey += 1;
  return {
    key: rowKey,
    description: "",
    priceStr: "",
    qtyStr: "1",
    category: "Materials & supplies",
    jobId: "",
  };
}

function rowTotal(r: ItemRow): number {
  const p = parseFloat(r.priceStr);
  const q = parseFloat(r.qtyStr);
  if (!Number.isFinite(p) || p < 0) return 0;
  return round2(p * (Number.isFinite(q) && q > 0 ? q : 1));
}

/**
 * Log a whole receipt at once — one vendor + date + receipt image, multiple
 * item lines, each allocated to a Job (feeds that job's actuals/variance) or
 * left as Stock/overhead. Everything lands as expense lines: one source of
 * truth for the P&L, the job pages, and the tax CSV.
 */
export function LogPurchase({
  clientId,
  jobs,
}: {
  clientId: number;
  jobs: Array<{ id: number; name: string }>;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [vendor, setVendor] = useState("");
  const [date, setDate] = useState(todayISO());
  const [receipt, setReceipt] = useState<File | null>(null);
  const [rows, setRows] = useState<ItemRow[]>([blankRow()]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const total = round2(rows.reduce((s, r) => s + rowTotal(r), 0));

  function patch(key: number, p: Partial<ItemRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...p } : r)));
  }

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
          return {
            client_id: clientId,
            purchase_id: purchase.id,
            expense_date: date || todayISO(),
            // Job-assigned lines are always materials; the category picker is
            // hidden for them and may hold a stale Stock-mode choice.
            category: r.jobId ? "Materials & supplies" : r.category,
            description: r.description.trim(),
            qty: Number.isFinite(q) && q > 0 ? q : 1,
            amount: rowTotal(r),
            job_id: r.jobId ? Number(r.jobId) : null,
          };
        }),
      );
      if (lErr) throw new Error(lErr.message);

      setVendor("");
      setDate(todayISO());
      setReceipt(null);
      setRows([blankRow()]);
      setOpen(false);
      router.refresh();
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
          one receipt, multiple items, each to a job or Stock
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
                  <span className="num text-2xs text-bone-300">
                    = {usd.format(rowTotal(r))}
                  </span>
                  <select
                    value={r.jobId}
                    onChange={(e) => patch(r.key, { jobId: e.target.value })}
                    className="text-sm ml-auto max-w-40"
                    aria-label="Assign to"
                  >
                    <option value="">Stock / overhead</option>
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        Job: {j.name}
                      </option>
                    ))}
                  </select>
                  {!r.jobId && (
                    <select
                      value={r.category}
                      onChange={(e) => patch(r.key, { category: e.target.value })}
                      className="text-sm max-w-40"
                      aria-label="Category"
                    >
                      {EXPENSE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  )}
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
