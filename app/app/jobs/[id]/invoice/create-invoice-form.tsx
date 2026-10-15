"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Receipt } from "lucide-react";
import { createInvoiceFromJob } from "@/app/app/estimator/job-invoice-actions";

export function CreateInvoiceForm({
  jobId,
  entities,
  defaultEntityId,
}: {
  jobId: number;
  entities: Array<{ id: number; label: string }>;
  defaultEntityId: number | null;
}) {
  const router = useRouter();
  const [entityId, setEntityId] = useState<number | null>(defaultEntityId);
  const [taxPct, setTaxPct] = useState("");
  const [dueTerms, setDueTerms] = useState("Due on receipt");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    setErr(null);
    setBusy(true);
    const r = await createInvoiceFromJob(jobId, {
      billingEntityId: entityId,
      taxRatePct: taxPct.trim() ? parseFloat(taxPct) : 0,
      dueTerms,
    });
    if (!r.ok) {
      setBusy(false);
      return setErr(r.error);
    }
    router.push(`/app/estimator/invoices/${r.data!.invoiceId}`);
  }

  return (
    <section className="panel px-4 py-3 space-y-3">
      {entities.length > 1 && (
        <label className="field-group">
          <span className="field-label">Bill as</span>
          <select
            value={entityId ?? ""}
            onChange={(e) => setEntityId(Number(e.target.value))}
            className="w-full min-h-[44px]"
          >
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex flex-wrap gap-3">
        <label className="field-group">
          <span className="field-label">Tax % (optional)</span>
          <input
            inputMode="decimal"
            value={taxPct}
            onChange={(e) => setTaxPct(e.target.value)}
            placeholder="0"
            className="w-24 min-h-[44px]"
          />
        </label>
        <label className="field-group flex-1 min-w-40">
          <span className="field-label">Terms</span>
          <input value={dueTerms} onChange={(e) => setDueTerms(e.target.value)} className="w-full min-h-[44px]" />
        </label>
      </div>
      {err && <div className="form-error">{err}</div>}
      <button type="button" onClick={create} disabled={busy || entityId === null} className="btn-primary text-sm min-h-[44px]">
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Receipt size={13} />}
        Create draft
      </button>
      {entityId === null && <p className="text-2xs text-status-lead">Add a billing entity in Business › Pricing first.</p>}
    </section>
  );
}
