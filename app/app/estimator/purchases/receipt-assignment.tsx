"use client";

import type { Assignment } from "@/lib/estimator/expenses";
import type { Role } from "@/lib/permissions/roles";
import { allowedAssignmentsForRole } from "@/lib/estimator/expense-roles";

export type ReceiptTarget =
  | { kind: "unset" }
  | { kind: "stock" }
  | { kind: "internal"; jobId: number | null }
  | { kind: "job"; jobId: number | null; assignment: Assignment };

export type JobOption = {
  id: number;
  name: string;
  jobNumber: string | null;
  address: string | null;
  status: string | null;
};

const JOB_STATUS_SHORT: Record<string, string> = {
  lead: "lead",
  estimated: "estimated",
  accepted: "accepted",
  scheduled: "scheduled",
  in_progress: "in progress",
  completed: "completed",
  callback: "callback",
  callback_complete: "callback done",
  cancelled: "cancelled",
};

export function jobOptionLabel(j: JobOption): string {
  const parts: string[] = [];
  if (j.jobNumber) parts.push(j.jobNumber);
  if (j.address) parts.push(j.address);
  parts.push(j.name);
  if (j.status) parts.push(JOB_STATUS_SHORT[j.status] ?? j.status);
  return parts.join(" · ");
}

/** The persisted assignment + job for a target, or null when nothing is chosen. */
export function resolveTarget(
  t: ReceiptTarget,
): { assignment: Assignment; jobId: number | null } | null {
  switch (t.kind) {
    case "stock":
      return { assignment: "stock", jobId: null };
    case "internal":
      return t.jobId === null ? null : { assignment: "job_internal", jobId: t.jobId };
    case "job":
      return t.jobId === null ? null : { assignment: t.assignment, jobId: t.jobId };
    default:
      return null;
  }
}

/**
 * Receipt-level assignment (§5.1). Stock, Internal and Job are three PEER
 * choices — a stock run is the common case and must never be reachable only
 * by first picking a job. The job picker appears only once Job (or Internal,
 * which is still job-scoped) is chosen.
 *
 * Members never see job_extra: the options come from the shared role helper,
 * and the server enforces the same rule regardless of what the UI offers.
 */
export function ReceiptAssignment({
  value,
  onChange,
  jobs,
  role,
  disabled = false,
}: {
  value: ReceiptTarget;
  onChange: (t: ReceiptTarget) => void;
  jobs: JobOption[];
  role: Role;
  disabled?: boolean;
}) {
  const allowed = allowedAssignmentsForRole(role);
  const canBillExtra = allowed.includes("job_extra");
  const needsJob = value.kind === "job" || value.kind === "internal";

  const peer = (
    kind: ReceiptTarget["kind"],
    label: string,
    hint: string,
    next: ReceiptTarget,
  ) => (
    <button
      key={kind}
      type="button"
      disabled={disabled}
      onClick={() => onChange(next)}
      aria-label={label}
      aria-pressed={value.kind === kind}
      className={`flex-1 min-w-[104px] rounded-sm px-2.5 py-2 text-left shadow-inset-line ${
        value.kind === kind
          ? "bg-field-500/15 border border-field-500/50"
          : "bg-ink-2 border border-transparent hover:bg-ink-3"
      }`}
    >
      <div
        className={`text-sm ${value.kind === kind ? "text-bone-50" : "text-bone-100"}`}
      >
        {label}
      </div>
      <div className="text-2xs text-bone-400 leading-tight mt-0.5">{hint}</div>
    </button>
  );

  return (
    <div className="space-y-2">
      <div className="label-eyebrow">This whole receipt is…</div>
      <div className="flex flex-wrap gap-2">
        {peer("stock", "Stock", "company tools & supplies", { kind: "stock" })}
        {peer("job", "A job", "materials for one job", {
          kind: "job",
          jobId: value.kind === "internal" ? value.jobId : null,
          assignment: "job_in_bid",
        })}
        {peer("internal", "Internal", "absorbed — not billed", {
          kind: "internal",
          jobId: value.kind === "job" ? value.jobId : null,
        })}
      </div>

      {needsJob && (
        <div className="space-y-2">
          <select
            value={value.kind === "job" || value.kind === "internal" ? (value.jobId ?? "") : ""}
            onChange={(e) => {
              const id = e.target.value ? Number(e.target.value) : null;
              onChange(
                value.kind === "internal"
                  ? { kind: "internal", jobId: id }
                  : {
                      kind: "job",
                      jobId: id,
                      assignment:
                        value.kind === "job" ? value.assignment : "job_in_bid",
                    },
              );
            }}
            disabled={disabled}
            className="w-full text-sm"
            aria-label="Job"
          >
            <option value="">Pick a job…</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {jobOptionLabel(j)}
              </option>
            ))}
          </select>

          {/* In-bid vs billed extra, only for owner/manager on the Job path. */}
          {value.kind === "job" && canBillExtra && (
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["job_in_bid", "In the bid", "already covered by the quote"],
                  ["job_extra", "Bill as extra", "added to the invoice at cost"],
                ] as const
              ).map(([a, label, hint]) => (
                <button
                  key={a}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange({ kind: "job", jobId: value.jobId, assignment: a })}
                  aria-label={label}
                  aria-pressed={value.assignment === a}
                  className={`flex-1 min-w-[128px] rounded-sm px-2.5 py-1.5 text-left shadow-inset-line ${
                    value.assignment === a
                      ? "bg-field-500/15 border border-field-500/50"
                      : "bg-ink-2 border border-transparent hover:bg-ink-3"
                  }`}
                >
                  <div className="text-xs text-bone-100">{label}</div>
                  <div className="text-2xs text-bone-400 leading-tight">{hint}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
