"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CopyPlus,
  FileDown,
  Loader2,
  Pencil,
  Receipt,
  RefreshCcw,
  Send,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import {
  deleteEstimate,
  repriceEstimate,
  setEstimateStatus,
  type EstimateStatus,
} from "../estimate-actions";
import { SharePdfButton } from "../share-pdf-button";

export function EstimateActionsBar({
  estimateId,
  jobId,
  status,
  invoiceId,
}: {
  estimateId: number;
  /** Owning job — deleting the estimate returns there. */
  jobId: number;
  status: string;
  /** The invoice (not voided) that bills this job's estimate, if any. */
  invoiceId: number | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(name: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setErr(null);
    setBusy(name);
    const r = await fn();
    setBusy(null);
    if (!r.ok) setErr(r.error ?? "Something went wrong.");
    else router.refresh();
  }

  function mark(next: EstimateStatus) {
    run(next, () => setEstimateStatus(estimateId, next));
  }

  async function reprice() {
    if (
      !confirm(
        "Reprice at current settings?\n\nThis re-freezes every rate and cost using today's settings — the saved numbers WILL change. This is the only way (besides editing) that a saved estimate changes.",
      )
    ) {
      return;
    }
    run("reprice", () => repriceEstimate(estimateId));
  }

  async function remove() {
    if (!confirm("Delete this draft estimate?")) return;
    setErr(null);
    setBusy("delete");
    const r = await deleteEstimate(estimateId);
    setBusy(null);
    if (!r.ok) setErr(r.error ?? "Delete failed.");
    else router.push(`/app/jobs/${jobId}`);
  }

  const btn = (
    name: string,
    label: string,
    icon: React.ReactNode,
    onClick: () => void,
    cls = "btn-secondary",
  ) => (
    <button
      type="button"
      onClick={onClick}
      disabled={busy !== null}
      className={`${cls} text-sm min-h-[42px]`}
    >
      {busy === name ? <Loader2 size={13} className="animate-spin" /> : icon}
      {label}
    </button>
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <a
          href={`/api/estimator/estimates/${estimateId}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary text-sm min-h-[42px]"
        >
          <FileDown size={13} />
          View PDF
        </a>
        <SharePdfButton
          url={`/api/estimator/estimates/${estimateId}/pdf`}
          filename={`EST-${String(estimateId).padStart(3, "0")}.pdf`}
          label="Send estimate"
        />
        {(status === "draft" || status === "sent") && (
          <Link
            href={`/app/estimator/${estimateId}/edit`}
            className="btn-secondary text-sm min-h-[42px]"
          >
            <Pencil size={13} />
            Edit
          </Link>
        )}
        {(status === "accepted" || status === "lost") && (
          <Link
            href={`/app/estimator/${estimateId}/revise`}
            className="btn-secondary text-sm min-h-[42px]"
            title="Start a new version prefilled from this one — this estimate stays untouched"
          >
            <CopyPlus size={13} />
            New version
          </Link>
        )}
        {status === "draft" &&
          btn("sent", "Mark sent", <Send size={13} />, () => mark("sent"))}
        {(status === "draft" || status === "sent") &&
          btn("accepted", "Accepted", <ThumbsUp size={13} />, () => mark("accepted"), "btn-primary")}
        {(status === "draft" || status === "sent") &&
          btn("lost", "Lost", <ThumbsDown size={13} />, () => mark("lost"))}
        {status !== "lost" &&
          btn("reprice", "Reprice at current settings", <RefreshCcw size={13} />, reprice)}
        {status === "draft" &&
          btn("delete", "Delete", <Trash2 size={13} />, remove, "btn-danger")}
        {status === "accepted" &&
          (invoiceId ? (
            <Link
              href={`/app/estimator/invoices/${invoiceId}`}
              className="btn-secondary text-sm min-h-[42px]"
            >
              <Receipt size={13} />
              View invoice
            </Link>
          ) : (
            // The job's invoice: the estimate's lines plus anything else the
            // job bills (extras, hours), claimed together.
            <Link
              href={`/app/jobs/${jobId}/invoice`}
              className="btn-primary text-sm min-h-[42px]"
              data-testid="estimate-create-invoice"
            >
              <Receipt size={13} />
              Create invoice
            </Link>
          ))}
      </div>

      {err && <div className="form-error">{err}</div>}
    </div>
  );
}
