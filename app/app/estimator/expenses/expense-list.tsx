import { Paperclip } from "lucide-react";

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

/**
 * The Money page's expense list for one year, read only: expenses are entered
 * and edited on the Expenses page (receipts and Quick expense).
 */
export function ExpenseList({ expenses }: { expenses: Expense[] }) {
  return (
    <div className="px-4 py-3 space-y-3">
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
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
