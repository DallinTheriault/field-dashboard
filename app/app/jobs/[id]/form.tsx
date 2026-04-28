"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const STATUSES = [
  "lead",
  "estimated",
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
] as const;

type Status = (typeof STATUSES)[number];

type JobInput = {
  id: number | string;
  name: string;
  phone: string;
  email: string;
  address: string;
  service: string;
  scope: string;
  quoted_price: number | null;
  start_datetime: string | null;
  end_datetime: string | null;
  status: string;
  notes: string;
};

// Convert ISO string → "YYYY-MM-DDTHH:mm" local for <input type="datetime-local">
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function JobEditForm({ job }: { job: JobInput }) {
  const router = useRouter();
  const [name, setName] = useState(job.name);
  const [phone, setPhone] = useState(job.phone);
  const [email, setEmail] = useState(job.email);
  const [address, setAddress] = useState(job.address);
  const [service, setService] = useState(job.service);
  const [scope, setScope] = useState(job.scope);
  const [quotedPrice, setQuotedPrice] = useState<string>(
    job.quoted_price != null ? (job.quoted_price / 100).toFixed(2) : "",
  );
  const [startDt, setStartDt] = useState(toLocalInput(job.start_datetime));
  const [endDt, setEndDt] = useState(toLocalInput(job.end_datetime));
  const [status, setStatus] = useState<Status>(
    (STATUSES.includes(job.status as Status) ? job.status : "lead") as Status,
  );
  const [notes, setNotes] = useState(job.notes);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    setSaved(false);

    const supabase = createClient();

    const priceCents =
      quotedPrice.trim() === "" ? null : Math.round(parseFloat(quotedPrice) * 100);
    if (priceCents !== null && (isNaN(priceCents) || priceCents < 0)) {
      setSaving(false);
      setErr("Quoted price must be a number ≥ 0.");
      return;
    }

    const { error } = await supabase
      .from("jobs")
      .update({
        name: name || null,
        phone: phone || null,
        email: email || null,
        address: address || null,
        service: service || null,
        scope: scope || null,
        quoted_price: priceCents,
        start_datetime: fromLocalInput(startDt),
        end_datetime: fromLocalInput(endDt),
        status,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    setSaving(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setSaved(true);
    router.refresh();
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <form onSubmit={handleSubmit} className="form-card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-bone-100">Job details</h2>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as Status)}
          className="!h-8 !py-1 !text-xs"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="field-group">
          <label className="field-label">Customer name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field-label">Phone</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="font-mono"
          />
        </div>
      </div>

      <div className="field-group">
        <label className="field-label">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="field-group">
        <label className="field-label">Address</label>
        <input value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="field-group">
          <label className="field-label">Service</label>
          <input value={service} onChange={(e) => setService(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field-label">Scope</label>
          <input value={scope} onChange={(e) => setScope(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="field-group">
          <label className="field-label">Quoted price ($)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={quotedPrice}
            onChange={(e) => setQuotedPrice(e.target.value)}
            placeholder="0.00"
            className="font-mono"
          />
        </div>
        <div className="field-group">
          <label className="field-label">Start</label>
          <input
            type="datetime-local"
            value={startDt}
            onChange={(e) => setStartDt(e.target.value)}
            className="font-mono"
          />
        </div>
        <div className="field-group">
          <label className="field-label">End</label>
          <input
            type="datetime-local"
            value={endDt}
            onChange={(e) => setEndDt(e.target.value)}
            className="font-mono"
          />
        </div>
      </div>

      <div className="field-group">
        <label className="field-label">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
        />
      </div>

      {err && <div className="form-error">{err}</div>}

      <div className="flex items-center justify-end gap-2 pt-1">
        {saved && (
          <span className="text-xs text-status-completed flex items-center gap-1">
            <Check size={12} />
            Saved
          </span>
        )}
        <button type="submit" className="btn-primary text-sm" disabled={saving}>
          {saving ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Save size={13} />
              Save changes
            </>
          )}
        </button>
      </div>
    </form>
  );
}
