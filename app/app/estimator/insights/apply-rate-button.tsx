"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Wand2 } from "lucide-react";
import { applySuggestedRate } from "./insights-actions";

export function ApplyRateButton({
  serviceId,
  suggestedLabel,
}: {
  serviceId: number;
  suggestedLabel: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function apply() {
    if (
      !confirm(
        `Update the catalog rate to ${suggestedLabel}?\n\nFuture estimates price with the new rate. Saved estimates keep their frozen numbers.`,
      )
    ) {
      return;
    }
    setErr(null);
    setBusy(true);
    const r = await applySuggestedRate(serviceId);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    setDone(true);
    router.refresh();
  }

  if (done) {
    return (
      <span className="inline-flex items-center gap-1 text-2xs text-status-completed">
        <Check size={12} />
        Applied
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={apply}
        disabled={busy}
        className="btn-secondary text-xs h-8"
      >
        {busy ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <Wand2 size={12} />
        )}
        Apply to catalog
      </button>
      {err && <span className="text-2xs text-status-danger">{err}</span>}
    </span>
  );
}
