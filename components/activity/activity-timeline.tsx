import Link from "next/link";
import { Phone, MessageSquare, ArrowRight, Clock, User } from "lucide-react";
import type { TimelineEvent } from "@/lib/timeline/fetch";
import type { TeamMember } from "@/lib/team/types";
import { formatMemberLabel } from "@/lib/team/types";

/**
 * Format an ISO timestamp as a relative time ("2h ago") for events within
 * the last day, or absolute date ("Apr 14") for older events. Avoids the
 * "X seconds ago" jitter and keeps the UI feeling stable.
 */
function relTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function durationLabel(seconds: number | null | undefined): string {
  if (!seconds || seconds < 1) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m${s > 0 ? ` ${s}s` : ""}`;
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

export function ActivityTimeline({
  events,
  members,
}: {
  events: TimelineEvent[];
  members: TeamMember[];
}) {
  const memberMap = new Map(members.map((m) => [m.user_id, m]));

  if (events.length === 0) {
    return (
      <div className="rounded-md border border-line bg-ink-1 px-4 py-8 text-center">
        <Clock size={20} className="mx-auto text-bone-500 mb-2" />
        <p className="text-sm text-bone-400">No activity yet.</p>
        <p className="text-xs text-bone-500 mt-1">
          Calls, texts, and status changes will appear here.
        </p>
      </div>
    );
  }

  return (
    <ol className="relative space-y-0">
      {events.map((e, idx) => (
        <li
          key={e.id}
          className="relative flex gap-3 pb-4 last:pb-0"
        >
          {/* Vertical line connecting events */}
          {idx < events.length - 1 && (
            <div className="absolute left-3 top-7 bottom-0 w-px bg-line" />
          )}

          {/* Icon */}
          <div className="relative z-10 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-line bg-ink-1">
            {e.kind === "call" && <Phone size={11} className="text-field-500" />}
            {e.kind === "sms" && (
              <MessageSquare
                size={11}
                className={
                  e.direction === "inbound" ? "text-field-500" : "text-bone-300"
                }
              />
            )}
            {e.kind === "status_change" && (
              <ArrowRight size={11} className="text-bone-300" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 pt-0.5">
            {e.kind === "call" && (
              <CallEvent event={e} />
            )}
            {e.kind === "sms" && (
              <SmsEvent event={e} actor={memberMap.get(e.sent_by_user_id ?? "") ?? null} />
            )}
            {e.kind === "status_change" && (
              <StatusEvent
                event={e}
                actor={memberMap.get(e.changed_by ?? "") ?? null}
              />
            )}
            <div className="text-[10px] text-bone-500 mt-1 font-mono uppercase tracking-wider">
              {relTime(e.occurred_at)}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function CallEvent({
  event,
}: {
  event: Extract<TimelineEvent, { kind: "call" }>;
}) {
  const callerLabel =
    event.caller_name && event.caller_name.trim()
      ? event.caller_name.trim()
      : event.caller_phone || "Unknown caller";
  const outcomeLabel = event.outcome
    ? event.outcome.replace(/_/g, " ")
    : "completed";

  return (
    <div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-xs font-medium text-bone-50">Call</span>
        <span className="text-xs text-bone-300">from {callerLabel}</span>
        <span className="text-[10px] text-bone-500">·</span>
        <span className="text-xs text-bone-400">{outcomeLabel}</span>
        {event.duration_seconds ? (
          <>
            <span className="text-[10px] text-bone-500">·</span>
            <span className="text-xs text-bone-400">
              {durationLabel(event.duration_seconds)}
            </span>
          </>
        ) : null}
      </div>
      {event.summary && (
        <p className="text-xs text-bone-300 mt-0.5 line-clamp-2">
          {event.summary}
        </p>
      )}
      {event.vapi_call_id && (
        <Link
          href={`/app/calls/${event.vapi_call_id}`}
          className="text-[11px] text-field-500 hover:text-field-400 mt-0.5 inline-block"
        >
          View call →
        </Link>
      )}
    </div>
  );
}

function SmsEvent({
  event,
  actor,
}: {
  event: Extract<TimelineEvent, { kind: "sms" }>;
  actor: TeamMember | null;
}) {
  const dirLabel = event.direction === "inbound" ? "Received" : "Sent";
  const failedLabel =
    event.twilio_status === "failed" || event.twilio_status === "undelivered"
      ? "failed"
      : null;

  return (
    <div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-xs font-medium text-bone-50">{dirLabel}</span>
        <span className="text-xs text-bone-300">text</span>
        {event.direction === "outbound" && actor && (
          <>
            <span className="text-[10px] text-bone-500">·</span>
            <span className="text-xs text-bone-400">
              by {formatMemberLabel(actor)}
            </span>
          </>
        )}
        {failedLabel && (
          <>
            <span className="text-[10px] text-bone-500">·</span>
            <span className="text-xs text-status-danger">{failedLabel}</span>
          </>
        )}
      </div>
      <p className="text-xs text-bone-300 mt-0.5 line-clamp-2">
        {event.body || "(empty message)"}
      </p>
    </div>
  );
}

function StatusEvent({
  event,
  actor,
}: {
  event: Extract<TimelineEvent, { kind: "status_change" }>;
  actor: TeamMember | null;
}) {
  return (
    <div className="flex items-baseline gap-2 flex-wrap">
      <span className="text-xs font-medium text-bone-50">Status</span>
      {event.old_status && (
        <>
          <span className="text-xs text-bone-400">
            {statusLabel(event.old_status)}
          </span>
          <ArrowRight size={10} className="text-bone-500" />
        </>
      )}
      <span className="text-xs text-field-500">
        {statusLabel(event.new_status)}
      </span>
      {actor && (
        <>
          <span className="text-[10px] text-bone-500">·</span>
          <span className="text-xs text-bone-400 inline-flex items-center gap-1">
            <User size={10} />
            {formatMemberLabel(actor)}
          </span>
        </>
      )}
    </div>
  );
}
