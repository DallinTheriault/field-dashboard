import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Phone, Search, MessageSquare, Clock } from "lucide-react";
import { cn } from "@/lib/cn";
import { ClickableTableRow } from "@/components/ui/clickable-table-row";
import { FilterDropdown } from "@/components/ui/filter-dropdown";

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
  const total = Math.round(s);
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const r = total % 60;
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

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

const OUTCOME_LABELS: Record<string, { label: string; color: string }> = {
  estimate_saved: { label: "Estimate saved", color: "text-status-estimated" },
  booking_saved: { label: "Booking saved", color: "text-status-scheduled" },
  booking_rescheduled: { label: "Booking updated", color: "text-status-progress" },
  booking_cancelled: { label: "Booking cancelled", color: "text-status-cancelled" },
  message_left: { label: "Message left", color: "text-field-500" },
  no_action: { label: "No action", color: "text-bone-400" },
  transferred: { label: "Transferred", color: "text-field-500" },
  dropped: { label: "Dropped", color: "text-status-danger" },
  error: { label: "Error", color: "text-status-danger" },
};

type Tab = "log" | "voicemails";

export default async function CallsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; outcomes?: string; tab?: string }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;
  const q = params.q;
  const outcomesRaw = params.outcomes ?? "";
  const outcomes = outcomesRaw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s in OUTCOME_LABELS);
  const tab: Tab = params.tab === "voicemails" ? "voicemails" : "log";

  // Always count both tabs so we can show counts in the tab bar.
  const [callsCountRes, messagesCountRes] = await Promise.all([
    supabase.from("call_summaries").select("id", { count: "exact", head: true }),
    supabase.from("messages").select("id", { count: "exact", head: true }),
  ]);
  const callsCount = callsCountRes.count ?? 0;
  const messagesCount = messagesCountRes.count ?? 0;

  // Only fetch full data for the active tab to keep this fast.
  let callRows:
    | Array<{
        id: string;
        caller_name: string | null;
        caller_phone: string | null;
        intent: string | null;
        outcome: string | null;
        duration_seconds: number | null;
        summary: string | null;
        started_at: string;
      }>
    | null = null;
  let messageRows:
    | Array<{
        id: number;
        caller_name: string | null;
        caller_phone: string | null;
        callback_phone: string | null;
        message_body: string | null;
        read_at: string | null;
        responded_at: string | null;
        created_at: string;
        contact_id: number | null;
      }>
    | null = null;

  if (tab === "log") {
    let query = supabase
      .from("call_summaries")
      .select(
        "id, caller_name, caller_phone, intent, outcome, duration_seconds, summary, started_at",
      )
      .order("started_at", { ascending: false })
      .limit(100);
    if (outcomes.length > 0) query = query.in("outcome", outcomes);
    if (q) {
      query = query.or(
        `caller_name.ilike.%${q}%,caller_phone.ilike.%${q}%,summary.ilike.%${q}%`,
      );
    }
    const { data } = await query;
    callRows = data ?? [];
  } else {
    let mQuery = supabase
      .from("messages")
      .select(
        "id, caller_name, caller_phone, callback_phone, message_body, read_at, responded_at, created_at, contact_id",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (q) {
      mQuery = mQuery.or(
        `caller_name.ilike.%${q}%,caller_phone.ilike.%${q}%,message_body.ilike.%${q}%`,
      );
    }
    const { data } = await mQuery;
    messageRows = data ?? [];
  }

  const activeRows = tab === "log" ? callRows ?? [] : messageRows ?? [];

  return (
    <div>
      <div className="flex items-end justify-between mb-4 gap-4 flex-wrap">
        <div>
          <div className="label-eyebrow mb-1">Inbound</div>
          <h1 className="text-2xl font-semibold text-bone-50 tracking-tight">
            {tab === "log" ? "Call log" : "Voicemails"}
          </h1>
          <p className="text-sm text-bone-300 mt-1">
            {tab === "log"
              ? `${activeRows.length} ${activeRows.length === 1 ? "call" : "calls"}`
              : `${activeRows.length} ${activeRows.length === 1 ? "voicemail" : "voicemails"}`}
            {tab === "log" && outcomes.length > 0 && ` · ${outcomes.length} ${outcomes.length === 1 ? "filter" : "filters"} active`}
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
              placeholder={
                tab === "log"
                  ? "Search name, phone, summary…"
                  : "Search name, phone, message…"
              }
              className="!bg-ink-1 pl-7 h-8 w-full max-w-[16rem] sm:w-64 text-xs"
            />
          </div>
          {tab === "voicemails" && <input type="hidden" name="tab" value="voicemails" />}
          {outcomes.length > 0 && tab === "log" && (
            <input type="hidden" name="outcomes" value={outcomes.join(",")} />
          )}
          {q && (
            <Link
              href={
                tab === "voicemails"
                  ? "/app/calls?tab=voicemails"
                  : outcomes.length > 0
                  ? `/app/calls?outcomes=${outcomes.join(",")}`
                  : "/app/calls"
              }
              className="btn-ghost text-xs h-8"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-line mb-4">
        <TabLink
          href="/app/calls"
          active={tab === "log"}
          icon={Phone}
          label="Call log"
          count={callsCount}
        />
        <TabLink
          href="/app/calls?tab=voicemails"
          active={tab === "voicemails"}
          icon={MessageSquare}
          label="Voicemails"
          count={messagesCount}
        />
      </div>

      {tab === "log" && (
        <>
          {/* Outcome multi-select filter */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="label-eyebrow">Outcome</span>
            <FilterDropdown
              paramName="outcomes"
              label="All outcomes"
              options={Object.entries(OUTCOME_LABELS).map(([key, { label }]) => ({
                key,
                label,
              }))}
            />
          </div>

          {(callRows ?? []).length === 0 ? (
            <EmptyTab
              icon={Phone}
              title={q || outcomes.length > 0 ? "No matching calls" : "No calls yet"}
              body={
                q || outcomes.length > 0
                  ? "Try clearing your filters."
                  : "Call activity will appear as your assistant handles inbound calls."
              }
            />
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
                    {(callRows ?? []).map((c) => {
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
        </>
      )}

      {tab === "voicemails" && (
        <>
          {(messageRows ?? []).length === 0 ? (
            <EmptyTab
              icon={MessageSquare}
              title={q ? "No matching voicemails" : "No voicemails yet"}
              body={
                q
                  ? "Try clearing your filter."
                  : "When a caller leaves a message instead of requesting service, it shows up here."
              }
            />
          ) : (
            <ul className="panel divide-y divide-line-subtle">
              {(messageRows ?? []).map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/app/messages/${m.id}`}
                    className="block px-4 py-3 hover:bg-ink-2 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "mt-1.5 w-1.5 h-1.5 rounded-full shrink-0",
                          m.read_at ? "bg-transparent" : "bg-field-500",
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-3">
                          <div className="text-sm font-medium text-bone-100 truncate">
                            {m.caller_name || "Unknown caller"}
                          </div>
                          <div className="flex items-center gap-1 text-2xs text-bone-400 shrink-0">
                            <Clock size={10} />
                            {timeAgo(m.created_at)}
                          </div>
                        </div>
                        {(m.caller_phone || m.callback_phone) && (
                          <div className="flex items-center gap-1 mt-0.5 text-2xs text-bone-400 num">
                            <Phone size={10} />
                            {fmtPhone(m.callback_phone || m.caller_phone)}
                          </div>
                        )}
                        <div className="text-xs text-bone-300 mt-1 line-clamp-2">
                          {m.message_body}
                        </div>
                        {m.responded_at && (
                          <div className="text-2xs text-status-completed mt-1">
                            ● Responded {timeAgo(m.responded_at)}
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function TabLink({
  href,
  active,
  icon: Icon,
  label,
  count,
}: {
  href: string;
  active: boolean;
  icon: typeof Phone;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-1.5 px-4 h-10 text-xs font-medium transition-colors",
        "border-b-2 -mb-px",
        active
          ? "text-bone-50 border-field-500"
          : "text-bone-400 hover:text-bone-100 border-transparent",
      )}
    >
      <Icon size={12} />
      {label}
      <span className="num text-2xs text-bone-400 ml-0.5">{count}</span>
    </Link>
  );
}

function EmptyTab({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Phone;
  title: string;
  body: string;
}) {
  return (
    <div className="panel px-6 py-14 text-center">
      <div className="w-10 h-10 mx-auto rounded-full bg-ink-2 border border-line-strong flex items-center justify-center mb-3">
        <Icon size={16} className="text-bone-400" />
      </div>
      <p className="text-sm text-bone-100 font-medium mb-1">{title}</p>
      <p className="text-xs text-bone-400">{body}</p>
    </div>
  );
}
