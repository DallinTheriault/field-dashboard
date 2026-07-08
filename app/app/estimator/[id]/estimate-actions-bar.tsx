"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
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
import { createInvoiceFromEstimate } from "../invoice-actions";
import { SharePdfButton } from "../share-pdf-button";

export function EstimateActionsBar({
  estimateId,
  status,
  invoiceId,
}: {
  estimateId: number;
  status: string;
  /** Existing invoice created from this estimate, if any. */
  invoiceId: number | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [taxPct, setTaxPct] = useState("");
  const [dueTerms, setDueTerms] = useState("Due on receipt");

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
    else router.push("/app/estimator");
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

  async function createInvoice() {
    setErr(null);
    setBusy("invoice");
    const r = await createInvoiceFromEstimate(estimateId, {
      taxRatePct: taxPct.trim() ? parseFloat(taxPct) : 0,
      dueTerms,
    });
    setBusy(null);
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    router.push(`/app/estimator/invoices/${r.data!.invoiceId}`);
  }

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
            <button
              type="button"
              onClick={() => setInvoiceOpen(!invoiceOpen)}
              disabled={busy !== null}
              className="btn-primary text-sm min-h-[42px]"
            >
              <Receipt size={13} />
              Create invoice
            </button>
          ))}
      </div>

      {invoiceOpen && !invoiceId && (
        <div className="panel px-3 py-3 flex flex-wrap items-end gap-2">
          <label className="field-group">
            <span className="field-label">Tax % (optional)</span>
            <input
              inputMode="decimal"
              value={taxPct}
              onChange={(e) => setTaxPct(e.target.value)}
              placeholder="0"
              className="w-24"
            />
          </label>
          <label className="field-group flex-1 min-w-40">
            <span className="field-label">Terms</span>
            <input
              value={dueTerms}
              onChange={(e) => setDueTerms(e.target.value)}
              className="w-full"
            />
          </label>
          <button
            type="button"
            onClick={createInvoice}
            disabled={busy !== null}
            className="btn-primary text-sm min-h-[42px]"
          >
            {busy === "invoice" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              "Create"
            )}
          </button>
        </div>
      )}

      {err && <div className="form-error">{err}</div>}
    </div>
  );
}
