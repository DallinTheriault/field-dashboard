"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock, X, Pencil, Loader2, Save } from "lucide-react";
import { cancelScheduledSms, editScheduledSms } from "./actions";

/**
 * Pending scheduled SMS, rendered inline in the thread after sent messages.
 *
 * Visual design: looks like an outbound bubble (right-aligned) but dimmed
 * with a dashed border, clock icon, and scheduled time in tenant's timezone.
 * Two actions inline: Edit (opens body + datetime form) and Cancel
 * (immediate, with status update).
 *
 * The cron is responsible for sending; this component is purely for
 * visibility and human override before send time.
 */
export function ScheduledBubble({
  scheduledId,
  body,
  scheduledFor,
  tenantTz,
}: {
  scheduledId: number;
  body: string;
  scheduledFor: string;
  tenantTz: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(body);
  const [editTime, setEditTime] = useState(toLocalInput(scheduledFor, tenantTz));
  const [error, setError] = useState<string | null>(null);

  function handleCancel() {
    if (!confirm("Cancel this scheduled message?")) return;
    setError(null);
    startTransition(async () => {
      const result = await cancelScheduledSms(scheduledId);
      if (!result.ok) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  function handleSaveEdit() {
    setError(null);
    // Convert local-tz datetime back to ISO
    const iso = fromLocalInput(editTime, tenantTz);
    if (!iso) {
      setError("Invalid date/time.");
      return;
    }
    startTransition(async () => {
      const result = await editScheduledSms(scheduledId, editBody, iso);
      if (!result.ok) {
        setError(result.error);
      } else {
        setEditing(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex justify-end mb-2">
      <div className="max-w-[80%] flex flex-col gap-0.5 items-end">
        {editing ? (
          <div className="bg-ink-2 border border-line rounded-md p-3 w-full min-w-[260px] space-y-2">
            <textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              rows={3}
              maxLength={1600}
              className="w-full !bg-ink-1 text-sm leading-relaxed resize-y min-h-[60px]"
            />
            <input
              type="datetime-local"
              value={editTime}
              onChange={(e) => setEditTime(e.target.value)}
              className="w-full !bg-ink-1 text-sm font-mono"
            />
            {error && (
              <p className="text-2xs text-status-danger">{error}</p>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={pending}
                className="btn-primary text-xs h-8"
              >
                {pending ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <Save size={11} />
                )}
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setEditBody(body);
                  setEditTime(toLocalInput(scheduledFor, tenantTz));
                  setError(null);
                }}
                disabled={pending}
                className="btn-ghost text-xs h-8"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="px-3 py-2 rounded-md text-sm leading-relaxed whitespace-pre-wrap break-words bg-ink-2/60 text-bone-100 border border-dashed border-line-strong">
              {body}
            </div>
            <div className="flex items-center gap-2 px-1 text-2xs text-bone-400">
              <Clock size={10} className="text-field-500" />
              <span>Scheduled for {fmtSchedule(scheduledFor, tenantTz)}</span>
              <button
                type="button"
                onClick={() => setEditing(true)}
                disabled={pending}
                className="text-bone-400 hover:text-bone-100 inline-flex items-center gap-0.5"
                aria-label="Edit scheduled message"
              >
                <Pencil size={10} />
                Edit
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={pending}
                className="text-bone-400 hover:text-status-danger inline-flex items-center gap-0.5"
                aria-label="Cancel scheduled message"
              >
                {pending ? (
                  <Loader2 size={10} className="animate-spin" />
                ) : (
                  <X size={10} />
                )}
                Cancel
              </button>
            </div>
            {error && (
              <p className="text-2xs text-status-danger px-1">{error}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------- timezone helpers ---------------- */

/**
 * Format an ISO timestamp as "Tue, May 6 at 9:00 AM MDT" in the tenant's
 * timezone. We deliberately use the IANA timezone here — the operator
 * may be working from a different timezone than the business.
 */
function fmtSchedule(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(iso));
  } catch {
    // Bad timezone — fall back to browser
    return new Date(iso).toLocaleString();
  }
}

/**
 * Convert an ISO timestamp into the YYYY-MM-DDTHH:MM string that
 * <input type="datetime-local"> expects, INTERPRETED IN THE TENANT'S
 * TIMEZONE. Browser's datetime-local input is timezone-naive — it always
 * shows the literal string we give it. So we extract the wall-clock parts
 * of the ISO timestamp as they would appear in the tenant's timezone.
 */
function toLocalInput(iso: string, tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(iso));
    const get = (t: string) =>
      parts.find((p) => p.type === t)?.value ?? "00";
    // formatToParts hour for hour12=false sometimes returns "24" at midnight
    let hour = get("hour");
    if (hour === "24") hour = "00";
    return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
  } catch {
    const d = new Date(iso);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}

/**
 * Inverse of toLocalInput: take the YYYY-MM-DDTHH:MM string the user
 * picked (interpreted in tenant tz) and produce an ISO timestamp for
 * the absolute moment in time.
 *
 * Returns null on parse failure.
 *
 * Strategy: take the wall-clock time, treat it as a moment in tenant tz,
 * and convert to UTC. Done by computing the timezone offset for tenant tz
 * AT that wall-clock moment, then subtracting.
 */
export function fromLocalInput(local: string, tz: string): string | null {
  if (!local) return null;
  // Match "YYYY-MM-DDTHH:MM" or "YYYY-MM-DDTHH:MM:SS"
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    local,
  );
  if (!m) return null;

  const [, y, mo, d, h, min, sec] = m;
  // Build a "naive" Date as if the wall clock were UTC. We'll compute the
  // tz offset and adjust.
  const naiveUtc = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(min),
    Number(sec ?? 0),
  );

  // Compute the tz offset at this moment. We do this by formatting the
  // naiveUtc moment in the tenant tz, then comparing wall-clock parts
  // with the original input. Difference is the offset.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(naiveUtc));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  let hour = get("hour");
  if (hour === "24") hour = "00";
  const tenantWallUtc = Date.UTC(
    Number(get("year")),
    Number(get("month")) - 1,
    Number(get("day")),
    Number(hour),
    Number(get("minute")),
    Number(get("second")),
  );
  const offset = tenantWallUtc - naiveUtc;
  return new Date(naiveUtc - offset).toISOString();
}
