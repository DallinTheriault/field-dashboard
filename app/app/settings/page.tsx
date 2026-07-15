import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  Building2,
  Palette,
  CalendarDays,
  FileText,
  Volume2,
  ChevronRight,
  MessageSquareText,
  ScanLine,
  Users,
} from "lucide-react";
import { LogoUploader } from "./logo-uploader";
import { VoicePicker } from "./voice-picker";
import { BusinessProfileForm } from "./profile-form";
import { ColorPicker } from "./color-picker";
import { ReplyTemplatesManager } from "./reply-templates-manager";
import { TeamManager } from "./team-manager";
import { MyProfileForm } from "./my-profile-form";
import { NotificationPrefsForm } from "./notification-prefs-form";
import { ReceiptAiStatus } from "./receipt-ai-toggle";
import { getCurrentUserRole } from "@/lib/permissions/current-role";
import {
  canViewSettings,
  canEditBusinessProfile,
  canEditBranding,
  canManageSmsTemplates,
  type Role,
  isValidRole,
} from "@/lib/permissions/roles";

export default async function SettingsPage() {
  const supabase = await createClient();

  const session = await getCurrentUserRole();
  if (!session) {
    redirect("/login");
  }

  // Members can't see Settings — they only see their Team page (rendered
  // separately at /app/team for read-only access). Bounce them.
  if (!canViewSettings(session.role)) {
    redirect("/app/team");
  }

  const { data: clients } = await supabase
    .from("Clients")
    .select(
      "id, business_name, business_short_name, owner_first_name, owner_email, owner_phone, twilio_number, timezone, services, brand_logo_url, brand_primary_color, vapi_voice_id, calendar_id, business_website, business_hours, service_area, pricing_block, scope_values, service_constraints, escalation_phone, notify_email, notify_dashboard_ping, notify_sms, feature_receipt_ai_enabled",
    )
    .limit(1);

  const client = clients?.[0];

  // Fetch current user for "My profile" section
  const { data: { user: currentUser } } = await supabase.auth.getUser();
  const currentUserDisplayName =
    (currentUser?.user_metadata as { display_name?: string } | null | undefined)
      ?.display_name ?? "";
  const currentUserEmail = currentUser?.email ?? "";

  const { data: calCx } = client
    ? await supabase
        .from("calendar_connections")
        .select("calendar_id, connected_at, last_refreshed_at")
        .eq("client_id", client.id)
        .maybeSingle()
    : { data: null };

  // Scan meter for the AI Receipt Scanning card — this month, tenant rows
  // only (RLS). The meter is service-role-written; members can only read.
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const { count: scansThisMonth } = client
    ? await supabase
        .from("receipt_scans")
        .select("id", { count: "exact", head: true })
        .gte("created_at", monthStart.toISOString())
    : { count: 0 };

  // Team members for the current tenant
  let teamMembers: Array<{
    id: number;
    auth_user_id: string;
    role: Role;
    email: string | null;
    is_self: boolean;
  }> = [];
  let auditEntries: Array<{
    id: number;
    action: "member_added" | "member_removed" | "role_changed";
    actor_email: string | null;
    actor_role_at_time: string;
    target_email: string;
    old_role: string | null;
    new_role: string | null;
    created_at: string;
  }> = [];

  if (client) {
    const admin = createAdminClient();
    const { data: memberships } = await admin
      .from("client_users")
      .select("id, auth_user_id, role, created_at")
      .eq("client_id", client.id)
      .order("created_at", { ascending: true });

    const { data: usersData } = await admin.auth.admin.listUsers();
    const userById = new Map(
      (usersData?.users ?? []).map((u) => [u.id, u.email ?? null]),
    );

    if (memberships && memberships.length > 0) {
      teamMembers = memberships
        .filter((m) => isValidRole(m.role))
        .map((m) => ({
          id: m.id,
          auth_user_id: m.auth_user_id,
          role: m.role as Role,
          email: userById.get(m.auth_user_id) ?? null,
          is_self: m.auth_user_id === session.userId,
        }));
    }

    // Recent audit entries (last 25) for the activity log section
    const { data: audit } = await admin
      .from("team_audit_log")
      .select(
        "id, action, actor_user_id, actor_role_at_time, target_email, old_role, new_role, created_at",
      )
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .limit(25);

    auditEntries = (audit ?? []).map((e) => ({
      id: e.id,
      action: e.action,
      actor_email: userById.get(e.actor_user_id) ?? null,
      actor_role_at_time: e.actor_role_at_time,
      target_email: e.target_email,
      old_role: e.old_role,
      new_role: e.new_role,
      created_at: e.created_at,
    }));
  }

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
        {/* My profile — display name editor for the signed-in user */}
        <MyProfileForm
          initialDisplayName={currentUserDisplayName}
          email={currentUserEmail}
        />

        {/* Notifications — owner-level prefs for new lead alerts */}
        {client && (
          <NotificationPrefsForm
            clientId={client.id}
            initial={{
              notify_email: client.notify_email ?? true,
              notify_dashboard_ping: client.notify_dashboard_ping ?? true,
              notify_sms: client.notify_sms ?? false,
            }}
          />
        )}

        {/* Team — top of page since it's account-level, not business-level */}
        {client && teamMembers.length > 0 && (
          <Section
            icon={Users}
            title="Team"
            subtitle="People with access to this dashboard"
          >
            <TeamManager
              clientId={client.id}
              members={teamMembers}
              callerRole={session.role}
              auditEntries={auditEntries}
            />
          </Section>
        )}

        {/* Identity (read-only — operator-managed) */}
        <Section
          icon={Building2}
          title="Identity"
          subtitle="Operator-managed. Reach out if anything's wrong."
        >
          <FieldRow label="Business name" value={client?.business_name ?? "—"} />
          <FieldRow
            label="Twilio number"
            value={client?.twilio_number ?? "—"}
            mono
          />
          <FieldRow label="Timezone" value={client?.timezone ?? "—"} />
        </Section>

        {/* Editable profile */}
        <Section
          icon={Building2}
          title="Business profile"
          subtitle="Hours, area, owner contact, pricing, scope"
        >
          <BusinessProfileForm
            initial={{
              business_short_name: client?.business_short_name ?? "",
              owner_first_name: client?.owner_first_name ?? "",
              owner_email: client?.owner_email ?? "",
              owner_phone: client?.owner_phone ?? "",
              business_website: client?.business_website ?? "",
              business_hours: client?.business_hours ?? "",
              service_area: client?.service_area ?? "",
              pricing_block: client?.pricing_block ?? "",
              scope_values: client?.scope_values ?? "",
              service_constraints: client?.service_constraints ?? "",
              escalation_phone: client?.escalation_phone ?? "",
            }}
          />
        </Section>

        {/* Branding */}
        <Section icon={Palette} title="Branding" subtitle="Logo and primary color">
          <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-6">
            <LogoUploader initialUrl={client?.brand_logo_url ?? null} />
            <ColorPicker initial={client?.brand_primary_color ?? null} />
          </div>
        </Section>

        {/* Voice */}
        <Section
          icon={Volume2}
          title="Assistant voice"
          subtitle="ElevenLabs voice for your assistant"
        >
          <div className="px-4 py-4">
            <VoicePicker initialVoiceId={client?.vapi_voice_id ?? null} />
          </div>
        </Section>

        {/* AI Receipt Scanning — platform grant, read-only here */}
        <Section
          icon={ScanLine}
          title="AI Receipt Scanning"
          subtitle="Photograph a receipt, review the extracted items"
        >
          <ReceiptAiStatus
            enabled={client?.feature_receipt_ai_enabled ?? false}
            scansThisMonth={scansThisMonth ?? 0}
          />
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
                  Connect with Google (coming in v0.5)
                </button>
              </>
            ) : (
              <>
                <div className="text-sm text-bone-100 mb-2">
                  No calendar connected
                </div>
                <button className="btn-primary text-xs h-8" disabled>
                  Connect Google Calendar (coming in v0.5)
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

        {/* SMS Reply Templates */}
        {client && (
          <Section
            icon={MessageSquareText}
            title="SMS reply templates"
            subtitle="Saved replies you can insert into the SMS reply box with one tap"
          >
            <ReplyTemplatesManager clientId={client.id} />
          </Section>
        )}
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
        <Icon size={14} className="text-field-500" strokeWidth={1.8} />
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
        className={`col-span-2 text-xs text-bone-100 ${mono ? "font-mono" : ""} ${
          multiline ? "whitespace-pre-wrap" : "truncate"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
