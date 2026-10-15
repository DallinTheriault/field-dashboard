"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { markPaidOutside, undoPaidOutside } from "./billing-actions";

/** Owner's dialog: mark an old job paid outside Field, with an optional note. */
export function PaidOutsideDialog({ jobId, onClose }: { jobId: number; onClose: () => void }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setErr(null);
    start(async () => {
      const r = await markPaidOutside(jobId, note);
      if (!r.ok) return setErr(r.error);
      onClose();
      router.refresh();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-0/70 flex items-end sm:items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Mark paid outside Field"
    >
      <div className="panel w-full max-w-md p-4 space-y-3">
        <div className="flex items-start gap-2">
          <h2 className="text-base font-semibold text-bone-50 flex-1">Mark paid outside Field</h2>
          <button type="button" onClick={onClose} className="btn-ghost min-h-[44px] min-w-[44px] -mt-2 -mr-2" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <p className="text-sm text-bone-300">
          For work paid before Field had invoices. The job shows as Paid and leaves Ready to invoice. Nothing is
          added to income.
        </p>
        <label className="field-group">
          <span className="field-label">Note (optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="e.g. Paid by check in June"
            className="w-full text-sm"
            aria-label="Note"
          />
        </label>
        {err && <div className="form-error">{err}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost text-sm min-h-[44px]">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={pending} className="btn-primary text-sm min-h-[44px]">
            {pending ? <Loader2 size={13} className="animate-spin" /> : "Mark paid"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Under the job header once marked: when, the note, and Undo for the owner. */
export function PaidOutsideNotice({
  jobId,
  when,
  note,
  canUndo,
}: {
  jobId: number;
  when: string;
  note: string | null;
  canUndo: boolean;
}) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-bone-400 -mt-3 mb-4" data-testid="paid-outside">
      <span>
        Paid outside Field, marked {when}
        {note && <span className="text-bone-300"> · {note}</span>}
      </span>
      {canUndo && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setErr(null);
              const r = await undoPaidOutside(jobId);
              if (!r.ok) return setErr(r.error);
              router.refresh();
            })
          }
          className="btn-ghost text-xs min-h-[44px] underline"
        >
          {pending ? <Loader2 size={12} className="animate-spin" /> : "Undo"}
        </button>
      )}
      {err && <span className="text-status-danger">{err}</span>}
    </div>
  );
}
