import Link from "next/link";
import { Phone, Clock } from "lucide-react";
import { cn } from "@/lib/cn";

type CallCardData = {
  id: string;
  caller_name: string | null;
  caller_phone: string | null;
  intent: string | null;
  outcome: string | null;
  duration_seconds: number | null;
  started_at: string;
};

const OUTCOME_LABELS: Record<string, { label: string; color: string }> = {
  estimate_saved: { label: "Estimate", color: "text-status-estimated" },
  booking_saved: { label: "Booking", color: "text-status-scheduled" },
  booking_rescheduled: { label: "Reschedule", color: "text-status-progress" },
  booking_cancelled: { label: "Cancelled", color: "text-status-cancelled" },
  message_left: { label: "Voicemail", color: "text-field-500" },
  callback_received: { label: "Callback", color: "text-status-danger" },
  no_action: { label: "No action", color: "text-bone-400" },
  transferred: { label: "Transferred", color: "text-bone-300" },
  dropped: { label: "Dropped", color: "text-bone-400" },
  error: { label: "Error", color: "text-status-danger" },
};

function fmtPhone(p: string | null): string {
  if (!p) return "";
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(p);
  if (!m) return p;
  return `(${m[1]}) ${m[2]}-${m[3]}`;
}

function fmtDuration(seconds: number | null): string {
  if (seconds == null) return "";
  const s = Math.round(Number(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m}m` : `${m}m ${r}s`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0)
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function MobileCallCard({ call }: { call: CallCardData }) {
  const oc = call.outcome
    ? OUTCOME_LABELS[call.outcome] ?? { label: call.outcome, color: "text-bone-400" }
    : null;

  return (
    <Link
      href={`/app/calls/${call.id}`}
      className="block px-4 py-3 hover:bg-ink-2 active:bg-ink-2 transition-colors"
    >
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <div className="text-sm font-medium text-bone-100 truncate">
          {call.caller_name || "Unknown"}
        </div>
        {oc && (
          <span className={cn("text-2xs shrink-0 font-medium", oc.color)}>
            {oc.label}
          </span>
        )}
      </div>

      {call.caller_phone && (
        <div className="flex items-center gap-1.5 text-xs text-bone-300 font-mono mb-1">
          <Phone size={11} className="text-bone-400 shrink-0" />
          {fmtPhone(call.caller_phone)}
        </div>
      )}

      {call.intent && (
        <div className="text-xs text-bone-300 capitalize mb-1">
          {call.intent.replace(/_/g, " ")}
        </div>
      )}

      <div className="flex items-center gap-3 text-2xs text-bone-400 mt-1.5">
        {call.duration_seconds != null && (
          <span className="inline-flex items-center gap-1 font-mono">
            <Clock size={10} />
            {fmtDuration(call.duration_seconds)}
          </span>
        )}
        <span className="ml-auto">{fmtDate(call.started_at)}</span>
      </div>
    </Link>
  );
}
