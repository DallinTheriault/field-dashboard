import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ArrowLeft, Phone, User, AlertCircle } from "lucide-react";
import { fmtPhoneDisplay } from "@/lib/sms/phone";
import { ReplyBox } from "./reply-box";

export const dynamic = "force-dynamic";

type Message = {
  id: number;
  direction: string;
  body: string;
  created_at: string;
  twilio_status: string | null;
  error_code: string | null;
};

function fmtClock(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function sameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function fmtDayHeader(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  ) {
    return "Today";
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) {
    return "Yesterday";
  }
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

/**
 * Compact label for Twilio outbound delivery status. Shown after the
 * timestamp on outbound bubbles, e.g. "1:49 PM · delivered".
 */
function fmtOutboundStatus(status: string): string {
  switch (status) {
    case "queued":
      return "queued";
    case "sending":
      return "sending";
    case "sent":
      return "sent";
    case "delivered":
      return "delivered";
    case "read":
      return "read";
    default:
      return status;
  }
}

export default async function MessageThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const threadId = Number(id);
  if (!Number.isFinite(threadId)) notFound();

  const supabase = await createClient();

  const { data: thread } = await supabase
    .from("sms_threads")
    .select(
      "id, client_id, contact_id, contact_phone, tenant_phone, display_name, consent_status, last_inbound_at, last_read_at, archived_at",
    )
    .eq("id", threadId)
    .maybeSingle();

  if (!thread) notFound();

  const { data: messages } = await supabase
    .from("sms_messages")
    .select("id, direction, body, created_at, twilio_status, error_code")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  const msgs: Message[] = messages ?? [];

  // Mark thread read — admin client to bypass RLS write restriction
  if (
    thread.last_inbound_at &&
    (!thread.last_read_at ||
      new Date(thread.last_inbound_at).getTime() >
        new Date(thread.last_read_at).getTime())
  ) {
    const admin = createAdminClient();
    await admin
      .from("sms_threads")
      .update({ last_read_at: new Date().toISOString() })
      .eq("id", threadId);
  }

  const displayName =
    thread.display_name || fmtPhoneDisplay(thread.contact_phone);
  const phoneDisplay = fmtPhoneDisplay(thread.contact_phone);

  return (
    <div>
      <Link
        href="/app/messages"
        className="text-2xs text-bone-400 hover:text-bone-100 inline-flex items-center gap-1 mb-3"
      >
        <ArrowLeft size={11} />
        Back to messages
      </Link>

      {/* Thread header */}
      <div className="panel mb-4">
        <div className="px-4 py-3 flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="label-eyebrow mb-1">Conversation</div>
            <h1 className="text-lg font-semibold text-bone-50 truncate">
              {displayName}
            </h1>
            <div className="flex items-center gap-3 mt-1 flex-wrap text-2xs text-bone-400">
              <span className="font-mono">{phoneDisplay}</span>
              {thread.consent_status === "stopped" && (
                <span className="text-status-cancelled">opted out (STOP)</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <a
              href={`tel:${thread.contact_phone}`}
              className="btn-secondary text-xs h-8"
            >
              <Phone size={11} />
              Call
            </a>
            {thread.contact_id && (
              <Link
                href={`/app/contacts/${thread.contact_id}`}
                className="btn-secondary text-xs h-8"
              >
                <User size={11} />
                Contact
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="panel">
        <div className="px-4 py-4">
          {msgs.length === 0 ? (
            <p className="text-xs text-bone-400 text-center py-8">
              No messages yet.
            </p>
          ) : (
            <div className="space-y-1">
              {msgs.map((m, i) => {
                const showDayHeader =
                  i === 0 || !sameDay(msgs[i - 1].created_at, m.created_at);
                const inbound = m.direction === "inbound";
                const failed =
                  m.direction === "outbound" &&
                  (m.twilio_status === "failed" ||
                    m.twilio_status === "undelivered");
                return (
                  <div key={m.id}>
                    {showDayHeader && (
                      <div className="text-2xs text-bone-400 text-center py-3 font-medium">
                        {fmtDayHeader(m.created_at)}
                      </div>
                    )}
                    <div
                      className={`flex ${inbound ? "justify-start" : "justify-end"} mb-1`}
                    >
                      <div className="max-w-[80%] flex flex-col gap-0.5">
                        <div
                          className={`px-3 py-2 rounded-md text-sm leading-relaxed whitespace-pre-wrap break-words ${
                            inbound
                              ? "bg-ink-2 text-bone-50"
                              : failed
                              ? "bg-status-danger/15 text-bone-50 border border-status-danger/30"
                              : "bg-field-500/15 text-bone-50 border border-field-500/30"
                          }`}
                        >
                          {m.body}
                        </div>
                        <div
                          className={`text-2xs text-bone-400 ${inbound ? "text-left" : "text-right"} px-1`}
                        >
                          {fmtClock(m.created_at)}
                          {!inbound && !failed && m.twilio_status && (
                            <span className="ml-1.5 text-bone-400">
                              · {fmtOutboundStatus(m.twilio_status)}
                            </span>
                          )}
                          {failed && (
                            <span className="text-status-danger ml-1.5 inline-flex items-center gap-0.5">
                              <AlertCircle size={9} />
                              {m.error_code
                                ? `failed (${m.error_code})`
                                : "failed"}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Reply box — server action sends via Twilio */}
        <ReplyBox
          threadId={thread.id}
          isStopped={thread.consent_status === "stopped"}
        />
      </div>
    </div>
  );
}
