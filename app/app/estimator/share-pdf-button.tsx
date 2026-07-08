"use client";

import { useState } from "react";
import { Check, Loader2, Share2 } from "lucide-react";

/**
 * Fetches an auth-gated PDF route as a file and hands it to the OS share
 * sheet (Web Share API — on a phone this is Messages / Mail / etc. with the
 * PDF already attached). Falls back to a plain download where file-sharing
 * isn't supported (most desktop browsers).
 *
 * The PDF endpoints require the owner's session, so a customer can't open a
 * raw link — sharing the actual file is the right primitive here.
 */
export function SharePdfButton({
  url,
  filename,
  label = "Send",
}: {
  url: string;
  filename: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handle() {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Couldn't generate the PDF (${res.status}).`);
      const blob = await res.blob();
      const file = new File([blob], filename, { type: "application/pdf" });

      const nav = navigator as Navigator & {
        canShare?: (data?: ShareData) => boolean;
      };
      if (nav.canShare?.({ files: [file] }) && typeof nav.share === "function") {
        await nav.share({ files: [file], title: filename });
      } else {
        // Desktop / unsupported: download it so they can attach manually.
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objectUrl);
        setDone(true);
        setTimeout(() => setDone(false), 2000);
      }
    } catch (e) {
      // User dismissing the share sheet throws AbortError — not an error.
      if (e instanceof DOMException && e.name === "AbortError") return;
      setErr(e instanceof Error ? e.message : "Share failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handle}
        disabled={busy}
        className="btn-secondary text-sm min-h-[42px]"
      >
        {busy ? (
          <Loader2 size={13} className="animate-spin" />
        ) : done ? (
          <Check size={13} />
        ) : (
          <Share2 size={13} />
        )}
        {done ? "Downloaded" : label}
      </button>
      {err && <span className="text-2xs text-status-danger">{err}</span>}
    </span>
  );
}
