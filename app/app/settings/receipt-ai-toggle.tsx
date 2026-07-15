"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { setReceiptAiEnabled } from "./receipt-ai-actions";

/** Owner-only entitlement toggle for AI receipt scanning (spec §8.3). */
export function ReceiptAiToggle({
  enabled,
  isOwner,
  scansThisMonth,
}: {
  enabled: boolean;
  isOwner: boolean;
  scansThisMonth: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function flip() {
    setErr(null);
    setBusy(true);
    const r = await setReceiptAiEnabled(!enabled);
    setBusy(false);
    if (!r.ok) setErr(r.error);
    else router.refresh();
  }

  return (
    <div className="px-4 py-3.5 space-y-2">
      <div className="flex items-center gap-2">
        <span
          className={`w-1.5 h-1.5 rounded-full ${enabled ? "bg-status-completed" : "bg-bone-500"}`}
        />
        <span className="text-sm text-bone-100">
          {enabled ? "On" : "Off"}
        </span>
        {isOwner && (
          <button
            type="button"
            onClick={flip}
            disabled={busy}
            className="btn-secondary text-xs h-8 ml-auto"
          >
            {busy ? (
              <Loader2 size={11} className="animate-spin" />
            ) : enabled ? (
              "Turn off"
            ) : (
              "Turn on"
            )}
          </button>
        )}
      </div>
      <p className="text-2xs text-bone-400 max-w-md">
        Receipt photos are sent to Anthropic Claude to extract the vendor,
        totals, and line items for your review — nothing is saved until you
        accept. Manual expense entry always works with this off.
      </p>
      <p className="text-2xs text-bone-400">
        <span className="num text-bone-300">{scansThisMonth}</span> scan
        {scansThisMonth === 1 ? "" : "s"} this month
      </p>
      {err && <div className="form-error">{err}</div>}
    </div>
  );
}
