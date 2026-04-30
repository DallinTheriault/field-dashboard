import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck, AlertTriangle, MessageCircle, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fmtPhoneDisplay } from "@/lib/sms/phone";
import { detectKeyword } from "@/lib/sms/consent-keywords";

export const dynamic = "force-dynamic";

/**
 * SMS Compliance Audit page — operator-only.
 *
 * Lists every inbound message that contained a compliance keyword
 * (STOP/UNSUBSCRIBE/CANCEL/END/QUIT/STOPALL, START/YES/UNSTOP, HELP/INFO)
 * along with the current consent_status of the thread. Used to:
 *
 *   1. Demonstrate compliance handling to A2P 10DLC reviewers
 *   2. Investigate "did this customer actually opt out?" questions
 *   3. Spot-check for accidental opt-outs (someone typed "stop" mid-sentence)
 *
 * Read-only. To restore consent, the operator manually edits sms_threads.
 */
export default async function SmsCompliancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();
  const { id } = await params;

  // Operator gate — same pattern as the rest of /admin
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim());
  if (!user.email || !adminEmails.includes(user.email)) notFound();

  const clientId = Number(id);
  if (!Number.isFinite(clientId)) notFound();

  const admin = createAdminClient();

  const { data: client } = await admin
    .from("Clients")
    .select("id, business_name, twilio_number")
    .eq("id", clientId)
    .maybeSingle();

  if (!client) notFound();

  // Pull all inbound messages — we'll filter for keywords client-side since
  // we don't store keyword detection per-message
  const { data: messages } = await admin
    .from("sms_messages")
    .select("id, thread_id, direction, body, twilio_message_sid, created_at")
    .eq("client_id", clientId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(500);

  const events = (messages ?? [])
    .map((m) => ({ ...m, keyword: detectKeyword(m.body) }))
    .filter((m) => m.keyword !== null);

  // Pull current state of every thread that had at least one event
  const threadIds = Array.from(new Set(events.map((e) => e.thread_id)));
  const { data: threads } = threadIds.length
    ? await admin
        .from("sms_threads")
        .select("id, contact_phone, display_name, consent_status, last_message_at")
        .in("id", threadIds)
    : { data: [] };

  const threadById = new Map(
    (threads ?? []).map((t) => [t.id, t]),
  );

  // Aggregate counts
  const stopped = (threads ?? []).filter((t) => t.consent_status === "stopped").length;
  const helped = events.filter((e) => e.keyword === "help").length;
  const started = events.filter((e) => e.keyword === "start").length;
  const stopEvents = events.filter((e) => e.keyword === "stop").length;

  return (
    <div>
      <Link
        href={`/admin/clients/${client.id}`}
        className="inline-flex items-center gap-1.5 text-xs text-bone-400 hover:text-bone-50 mb-4"
      >
        <ArrowLeft size={12} />
        Back to client config
      </Link>

      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={14} className="text-field-500" />
        <span className="label-eyebrow">SMS Compliance</span>
      </div>
      <h1 className="text-2xl font-semibold text-bone-50 tracking-tight">
        {client.business_name}
      </h1>
      <p className="text-sm text-bone-300 mt-1">
        Audit log of all consent keywords (STOP, START, HELP) received on{" "}
        <span className="font-mono">{fmtPhoneDisplay(client.twilio_number ?? "")}</span>.
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5 mb-6">
        <Card label="Currently opted out" value={stopped} accent="danger" icon={AlertTriangle} />
        <Card label="STOP events" value={stopEvents} icon={AlertTriangle} />
        <Card label="HELP requests" value={helped} icon={MessageCircle} />
        <Card label="START re-opts" value={started} accent="ok" icon={CheckCircle2} />
      </div>

      {/* Event log */}
      <div className="panel">
        <div className="px-4 h-11 flex items-center border-b border-line">
          <h2 className="text-sm font-semibold text-bone-100">Event log</h2>
          <span className="ml-auto text-2xs text-bone-400">
            Latest {events.length} events
          </span>
        </div>
        {events.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-bone-400">
            No compliance keyword events on record.
          </div>
        ) : (
          <ul className="divide-y divide-line-subtle">
            {events.map((e) => {
              const thread = threadById.get(e.thread_id);
              const phone = thread?.contact_phone ?? "—";
              return (
                <li key={e.id} className="px-4 py-3 flex items-start gap-3">
                  <KeywordBadge keyword={e.keyword!} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="text-sm text-bone-100 font-mono">
                        {fmtPhoneDisplay(phone)}
                      </div>
                      <div className="text-2xs text-bone-400">
                        {new Date(e.created_at).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                    <div className="text-2xs text-bone-400 mt-0.5">
                      Body: <span className="font-mono">&ldquo;{e.body}&rdquo;</span>
                    </div>
                    {thread && (
                      <div className="text-2xs text-bone-400 mt-0.5">
                        Current status:{" "}
                        <ConsentChip status={thread.consent_status} />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: typeof AlertTriangle;
  accent?: "danger" | "ok";
}) {
  const valueColor =
    accent === "danger"
      ? "text-status-danger"
      : accent === "ok"
        ? "text-status-completed"
        : "text-bone-50";
  return (
    <div className="panel p-3">
      <div className="flex items-center gap-1.5 text-2xs text-bone-400 uppercase tracking-wider">
        <Icon size={11} />
        {label}
      </div>
      <div className={`text-2xl font-bold mt-1 num ${valueColor}`}>{value}</div>
    </div>
  );
}

function KeywordBadge({ keyword }: { keyword: "stop" | "start" | "help" }) {
  const styles = {
    stop: "bg-status-danger/15 text-status-danger border-status-danger/30",
    start: "bg-status-completed/15 text-status-completed border-status-completed/30",
    help: "bg-field-500/15 text-field-500 border-field-500/30",
  }[keyword];
  return (
    <span
      className={`shrink-0 px-2 h-6 text-2xs font-bold uppercase tracking-wider border rounded-sm flex items-center ${styles}`}
    >
      {keyword}
    </span>
  );
}

function ConsentChip({ status }: { status: string | null }) {
  const styles = {
    active: "text-status-completed",
    stopped: "text-status-danger",
    help_sent: "text-field-500",
  }[status ?? ""] ?? "text-bone-400";
  return <span className={`font-medium ${styles}`}>{status ?? "unknown"}</span>;
}
