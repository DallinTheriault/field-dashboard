"use client";

import { useEffect, useState } from "react";
import { ChevronRight, X } from "lucide-react";

/**
 * The service chip + the Job details sheet behind it.
 *
 * The chip shows the tenant's own service value verbatim — nothing about the
 * label is hardcoded, because "service" means something different for every
 * trade. When a job has no service yet it reads "Details", so the control is
 * always present and never renders empty.
 *
 * The sheet is view-only; editing stays in Edit job (Options menu).
 */
export function JobDetailsSheet({
  service,
  scope,
  quotedPrice,
  start,
  end,
}: {
  service: string | null;
  scope: string | null;
  quotedPrice: string;
  start: string;
  end: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onEsc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onEsc);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const label = service?.trim() || "Details";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Job details${service?.trim() ? ` — ${service.trim()}` : ""}`}
        aria-haspopup="dialog"
        className="chip normal-case tracking-normal border-line-strong text-bone-300 hover:text-bone-100 hover:border-field-500/50 max-w-[42vw]"
      >
        <span className="truncate">{label}</span>
        <ChevronRight size={10} className="shrink-0 text-bone-500" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Job details"
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 pointer-events-none"
          >
            <div className="bg-ink-1 border border-line-strong rounded-t-md sm:rounded-md w-full sm:max-w-md max-h-[85vh] overflow-y-auto pointer-events-auto shadow-xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-line">
                <h2 className="text-sm font-semibold text-bone-50">Job details</h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="btn-ghost h-8 w-8 px-0"
                >
                  <X size={15} strokeWidth={1.8} />
                </button>
              </div>
              <dl className="px-4 py-3 divide-y divide-line-subtle">
                <Row label="Service" value={service?.trim() || "—"} />
                <Row label="Scope" value={scope?.trim() || "—"} />
                <Row label="Quoted price" value={quotedPrice} mono />
                <Row label="Start" value={start} />
                <Row label="End" value={end} />
              </dl>
              <p className="px-4 pb-4 text-2xs text-bone-500">
                Change any of this from Edit job in the ⋮ menu.
              </p>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
      <dt className="w-24 shrink-0 text-2xs text-bone-400 pt-0.5">{label}</dt>
      <dd
        className={`flex-1 min-w-0 text-sm text-bone-100 break-words whitespace-pre-wrap ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
