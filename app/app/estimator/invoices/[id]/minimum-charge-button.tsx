"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { applyMinimumCharge } from "../../job-invoice-actions";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** One tap: every other line to $0.00, then the minimum service charge. */
export function MinimumChargeButton({ invoiceId, minimum }: { invoiceId: number; minimum: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setErr(null);
          setBusy(true);
          const r = await applyMinimumCharge(invoiceId);
          setBusy(false);
          if (!r.ok) return setErr(r.error);
          router.refresh();
        }}
        className="btn-secondary text-xs min-h-[44px]"
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
        Add minimum service charge
      </button>
      <p className="text-2xs text-bone-400">
        Sets the other lines to $0.00 and adds one line, Minimum service charge, at {usd.format(minimum)}.
      </p>
      {err && <div className="form-error">{err}</div>}
    </div>
  );
}
