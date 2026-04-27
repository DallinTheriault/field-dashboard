"use client";

import { useState } from "react";
import { Loader2, Copy, Check, ExternalLink } from "lucide-react";

export function GenerateLinkButton({
  clientId,
  businessName,
}: {
  clientId: number;
  businessName: string;
}) {
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setUrl(null);
    try {
      const res = await fetch("/api/stripe/payment-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          business_name: businessName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create link");
      }
      setUrl(data.url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  if (url) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopy}
            className="btn-secondary h-7 text-2xs"
            title="Copy URL"
          >
            {copied ? (
              <>
                <Check size={11} /> Copied
              </>
            ) : (
              <>
                <Copy size={11} /> Copy
              </>
            )}
          </button>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost h-7 text-2xs"
            title="Open in new tab"
          >
            <ExternalLink size={11} />
          </a>
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          className="text-2xs text-bone-400 hover:text-bone-50"
        >
          Regenerate
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleGenerate}
        disabled={loading}
        className="btn-secondary h-7 text-2xs"
      >
        {loading ? (
          <>
            <Loader2 size={11} className="animate-spin" /> Creating…
          </>
        ) : (
          "Generate setup link"
        )}
      </button>
      {error && (
        <div className="text-2xs text-status-danger max-w-[180px] text-right">
          {error}
        </div>
      )}
    </div>
  );
}
