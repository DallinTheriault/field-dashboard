import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MessageSquare, Phone, Clock } from "lucide-react";

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function fmtPhone(p: string | null): string {
  if (!p) return "—";
  const digits = p.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return p;
}

export default async function MessagesPage() {
  const supabase = await createClient();
  const { data: messages, error } = await supabase
    .from("messages")
    .select("id, caller_name, caller_phone, callback_phone, message_body, read_at, responded_at, created_at, contact_id")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div>
      <div className="label-eyebrow mb-1">Inbox</div>
      <h1 className="text-2xl font-semibold text-bone-50 tracking-tight">
        Messages
      </h1>
      <p className="text-sm text-bone-300 mt-1 mb-6">
        Voicemails left by callers who didn&apos;t want an estimate or booking.
      </p>

      {error && (
        <div className="panel border border-status-danger/30 p-4 mb-4">
          <div className="text-sm text-status-danger font-medium">
            Couldn&apos;t load messages
          </div>
          <div className="text-xs text-bone-400 mt-1 font-mono">
            {error.message}
          </div>
        </div>
      )}

      {(!messages || messages.length === 0) && !error ? (
        <div className="panel px-6 py-16 text-center">
          <div className="w-10 h-10 mx-auto rounded-full bg-ink-2 border border-line-strong flex items-center justify-center mb-3">
            <MessageSquare size={16} className="text-bone-400" strokeWidth={1.6} />
          </div>
          <div className="text-sm font-medium text-bone-100">
            No messages yet
          </div>
          <p className="text-xs text-bone-400 mt-1 max-w-[42ch] mx-auto">
            When a caller leaves a message instead of requesting service, it
            shows up here.
          </p>
        </div>
      ) : (
        <ul className="panel divide-y divide-line-subtle">
          {(messages ?? []).map((m) => (
            <li key={m.id}>
              <Link
                href={`/app/messages/${m.id}`}
                className="block px-4 py-3 hover:bg-ink-2 transition-colors"
              >
                <div className="flex items-start gap-3">
                  {/* Unread indicator */}
                  <span
                    className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${m.read_at ? "bg-transparent" : "bg-field-500"}`}
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
    </div>
  );
}
