"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Plus, RefreshCcw } from "lucide-react";
import { addToDraftInvoice, refreshDraftExtras } from "../../job-invoice-actions";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export type AvailableLine = {
  kind: "task" | "extra";
  id: number;
  title: string;
  detail: string | null;
  amount: number;
  done: boolean;
};

/**
 * What the job has that this draft doesn't: lines still waiting for a price
 * (they block sending), finished lines and extras added since the draft was
 * made, and open lines, listed so one can go on the invoice on purpose.
 */
export function JobLinesPanel({
  invoiceId,
  jobId,
  available,
  needsPrice,
}: {
  invoiceId: number;
  jobId: number;
  available: AvailableLine[];
  needsPrice: Array<{ id: number; title: string }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setErr(null);
    setBusy(key);
    const r = await fn();
    setBusy(null);
    if (!r.ok) setErr(r.error ?? "Something went wrong.");
    else router.refresh();
  }

  const groups: Array<[string, AvailableLine[]]> = [
    ["Finished, not on this invoice", available.filter((a) => a.kind === "task" && a.done)],
    ["Extras not on any invoice", available.filter((a) => a.kind === "extra")],
    ["Not done yet", available.filter((a) => a.kind === "task" && !a.done)],
  ];

  return (
    <section className="panel px-4 py-3 space-y-3" data-testid="job-lines">
      <div className="flex items-center gap-2">
        <div className="label-eyebrow flex-1">From the job</div>
        <button
          type="button"
          onClick={() => run("refresh", () => refreshDraftExtras(invoiceId))}
          disabled={busy !== null}
          className="btn-ghost text-xs min-h-[44px]"
          title="Re-price the extras on this draft and pull in new ones"
        >
          {busy === "refresh" ? <Loader2 size={12} className="animate-spin" /> : <RefreshCcw size={12} />}
          Refresh extras
        </button>
      </div>

      {needsPrice.length > 0 && (
        <div className="rounded-sm border border-status-lead/40 px-3 py-2 space-y-1" data-testid="needs-price">
          <div className="text-sm text-status-lead">
            Needs a price before this can be sent:
          </div>
          <ul className="text-sm text-bone-100 list-disc pl-5">
            {needsPrice.map((t) => (
              <li key={t.id}>{t.title}</li>
            ))}
          </ul>
          <Link href={`/app/jobs/${jobId}`} className="inline-flex items-center min-h-[44px] text-sm text-field-500 underline">
            Price them on the job, or mark them not billable
          </Link>
        </div>
      )}

      {groups.map(([label, items]) =>
        items.length === 0 ? null : (
          <div key={label}>
            <div className="text-2xs text-bone-400 mb-1">{label}</div>
            <ul className="space-y-1">
              {items.map((a) => (
                <li key={`${a.kind}-${a.id}`} className="flex items-center gap-2 min-h-[44px]" data-available={a.title}>
                  <span className="flex-1 min-w-0 text-sm text-bone-100 break-words">
                    {a.title}
                    {a.detail && <span className="text-2xs text-bone-400"> {a.detail}</span>}
                  </span>
                  <span className="num text-sm text-bone-300">{usd.format(a.amount)}</span>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() =>
                      run(`${a.kind}-${a.id}`, () =>
                        addToDraftInvoice(invoiceId, a.kind === "task" ? { taskIds: [a.id] } : { expenseIds: [a.id] }),
                      )
                    }
                    className="btn-secondary text-xs min-h-[44px]"
                    aria-label={`Add ${a.title}`}
                  >
                    {busy === `${a.kind}-${a.id}` ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                    Add
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ),
      )}
      {available.length === 0 && needsPrice.length === 0 && (
        <p className="text-2xs text-bone-400">Everything billable on the job is on an invoice.</p>
      )}
      {err && <div className="form-error">{err}</div>}
    </section>
  );
}
