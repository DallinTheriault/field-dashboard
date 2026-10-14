"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Send, Share2 } from "lucide-react";
import { createCardPayLink, markInvoiceSent } from "../../job-invoice-actions";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export type Attachment = { url: string; filename: string };

/**
 * Sending without email: the phone's share sheet carries the invoice PDF,
 * any receipt photos marked for it, and (when on) the card payment link in
 * the message. On a desktop that can't share files, the PDF and photos
 * download and the message is copied. Either way the owner then confirms
 * "Mark as sent", which makes the invoice final.
 */
export function SendPanel({
  invoiceId,
  invoiceNumber,
  entityName,
  totalCents,
  customerEmail,
  cardLinkDefault,
  hostedUrl: initialHostedUrl,
  stripeReady,
  blocked,
  attachments,
}: {
  invoiceId: number;
  invoiceNumber: string;
  entityName: string;
  totalCents: number;
  customerEmail: string | null;
  cardLinkDefault: boolean;
  hostedUrl: string | null;
  stripeReady: boolean;
  /** Why it can't go out yet (lines needing a price, no lines). */
  blocked: string | null;
  attachments: Attachment[];
}) {
  const router = useRouter();
  const [cardLink, setCardLink] = useState(!!initialHostedUrl || (cardLinkDefault && stripeReady));
  const [hostedUrl, setHostedUrl] = useState(initialHostedUrl);
  const [email, setEmail] = useState("");
  const [needEmail, setNeedEmail] = useState(false);
  const [busy, setBusy] = useState<"share" | "sent" | null>(null);
  const [shared, setShared] = useState<"sheet" | "download" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const message = (url: string | null) =>
    `${entityName} invoice ${invoiceNumber}: ${usd.format(totalCents / 100)}.` +
    (url ? ` Pay by card: ${url}` : "");

  async function share() {
    setErr(null);
    setBusy("share");
    try {
      let url = hostedUrl;
      if (cardLink && !url) {
        if (!confirm("Adding a card link issues this invoice through Stripe. After that, changing it means voiding it. Continue?")) {
          return;
        }
        const r = await createCardPayLink(invoiceId, email || undefined);
        if (!r.ok) {
          if (r.code === "needs-email") setNeedEmail(true);
          setErr(r.error);
          return;
        }
        url = r.data?.hostedUrl ?? null;
        setHostedUrl(url);
      }

      const fetchFile = async (src: string, name: string, type?: string) => {
        const res = await fetch(src);
        if (!res.ok) throw new Error(`Couldn't load ${name} (${res.status}).`);
        const blob = await res.blob();
        return new File([blob], name, { type: type ?? (blob.type || "application/octet-stream") });
      };
      const files = [
        await fetchFile(`/api/estimator/invoices/${invoiceId}/pdf`, `${invoiceNumber}.pdf`, "application/pdf"),
        ...(await Promise.all(attachments.map((a) => fetchFile(a.url, a.filename)))),
      ];
      const text = message(url);

      const nav = navigator as Navigator & { canShare?: (d?: ShareData) => boolean };
      if (nav.canShare?.({ files }) && typeof nav.share === "function") {
        await nav.share({ files, text, title: `Invoice ${invoiceNumber}` });
        setShared("sheet");
      } else {
        for (const f of files) {
          const href = URL.createObjectURL(f);
          const a = document.createElement("a");
          a.href = href;
          a.download = f.name;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(href);
        }
        await navigator.clipboard?.writeText(text).catch(() => undefined);
        setShared("download");
      }
    } catch (e) {
      // Dismissing the share sheet isn't an error.
      if (e instanceof DOMException && e.name === "AbortError") return;
      setErr(e instanceof Error ? e.message : "Share failed.");
    } finally {
      setBusy(null);
    }
  }

  async function markSent() {
    setErr(null);
    setBusy("sent");
    const r = await markInvoiceSent(invoiceId, { cardLink });
    setBusy(null);
    if (!r.ok) return setErr(r.error);
    router.refresh();
  }

  return (
    <section className="panel px-4 py-3 space-y-3" data-testid="send-panel">
      <div className="label-eyebrow">Send</div>
      {blocked && <div className="form-error">{blocked}</div>}

      <label className={`flex items-center gap-2 text-sm min-h-[44px] ${stripeReady ? "text-bone-100" : "text-bone-500"}`}>
        <input
          type="checkbox"
          checked={cardLink}
          disabled={!stripeReady || !!hostedUrl}
          onChange={(e) => setCardLink(e.target.checked)}
          className="w-5 h-5"
        />
        Add card payment link
        {!stripeReady && <span className="text-2xs">(Stripe isn&apos;t connected)</span>}
      </label>
      {cardLink && !hostedUrl && (needEmail || !customerEmail) && (
        <label className="field-group">
          <span className="field-label">Customer email (Stripe needs one; it&apos;s saved to the contact)</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="w-full min-h-[44px]"
          />
        </label>
      )}
      {hostedUrl && <p className="text-2xs text-bone-400 break-all">Card link: {hostedUrl}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={share}
          disabled={!!blocked || busy !== null}
          className="btn-primary text-sm min-h-[44px]"
        >
          {busy === "share" ? <Loader2 size={13} className="animate-spin" /> : <Share2 size={13} />}
          Share invoice
        </button>
        {attachments.length > 0 && (
          <span className="text-2xs text-bone-400">
            + {attachments.length} receipt photo{attachments.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {shared && (
        <div className="rounded-sm border border-line px-3 py-2 space-y-2" role="status">
          <p className="text-sm text-bone-100">
            {shared === "sheet"
              ? "Shared. Did it go out?"
              : "The PDF downloaded and the message is copied. Send them, then come back."}
          </p>
          <button
            type="button"
            onClick={markSent}
            disabled={busy !== null}
            className="btn-primary text-sm min-h-[44px]"
          >
            {busy === "sent" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            Mark as sent
          </button>
        </div>
      )}
      {err && <div className="form-error">{err}</div>}
      {!shared && !blocked && (
        <p className="text-2xs text-bone-500 flex items-center gap-1">
          <Check size={10} /> It stays a draft until you mark it sent.
        </p>
      )}
    </section>
  );
}
