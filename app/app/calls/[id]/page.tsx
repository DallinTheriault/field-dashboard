import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Phone, ExternalLink, Briefcase } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatusChip } from "@/components/ui/status-chip";
import { getTenantTimezone } from "@/lib/dates";

function fmtDate(d: string | null, tz: string): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", { timeZone: tz,
    weekday: "short",
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

function fmtDollar(c: number | null): string {
  if (c == null) return "—";
  return `$${(c / 100).toFixed(2)}`;
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

export default async function CallDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const tz = await getTenantTimezone();
  const supabase = await createClient();
  const { id } = await params;

  const { data: call } = await supabase
    .from("call_summaries")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!call) notFound();

  let job = null;
  if (call.job_id) {
    const { data: j } = await supabase
      .from("jobs")
      .select("id, name, address, service, status, start_datetime")
      .eq("id", call.job_id)
      .maybeSingle();
    job = j;
  }

  // For voicemail outcomes, fetch the linked message body so it appears inline.
  let voicemail: {
    id: number;
    message_body: string | null;
    callback_phone: string | null;
    created_at: string;
  } | null = null;
  if (call.outcome === "message_left") {
    const { data: m } = await supabase
      .from("messages")
      .select("id, message_body, callback_phone, created_at")
      .eq("call_summary_id", call.id)
      .maybeSingle();
    voicemail = m ?? null;
  }

  return (
    <div>
      <Link
        href="/app/calls"
        className="inline-flex items-center gap-1.5 text-xs text-bone-400 hover:text-bone-50 mb-4"
      >
        <ArrowLeft size={12} />
        Back to calls
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Phone size={14} className="text-field-500" />
            <span className="label-eyebrow">Call</span>
          </div>
          <h1 className="text-2xl font-semibold text-bone-50 tracking-tight">
            {call.contact_id ? (
              <Link
                href={`/app/contacts/${call.contact_id}`}
                className="hover:text-field-500"
              >
                {call.caller_name || "Unknown caller"}
              </Link>
            ) : (
              call.caller_name || "Unknown caller"
            )}
          </h1>
          <p className="num text-sm text-bone-300 mt-1">
            {fmtPhone(call.caller_phone)} · {fmtDate(call.started_at, tz)}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="num text-2xl font-semibold text-bone-50">
            {fmtDuration(call.duration_seconds)}
          </div>
          <div className="text-2xs text-bone-400 mt-1">
            {fmtDollar(call.cost_cents)} cost
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Transcript / summary — wider column */}
        <section className="lg:col-span-3 space-y-5">
          <div className="panel">
            <div className="px-4 h-11 flex items-center border-b border-line">
              <h2 className="text-sm font-semibold text-bone-100">Summary</h2>
            </div>
            <div className="px-4 py-4">
              {call.summary ? (
                <p className="text-sm text-bone-100 leading-relaxed whitespace-pre-wrap">
                  {call.summary}
                </p>
              ) : (
                <p className="text-sm text-bone-400 italic">
                  Summary not available for this call.
                </p>
              )}
            </div>
          </div>

          {call.transcript_url && (
            <div className="panel">
              <div className="px-4 h-11 flex items-center justify-between border-b border-line">
                <h2 className="text-sm font-semibold text-bone-100">Transcript</h2>
                <a
                  href={call.transcript_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-2xs text-bone-400 hover:text-bone-50 flex items-center gap-1"
                >
                  Open <ExternalLink size={11} />
                </a>
              </div>
              <div className="px-4 py-4">
                <p className="text-xs text-bone-400">
                  Transcript hosted at VAPI. Click "Open" to view in new tab.
                </p>
              </div>
            </div>
          )}

          {voicemail && (
            <div className="panel">
              <div className="px-4 h-11 flex items-center justify-between border-b border-line">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-field-500" />
                  <h2 className="text-sm font-semibold text-bone-100">Voicemail</h2>
                </div>
                {voicemail.callback_phone && (
                  <a
                    href={`tel:${voicemail.callback_phone}`}
                    className="text-2xs text-bone-400 hover:text-bone-50"
                  >
                    Call back {fmtPhone(voicemail.callback_phone)}
                  </a>
                )}
              </div>
              <div className="px-4 py-4">
                <p className="text-sm text-bone-100 leading-relaxed whitespace-pre-wrap">
                  {voicemail.message_body || "(no transcript)"}
                </p>
              </div>
            </div>
          )}

          {call.recording_url && (
            <div className="panel">
              <div className="px-4 h-11 flex items-center border-b border-line">
                <h2 className="text-sm font-semibold text-bone-100">Recording</h2>
              </div>
              <div className="px-4 py-4">
                <audio
                  controls
                  preload="none"
                  src={call.recording_url}
                  className="w-full"
                >
                  Your browser does not support audio playback.
                </audio>
              </div>
            </div>
          )}
        </section>

        {/* Metadata sidebar */}
        <aside className="lg:col-span-2 space-y-3">
          <div className="panel p-4">
            <div className="label-eyebrow mb-3">Details</div>
            <dl className="space-y-2 text-xs">
              <DetailRow label="Intent" value={call.intent?.replace(/_/g, " ") ?? "—"} />
              <DetailRow label="Outcome" value={call.outcome?.replace(/_/g, " ") ?? "—"} />
              <DetailRow
                label="VAPI Call ID"
                value={call.vapi_call_id ?? "—"}
                mono
              />
              <DetailRow label="Started" value={fmtDate(call.started_at, tz)} />
              <DetailRow label="Ended" value={fmtDate(call.ended_at, tz)} />
            </dl>
          </div>

          {job && (
            <div className="panel">
              <div className="px-4 h-11 flex items-center justify-between border-b border-line">
                <div className="flex items-center gap-2">
                  <Briefcase size={13} className="text-bone-400" />
                  <h2 className="text-sm font-semibold text-bone-100">Linked job</h2>
                </div>
                <Link
                  href={`/app/jobs/${job.id}`}
                  className="text-2xs text-bone-400 hover:text-bone-50"
                >
                  View →
                </Link>
              </div>
              <div className="px-4 py-3">
                <div className="text-sm text-bone-100 font-medium mb-1">
                  {job.name || "—"}
                </div>
                <div className="text-2xs text-bone-400 mb-2">
                  {job.service || "—"} · {job.address || "—"}
                </div>
                <StatusChip status={job.status} />
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-bone-400">{label}</dt>
      <dd className={mono ? "font-mono text-bone-100 truncate" : "text-bone-100 capitalize"}>
        {value}
      </dd>
    </div>
  );
}
