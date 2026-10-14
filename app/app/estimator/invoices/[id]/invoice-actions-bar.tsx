"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Ban, Copy, FileDown, Loader2, Trash2 } from "lucide-react";
import { deleteInvoice, markInvoicePaid } from "../../invoice-actions";
import { voidInvoice } from "../../job-invoice-actions";
import { SharePdfButton } from "../../share-pdf-button";

/**
 * Everything but sending (the Send panel does that for drafts). An invoice
 * that went out is voided, never deleted; voiding frees its lines and extras
 * to be billed again. Unsent drafts are deleted.
 */
export function InvoiceActionsBar({
  invoiceId,
  invoiceNumber,
  status,
  hasStripe,
  hostedUrl,
}: {
  invoiceId: number;
  invoiceNumber: string;
  status: string;
  hasStripe: boolean;
  hostedUrl: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isDraft = status === "draft" && !hasStripe;
  const wentOut = !isDraft && status !== "voided";

  async function run(name: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setErr(null);
    setBusy(name);
    const r = await fn();
    setBusy(null);
    if (!r.ok) setErr(r.error ?? "Something went wrong.");
    else router.refresh();
  }

  async function copyHosted() {
    if (!hostedUrl) return;
    await navigator.clipboard.writeText(hostedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <a
          href={`/api/estimator/invoices/${invoiceId}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary text-sm min-h-[44px]"
        >
          <FileDown size={13} />
          View PDF
        </a>
        {wentOut && (
          <SharePdfButton
            url={`/api/estimator/invoices/${invoiceId}/pdf`}
            filename={`${invoiceNumber}.pdf`}
            label="Share PDF again"
          />
        )}
        {hostedUrl && status !== "voided" && (
          <button type="button" onClick={copyHosted} className="btn-secondary text-sm min-h-[44px]">
            <Copy size={13} />
            {copied ? "Copied!" : "Copy pay link"}
          </button>
        )}
        {wentOut && status !== "paid" && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => {
              if (confirm("Mark this invoice paid (check/cash/Venmo)?")) {
                run("paid", () => markInvoicePaid(invoiceId));
              }
            }}
            className="btn-secondary text-sm min-h-[44px]"
          >
            {busy === "paid" ? <Loader2 size={13} className="animate-spin" /> : <BadgeCheck size={13} />}
            Mark paid
          </button>
        )}
        {wentOut && status !== "paid" && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => {
              if (
                confirm(
                  `Void ${invoiceNumber}? Its lines and extras become billable again${hasStripe ? ", and its card link stops working" : ""}. This can't be undone.`,
                )
              ) {
                run("void", () => voidInvoice(invoiceId));
              }
            }}
            className="btn-secondary text-sm min-h-[44px]"
          >
            {busy === "void" ? <Loader2 size={13} className="animate-spin" /> : <Ban size={13} />}
            Void
          </button>
        )}
        {isDraft && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={async () => {
              if (!confirm("Delete this draft invoice? Its lines go back to the job, ready to bill.")) return;
              setBusy("delete");
              const r = await deleteInvoice(invoiceId);
              setBusy(null);
              if (!r.ok) setErr(r.error ?? "Delete failed.");
              else router.push("/app/estimator/invoices");
            }}
            className="btn-danger text-sm min-h-[44px]"
          >
            <Trash2 size={13} />
            Delete draft
          </button>
        )}
      </div>
      {err && <div className="form-error">{err}</div>}
    </div>
  );
}
