import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Building2,
  Palette,
  CalendarDays,
  FileText,
  Volume2,
  ChevronRight,
} from "lucide-react";
import { LogoUploader } from "./logo-uploader";
import { VoicePicker } from "./voice-picker";

export default async function SettingsPage() {
  const supabase = await createClient();

  const { data: clients } = await supabase
    .from("Clients")
    .select(
      "id, business_name, twilio_number, timezone, services, brand_logo_url, brand_primary_color, vapi_voice_id, owner_email, calendar_id",
    )
    .limit(1);

  const client = clients?.[0];

  const { data: calCx } = client
    ? await supabase
        .from("calendar_connections")
        .select("calendar_id, connected_at, last_refreshed_at")
        .eq("client_id", client.id)
        .maybeSingle()
    : { data: null };

  return (
    <div>
      <div className="label-eyebrow mb-1">Settings</div>
      <h1 className="text-2xl font-semibold text-bone-50 tracking-tight">
        Business settings
      </h1>
      <p className="text-sm text-bone-300 mt-1 mb-8">
        Configure how your assistant identifies and represents your business.
      </p>

      <div className="space-y-3 max-w-3xl">
        {/* Business info */}
        <Section
          icon={Building2}
          title="Business profile"
          subtitle="Name, contact, and timezone"
        >
          <FieldRow label="Business name" value={client?.business_name ?? "—"} />
          <FieldRow
            label="Twilio number"
            value={client?.twilio_number ?? "—"}
            mono
          />
          <FieldRow label="Owner email" value={client?.owner_email ?? "—"} />
          <FieldRow label="Timezone" value={client?.timezone ?? "—"} />
          <FieldRow
            label="Services"
            value={client?.services ?? "—"}
            multiline
          />
        </Section>

        {/* Branding — now interactive */}
        <Section icon={Palette} title="Branding" subtitle="Logo and primary color">
          <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-6">
            <LogoUploader initialUrl={client?.brand_logo_url ?? null} />
            <div>
              <div className="label-eyebrow mb-2">Primary color</div>
              <div className="flex items-center gap-2">
                <span
                  className="w-7 h-7 rounded-sm border border-line-strong shrink-0"
                  style={{
                    background: client?.brand_primary_color ?? "#FF6B6B",
                  }}
                />
                <span className="num text-xs text-bone-300">
                  {client?.brand_primary_color ?? "#FF6B6B"}
                </span>
                {!client?.brand_primary_color && (
                  <span className="text-2xs text-bone-400 ml-1">(default)</span>
                )}
              </div>
              <p className="text-2xs text-bone-400 mt-3 leading-relaxed">
                Color customization is coming in a future release. Right now
                everyone uses the default Field salmon accent.
              </p>
            </div>
          </div>
        </Section>

        {/* Voice — now interactive */}
        <Section
          icon={Volume2}
          title="Assistant voice"
          subtitle="ElevenLabs voice for your assistant"
        >
          <div className="px-4 py-4">
            <VoicePicker initialVoiceId={client?.vapi_voice_id ?? null} />
          </div>
        </Section>

        {/* Calendar */}
        <Section
          icon={CalendarDays}
          title="Google Calendar"
          subtitle="Where bookings get added"
        >
          <div className="px-4 py-3.5">
            {calCx ? (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-status-completed" />
                  <span className="text-sm text-bone-100">Connected</span>
                </div>
                <div className="text-xs text-bone-400 mb-3 break-all">
                  {calCx.calendar_id}
                </div>
                <button className="btn-secondary text-xs h-8" disabled>
                  Reconnect (coming soon)
                </button>
              </>
            ) : client?.calendar_id ? (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-status-progress" />
                  <span className="text-sm text-bone-100">Service-account share</span>
                </div>
                <div className="text-xs text-bone-400 mb-3 break-all">
                  {client.calendar_id}
                </div>
                <p className="text-2xs text-bone-400 mb-3 max-w-md">
                  This calendar is shared with the Field service account. For
                  better isolation, switch to per-tenant OAuth below.
                </p>
                <button className="btn-secondary text-xs h-8" disabled>
                  Connect with Google (coming in v0.4)
                </button>
              </>
            ) : (
              <>
                <div className="text-sm text-bone-100 mb-2">
                  No calendar connected
                </div>
                <button className="btn-primary text-xs h-8" disabled>
                  Connect Google Calendar (coming in v0.4)
                </button>
              </>
            )}
          </div>
        </Section>

        {/* Prompt */}
        <Section
          icon={FileText}
          title="Voice assistant prompt"
          subtitle="Personality and tool-routing logic"
        >
          <div className="px-4 py-3.5">
            <p className="text-xs text-bone-400 mb-3 max-w-md">
              The system prompt that defines how your assistant talks, what it
              captures, and when it uses each tool.
            </p>
            <Link
              href="/app/settings/prompt"
              className="btn-secondary text-xs h-8 inline-flex"
            >
              View prompt
              <ChevronRight size={12} />
            </Link>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof Building2;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="panel">
      <div className="px-4 h-12 flex items-center gap-3 border-b border-line">
        <Icon size={14} className="text-salmon-500" strokeWidth={1.8} />
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-bone-100">{title}</h2>
          <p className="text-2xs text-bone-400 mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="divide-y divide-line-subtle">{children}</div>
    </div>
  );
}

function FieldRow({
  label,
  value,
  mono,
  multiline,
}: {
  label: string;
  value: string;
  mono?: boolean;
  multiline?: boolean;
}) {
  return (
    <div className="px-4 py-2.5 grid grid-cols-3 gap-3 items-baseline">
      <dt className="text-xs text-bone-400">{label}</dt>
      <dd
        className={`col-span-2 text-xs text-bone-100 ${mono ? "font-mono" : ""} ${multiline ? "whitespace-pre-wrap" : "truncate"}`}
      >
        {value}
      </dd>
    </div>
  );
}
