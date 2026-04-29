import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MessageSquare, Search } from "lucide-react";
import { fmtPhoneDisplay } from "@/lib/sms/phone";

function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof MessageSquare;
  title: string;
  body: string;
}) {
  return (
    <div className="px-6 py-10 text-center">
      <div className="w-10 h-10 mx-auto rounded-full bg-ink-2 border border-line-strong flex items-center justify-center mb-3">
        <Icon size={16} className="text-bone-400" />
      </div>
      <div className="text-sm font-medium text-bone-100">{title}</div>
      <p className="text-xs text-bone-400 mt-1 max-w-[32ch] mx-auto">{body}</p>
    </div>
  );
}

type ThreadRow = {
  id: number;
  contact_phone: string;
  display_name: string | null;
  consent_status: string;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_read_at: string | null;
  contact_id: number | null;
};

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const s = Math.max(0, Math.floor((now - then) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function isUnread(t: ThreadRow): boolean {
  if (!t.last_inbound_at) return false;
  if (!t.last_read_at) return true;
  return new Date(t.last_inbound_at).getTime() > new Date(t.last_read_at).getTime();
}

function lastDirection(t: ThreadRow): "inbound" | "outbound" | "none" {
  const i = t.last_inbound_at ? new Date(t.last_inbound_at).getTime() : 0;
  const o = t.last_outbound_at ? new Date(t.last_outbound_at).getTime() : 0;
  if (i === 0 && o === 0) return "none";
  return o > i ? "outbound" : "inbound";
}

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const supabase = await createClient();
  const { q } = await searchParams;

  let query = supabase
    .from("sms_threads")
    .select(
      "id, contact_phone, display_name, consent_status, last_inbound_at, last_outbound_at, last_message_at, last_message_preview, last_read_at, contact_id",
    )
    .is("archived_at", null)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(100);

  if (q) {
    query = query.or(
      `display_name.ilike.%${q}%,contact_phone.ilike.%${q}%,last_message_preview.ilike.%${q}%`,
    );
  }

  const { data: threads } = await query;
  const rows: ThreadRow[] = threads ?? [];

  const unreadCount = rows.filter(isUnread).length;

  return (
    <div>
      <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <div className="label-eyebrow mb-1">Inbox</div>
          <h1 className="text-2xl font-semibold text-bone-50 tracking-tight">
            Messages
          </h1>
          <p className="text-sm text-bone-300 mt-1">
            {rows.length} {rows.length === 1 ? "thread" : "threads"}
            {unreadCount > 0 && ` · ${unreadCount} unread`}
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
              placeholder="Search messages…"
              className="!bg-ink-1 pl-7 h-8 w-full max-w-[16rem] sm:w-64 text-xs"
            />
          </div>
          {q && (
            <Link href="/app/messages" className="btn-ghost text-xs h-8">
              Clear
            </Link>
          )}
        </form>
      </div>

      {rows.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={MessageSquare}
            title={q ? "No matching threads" : "No messages yet"}
            body={
              q
                ? "Try clearing your search."
                : "Inbound texts to your business number will appear here. Sending replies and templates ships in v0.5.1."
            }
          />
        </div>
      ) : (
        <div className="panel divide-y divide-line-subtle">
          {rows.map((t) => {
            const unread = isUnread(t);
            const dir = lastDirection(t);
            const name = t.display_name || fmtPhoneDisplay(t.contact_phone);
            const stopped = t.consent_status === "stopped";

            return (
              <Link
                key={t.id}
                href={`/app/messages/${t.id}`}
                className="block px-4 py-3.5 hover:bg-ink-2 transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="shrink-0 mt-0.5">
                    {unread ? (
                      <span className="w-2 h-2 rounded-full bg-field-500 block" />
                    ) : (
                      <span className="w-2 h-2 block" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className={`text-sm truncate ${
                          unread ? "font-semibold text-bone-50" : "text-bone-100"
                        }`}
                      >
                        {name}
                      </span>
                      {t.display_name && (
                        <span className="text-2xs font-mono text-bone-400 shrink-0">
                          {fmtPhoneDisplay(t.contact_phone)}
                        </span>
                      )}
                      {stopped && (
                        <span className="text-2xs text-status-cancelled shrink-0">
                          opted out
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-bone-400 truncate leading-relaxed">
                      {dir === "outbound" && (
                        <span className="text-bone-500">You: </span>
                      )}
                      {t.last_message_preview || "(no messages)"}
                    </p>
                  </div>
                  <span className="text-2xs text-bone-400 shrink-0 mt-0.5">
                    {timeAgo(t.last_message_at)}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
