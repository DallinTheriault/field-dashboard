"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Copy,
  FileDown,
  Loader2,
  Send,
  Trash2,
} from "lucide-react";
import {
  deleteInvoice,
  markInvoicePaid,
  sendInvoiceWithStripe,
} from "../../invoice-actions";

export function InvoiceActionsBar({
  invoiceId,
  status,
  hasStripe,
  hostedUrl,
}: {
  invoiceId: number;
  status: string;
  hasStripe: boolean;
  hostedUrl: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
          className="btn-secondary text-sm min-h-[42px]"
        >
          <FileDown size={13} />
          PDF
        </a>
        {status !== "paid" && !hasStripe && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run("stripe", () => sendInvoiceWithStripe(invoiceId))}
            className="btn-primary text-sm min-h-[42px]"
          >
            {busy === "stripe" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Send size={13} />
            )}
            Send with Stripe
          </button>
        )}
        {hostedUrl && (
          <button
            type="button"
            onClick={copyHosted}
            className="btn-secondary text-sm min-h-[42px]"
          >
            <Copy size={13} />
            {copied ? "Copied!" : "Copy pay link"}
          </button>
        )}
        {status !== "paid" && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => {
              if (confirm("Mark this invoice paid (check/cash/Venmo)?")) {
                run("paid", () => markInvoicePaid(invoiceId));
              }
            }}
            className="btn-secondary text-sm min-h-[42px]"
          >
            {busy === "paid" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <BadgeCheck size={13} />
            )}
            Mark paid
          </button>
        )}
        {status === "draft" && !hasStripe && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={async () => {
              if (!confirm("Delete this draft invoice?")) return;
              setBusy("delete");
              const r = await deleteInvoice(invoiceId);
              setBusy(null);
              if (!r.ok) setErr(r.error ?? "Delete failed.");
              else router.push("/app/estimator/invoices");
            }}
            className="btn-danger text-sm min-h-[42px]"
          >
            <Trash2 size={13} />
            Delete
          </button>
        )}
      </div>
      {err && <div className="form-error">{err}</div>}
    </div>
  );
}
