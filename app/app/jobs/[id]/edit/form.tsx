"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Save, Check, Trash2, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { TagInput } from "@/components/tags/tag-input";
import { AssignmentSelect } from "@/components/assignment/assignment-select";
import type { TeamMember } from "@/lib/team/members";

const STATUSES = [
  "lead",
  "estimated",
  "scheduled",
  "in_progress",
  "completed",
  "callback",
  "callback_complete",
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
  tags: string[];
  assigned_user_id: string | null;
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

export function JobEditForm({
  job,
  tagSuggestions = [],
  teamMembers = [],
}: {
  job: JobInput;
  tagSuggestions?: string[];
  teamMembers?: TeamMember[];
}) {
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
  const [tags, setTags] = useState<string[]>(job.tags ?? []);
  const [assignedUserId, setAssignedUserId] = useState<string | null>(
    job.assigned_user_id ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleArchive() {
    setErr(null);
    setArchiving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("jobs")
      .update({
        archived_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    setArchiving(false);
    setConfirmArchive(false);
    if (error) {
      setErr(error.message);
      return;
    }
    router.push("/app/jobs");
    router.refresh();
  }

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
        tags,
        assigned_user_id: assignedUserId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    setSaving(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setSaved(true);
    // Go back to the read-only detail page after save so the user sees a
    // clean view of their changes, not the editor again.
    router.push(`/app/jobs/${job.id}`);
    router.refresh();
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

      <div className="field-group">
        <label className="field-label">Tags</label>
        <TagInput
          value={tags}
          onChange={setTags}
          suggestions={tagSuggestions}
          placeholder="Add tag (Enter or comma to confirm)"
        />
        <p className="text-2xs text-bone-400 mt-1">
          Use to group jobs — e.g. <span className="font-mono">repeat-customer</span>,{" "}
          <span className="font-mono">callback-needed</span>,{" "}
          <span className="font-mono">apartment</span>. Filter by tag on the
          jobs list.
        </p>
      </div>

      <AssignmentSelect
        value={assignedUserId}
        onChange={setAssignedUserId}
        members={teamMembers}
      />

      {err && <div className="form-error">{err}</div>}

      {confirmArchive && (
        <div className="rounded-sm border border-status-danger/40 bg-status-danger/[0.06] px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle size={14} className="text-status-danger shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-bone-100 font-medium leading-snug">
              Delete this job?
            </p>
            <p className="text-2xs text-bone-300 mt-0.5 leading-relaxed">
              The job will be hidden from your views. Call summaries linked to it
              stay intact for your records. An operator can restore it if needed.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={handleArchive}
                disabled={archiving}
                className="btn-primary text-xs h-7 !bg-status-danger hover:!bg-status-danger/90"
              >
                {archiving ? (
                  <>
                    <Loader2 size={11} className="animate-spin" />
                    Deleting…
                  </>
                ) : (
                  <>
                    <Trash2 size={11} />
                    Yes, delete
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setConfirmArchive(false)}
                disabled={archiving}
                className="btn-ghost text-xs h-7"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
        <button
          type="button"
          onClick={() => setConfirmArchive(true)}
          disabled={saving || archiving || confirmArchive}
          className="btn-ghost text-xs text-status-danger hover:!bg-status-danger/[0.08]"
        >
          <Trash2 size={12} />
          Delete job
        </button>

        <div className="flex items-center gap-2 ml-auto">
          {saved && (
            <span className="text-xs text-status-completed flex items-center gap-1">
              <Check size={12} />
              Saved
            </span>
          )}
          <Link
            href={`/app/jobs/${job.id}`}
            className="btn-ghost text-xs h-9"
          >
            Cancel
          </Link>
          <button type="submit" className="btn-primary text-sm" disabled={saving || archiving}>
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
      </div>
    </form>
  );
}
