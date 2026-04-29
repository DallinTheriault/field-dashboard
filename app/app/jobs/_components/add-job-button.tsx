"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2, AlertCircle } from "lucide-react";
import { createJobManual } from "./actions";

const STATUSES = [
  { value: "lead", label: "Lead" },
  { value: "estimated", label: "Estimated" },
  { value: "scheduled", label: "Scheduled" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "callback", label: "Callback" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export function AddJobButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<string>("lead");

  const dialogRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) setOpen(false);
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, submitting]);

  // Lock body scroll & focus first field when opened
  useEffect(() => {
    if (open) {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      // Defer to let the modal mount before focusing
      setTimeout(() => firstInputRef.current?.focus(), 50);
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [open]);

  function reset() {
    setName("");
    setPhone("");
    setAddress("");
    setStatus("lead");
    setError(null);
  }

  function close() {
    if (submitting) return;
    setOpen(false);
    reset();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await createJobManual({ name, phone, address, status });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    reset();
    router.push(`/app/jobs/${result.jobId}`);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-primary text-sm h-9"
      >
        <Plus size={14} />
        Add job
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]"
            onClick={close}
            aria-hidden
          />

          {/* Dialog */}
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-job-title"
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 pointer-events-none"
          >
            <div className="bg-ink-1 border border-line-strong rounded-t-md sm:rounded-md w-full sm:max-w-md max-h-[90vh] overflow-y-auto pointer-events-auto shadow-xl">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-line">
                <h2
                  id="add-job-title"
                  className="text-sm font-semibold text-bone-50"
                >
                  New job
                </h2>
                <button
                  type="button"
                  onClick={close}
                  disabled={submitting}
                  aria-label="Close"
                  className="btn-ghost h-8 w-8 px-0"
                >
                  <X size={15} strokeWidth={1.8} />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="px-4 py-4 space-y-3.5">
                <p className="text-2xs text-bone-400 leading-relaxed">
                  Capture a lead manually. The rest of the job details (service,
                  scope, price, schedule, notes) can be filled in after creation.
                </p>

                <div>
                  <label className="label-eyebrow block mb-1">
                    Customer name <span className="text-status-danger">*</span>
                  </label>
                  <input
                    ref={firstInputRef}
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={submitting}
                    required
                    placeholder="e.g. Brie Anderson"
                    className="!bg-ink-2 w-full text-sm h-9"
                  />
                </div>

                <div>
                  <label className="label-eyebrow block mb-1">
                    Phone <span className="text-status-danger">*</span>
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={submitting}
                    required
                    placeholder="e.g. 801-555-1234"
                    inputMode="tel"
                    className="!bg-ink-2 w-full text-sm h-9 font-mono"
                  />
                </div>

                <div>
                  <label className="label-eyebrow block mb-1">
                    Address / property{" "}
                    <span className="text-status-danger">*</span>
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    disabled={submitting}
                    required
                    placeholder="e.g. 123 Main St, Provo UT"
                    className="!bg-ink-2 w-full text-sm h-9"
                  />
                </div>

                <div>
                  <label className="label-eyebrow block mb-1">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    disabled={submitting}
                    className="!bg-ink-2 w-full text-sm h-9"
                  >
                    {STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                {error && (
                  <div className="flex items-start gap-2 p-2 rounded-xs bg-status-danger/[0.08] border border-status-danger/20">
                    <AlertCircle
                      size={12}
                      className="text-status-danger shrink-0 mt-0.5"
                    />
                    <span className="text-2xs text-bone-100 leading-relaxed">
                      {error}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-line-subtle">
                  <button
                    type="button"
                    onClick={close}
                    disabled={submitting}
                    className="btn-ghost text-xs h-9"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn-primary text-sm h-9"
                  >
                    {submitting ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        Creating…
                      </>
                    ) : (
                      <>
                        <Plus size={13} />
                        Create job
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </>
  );
}
