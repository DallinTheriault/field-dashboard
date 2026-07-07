import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ArrowLeft,
  Phone,
  User,
  Clock,
  Voicemail as VoicemailIcon,
  PhoneCall,
} from "lucide-react";
import { fmtPhoneDisplay } from "@/lib/sms/phone";
import { TextAndCopyButtons } from "@/components/ui/text-copy-buttons";
import { MarkRespondedButton } from "./mark-responded-button";
import { getTenantTimezone } from "@/lib/dates";

export const dynamic = "force-dynamic";

function fmtClock(iso: string, tz: string): string {
  return new Date(iso).toLocaleString("en-US", { timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function VoicemailDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const tz = await getTenantTimezone();
  const { id } = await params;
  const voicemailId = Number(id);
  if (!Number.isFinite(voicemailId)) notFound();

  const supabase = await createClient();

  // RLS-scoped lookup — if user can't see this voicemail, this returns null
  const { data: voicemail } = await supabase
    .from("messages")
    .select(
      "id, client_id, caller_name, caller_phone, callback_phone, message_body, call_summary_id, contact_id, read_at, responded_at, created_at",
    )
    .eq("id", voicemailId)
    .maybeSingle();

  if (!voicemail) notFound();

  // Mark read on first view (admin client because RLS is select-only on messages)
  if (!voicemail.read_at) {
    const admin = createAdminClient();
    await admin
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("id", voicemailId);
  }

  // Pull related contact and call summary if they exist
  const [contactRes, summaryRes] = await Promise.all([
    voicemail.contact_id
      ? supabase
          .from("contacts")
          .select("id, name, phone, email, address")
          .eq("id", voicemail.contact_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    voicemail.call_summary_id
      ? supabase
          .from("call_summaries")
          .select(
            "id, duration_seconds, intent, outcome, recording_url, summary, started_at",
          )
          .eq("id", voicemail.call_summary_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const contact = contactRes.data;
  const summary = summaryRes.data;

  // Phone we'd call back on. Prefer explicit callback_phone if the caller
  // gave a different number for follow-up.
  const callbackPhone = voicemail.callback_phone || voicemail.caller_phone;
  const callerName = voicemail.caller_name || "Unknown caller";

  return (
    <div>
      <Link
        href="/app/calls?tab=voicemails"
        className="text-2xs text-bone-400 hover:text-bone-100 inline-flex items-center gap-1 mb-3"
      >
        <ArrowLeft size={11} />
        Back to voicemails
      </Link>

      {/* Header */}
      <div className="panel mb-4">
        <div className="px-4 py-3">
          {/* Title block — full width, no buttons crammed beside */}
          <div className="flex items-center gap-2 mb-1">
            <VoicemailIcon size={11} className="text-field-500" />
            <span className="label-eyebrow">Voicemail</span>
          </div>
          <h1 className="text-lg font-semibold text-bone-50 break-words">
            {callerName}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-2xs text-bone-400">
            {callbackPhone && (
              <span className="font-mono">
                {fmtPhoneDisplay(callbackPhone)}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Clock size={10} />
              {fmtClock(voicemail.created_at, tz)}
            </span>
            {voicemail.responded_at && (
              <span className="text-status-completed">
                Responded {fmtClock(voicemail.responded_at, tz)}
              </span>
            )}
          </div>

          {/* Action buttons — separate row, wraps freely on narrow screens */}
          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            {callbackPhone && (
              <>
                <a
                  href={`tel:${callbackPhone}`}
                  className="btn-secondary text-xs h-8"
                >
                  <PhoneCall size={11} />
                  Call back
                </a>
                <TextAndCopyButtons
                  phone={callbackPhone}
                  contactId={voicemail.contact_id ?? null}
                  displayPhone={fmtPhoneDisplay(callbackPhone)}
                />
              </>
            )}
            {contact && (
              <Link
                href={`/app/contacts/${contact.id}`}
                className="btn-secondary text-xs h-8"
              >
                <User size={11} />
                Contact
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Message body */}
      <div className="panel mb-4">
        <div className="px-4 py-3 border-b border-line-subtle flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-sm font-medium text-bone-50">Message</h2>
          <MarkRespondedButton
            voicemailId={voicemail.id}
            currentlyResponded={Boolean(voicemail.responded_at)}
          />
        </div>
        <div className="px-4 py-4">
          <p className="text-sm text-bone-100 leading-relaxed whitespace-pre-wrap break-words">
            {voicemail.message_body || (
              <span className="italic text-bone-400">(No transcript)</span>
            )}
          </p>
        </div>
      </div>

      {/* Linked call summary */}
      {summary && (
        <div className="panel mb-4">
          <div className="px-4 py-3 border-b border-line-subtle flex items-center justify-between">
            <h2 className="text-sm font-medium text-bone-50">From the call</h2>
            <Link
              href={`/app/calls/${summary.id}`}
              className="text-2xs text-field-500 hover:underline"
            >
              View full call →
            </Link>
          </div>
          <div className="px-4 py-4 space-y-2 text-xs">
            {summary.summary && (
              <p className="text-bone-100 leading-relaxed">{summary.summary}</p>
            )}
            <dl className="grid grid-cols-2 gap-y-1 gap-x-4 text-bone-400 mt-3">
              {summary.duration_seconds != null && (
                <>
                  <dt>Duration</dt>
                  <dd className="text-bone-100 font-mono">
                    {Math.round(Number(summary.duration_seconds))}s
                  </dd>
                </>
              )}
              {summary.intent && (
                <>
                  <dt>Intent</dt>
                  <dd className="text-bone-100">{summary.intent}</dd>
                </>
              )}
              {summary.outcome && (
                <>
                  <dt>Outcome</dt>
                  <dd className="text-bone-100">{summary.outcome}</dd>
                </>
              )}
              {summary.started_at && (
                <>
                  <dt>Started</dt>
                  <dd className="text-bone-100">
                    {fmtClock(summary.started_at, tz)}
                  </dd>
                </>
              )}
            </dl>
            {summary.recording_url && (
              <div className="pt-2">
                <audio
                  controls
                  src={summary.recording_url}
                  className="w-full h-9"
                  preload="none"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Linked contact preview */}
      {contact && (
        <div className="panel">
          <div className="px-4 py-3 border-b border-line-subtle">
            <h2 className="text-sm font-medium text-bone-50">Contact on file</h2>
          </div>
          <div className="px-4 py-3 space-y-1 text-xs">
            <div className="text-bone-100 font-medium text-sm">
              {contact.name || fmtPhoneDisplay(contact.phone || "")}
            </div>
            <dl className="text-bone-400 space-y-0.5">
              {contact.phone && (
                <div className="flex gap-2">
                  <dt className="w-14">Phone</dt>
                  <dd className="text-bone-100 font-mono">
                    {fmtPhoneDisplay(contact.phone)}
                  </dd>
                </div>
              )}
              {contact.email && (
                <div className="flex gap-2">
                  <dt className="w-14">Email</dt>
                  <dd className="text-bone-100">{contact.email}</dd>
                </div>
              )}
              {contact.address && (
                <div className="flex gap-2">
                  <dt className="w-14">Address</dt>
                  <dd className="text-bone-100">{contact.address}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
