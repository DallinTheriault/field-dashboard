"use client";

import { Plus } from "lucide-react";

/** Jump to a field on the job page and put the cursor in it. */
function focusField(id: string) {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.focus({ preventScroll: true });
}

/**
 * "Add work" and "Log expense" side by side, each saying what it's for, so
 * billing lines and money spent don't get mixed up.
 */
export function WorkOrExpense({ canAddWork, canLogExpense }: { canAddWork: boolean; canLogExpense: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2 mb-3" data-testid="work-or-expense">
      {canAddWork && (
        <button
          type="button"
          onClick={() => focusField("add-work")}
          className="panel px-3 py-2 text-left hover:bg-ink-2 min-h-[56px]"
        >
          <span className="flex items-center gap-1.5 text-sm font-medium text-bone-50">
            <Plus size={13} className="text-field-500" />
            Add work
          </span>
          <span className="block text-2xs text-bone-400">What you&apos;re billing for</span>
        </button>
      )}
      {canLogExpense && (
        <button
          type="button"
          onClick={() => focusField("log-expense")}
          className="panel px-3 py-2 text-left hover:bg-ink-2 min-h-[56px]"
        >
          <span className="flex items-center gap-1.5 text-sm font-medium text-bone-50">
            <Plus size={13} className="text-field-500" />
            Log expense
          </span>
          <span className="block text-2xs text-bone-400">Money you spent (receipts, cash, tools, fees)</span>
        </button>
      )}
    </div>
  );
}
