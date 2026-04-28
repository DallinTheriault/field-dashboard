import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Phone, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { ClickableTableRow } from "@/components/ui/clickable-table-row";

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDuration(s: number | null): string {
  if (!s || s < 1) return "—";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
}

function fmtPhone(p: string | null): string {
  if (!p) return "—";
  const d = p.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) {
    return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) {
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return p;
}

const OUTCOME_LABELS: Record<string, { label: string; color: string }> = {
  estimate_saved: { label: "Estimate saved", color: "text-status-estimated" },
  booking_saved: { label: "Booking saved", color: "text-status-scheduled" },
  booking_updated: { label: "Booking updated", color: "text-status-progress" },
  booking_cancelled: { label: "Booking cancelled", color: "text-status-cancelled" },
  no_action: { label: "No action", color: "text-bone-400" },
  transferred: { label: "Transferred", color: "text-field-500" },
  dropped: { label: "Dropped", color: "text-status-danger" },
  error: { label: "Error", color: "text-status-danger" },
};

export default async function CallsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; outcome?: string }>;
}) {
  const supabase = await createClient();
  const { q, outcome } = await searchParams;

  let query = supabase
    .from("call_summaries")
    .select(
      "id, caller_name, caller_phone, intent, outcome, duration_seconds, summary, started_at, ended_at, job_id",
    )
    .order("started_at", { ascending: false })
    .limit(100);

  if (outcome) query = query.eq("outcome", outcome);
  if (q) {
    query = query.or(
      `caller_name.ilike.%${q}%,caller_phone.ilike.%${q}%,summary.ilike.%${q}%`,
    );
  }

  const { data: calls } = await query;
  const rows = calls ?? [];

  return (
    <div>
      <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <div className="label-eyebrow mb-1">Calls</div>
          <h1 className="text-2xl font-semibold text-bone-50 tracking-tight">
            Call log
          </h1>
          <p className="text-sm text-bone-300 mt-1">
            {rows.length} {rows.length === 1 ? "call" : "calls"}
            {outcome && ` · filtered by ${outcome.replace(/_/g, " ")}`}
            {q && ` · matching "${q}"`}
          </p>
        </div>

        <form className="flex items-center gap-2">
          <div className="relative">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-bone-400 pointer-events-none"
            />
            <input
              type="text"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search name, phone, summary…"
              className="!bg-ink-1 pl-7 h-8 w-64 text-xs"
            />
          </div>
          {outcome && <input type="hidden" name="outcome" value={outcome} />}
          {(q || outcome) && (
            <Link href="/app/calls" className="btn-ghost text-xs h-8">
              Clear
            </Link>
          )}
        </form>
      </div>

      {/* Outcome filter chips */}
      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        <Link
          href="/app/calls"
          className={cn(
            "chip border-line text-xs",
            !outcome ? "bg-ink-3 text-bone-50" : "text-bone-400 hover:text-bone-50",
          )}
        >
          All
        </Link>
        {Object.entries(OUTCOME_LABELS).map(([key, { label }]) => (
          <Link
            key={key}
            href={`/app/calls?outcome=${key}`}
            className={cn(
              "chip border-line text-xs",
              outcome === key
                ? "bg-ink-3 text-bone-50"
                : "text-bone-400 hover:text-bone-50",
            )}
          >
            {label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="panel px-6 py-14 text-center">
          <div className="w-10 h-10 mx-auto rounded-full bg-ink-2 border border-line-strong flex items-center justify-center mb-3">
            <Phone size={16} className="text-bone-400" />
          </div>
          <p className="text-sm text-bone-100 font-medium mb-1">
            {q || outcome ? "No matching calls" : "No calls yet"}
          </p>
          <p className="text-xs text-bone-400">
            {q || outcome
              ? "Try clearing your filters."
              : "Call activity will appear as your assistant handles inbound calls."}
          </p>
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto scroll-x-hint">
            <table className="table-pro">
              <thead>
                <tr>
                  <th>Caller</th>
                  <th>Phone</th>
                  <th>Intent</th>
                  <th>Outcome</th>
                  <th className="text-right">Duration</th>
                  <th className="text-right">When</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const oc = c.outcome
                    ? OUTCOME_LABELS[c.outcome]
                    : { label: "—", color: "text-bone-400" };
                  return (
                    <ClickableTableRow key={c.id} href={`/app/calls/${c.id}`}>
                      <td className="text-bone-100 font-medium">
                        {c.caller_name || "Unknown"}
                      </td>
                      <td className="num text-xs text-bone-300">
                        {fmtPhone(c.caller_phone)}
                      </td>
                      <td className="text-xs text-bone-300 capitalize">
                        {c.intent ? c.intent.replace(/_/g, " ") : "—"}
                      </td>
                      <td className={cn("text-xs", oc.color)}>{oc.label}</td>
                      <td className="num text-xs text-bone-300 text-right">
                        {fmtDuration(c.duration_seconds)}
                      </td>
                      <td className="num text-xs text-bone-400 text-right">
                        {fmtDate(c.started_at)}
                      </td>
                    </ClickableTableRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
