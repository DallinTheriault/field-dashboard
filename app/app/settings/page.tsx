import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Building2, Palette, ScanLine, Users } from "lucide-react";
import { LogoUploader } from "./logo-uploader";
import { BusinessProfileForm } from "./profile-form";
import { ColorPicker } from "./color-picker";
import { TeamManager } from "./team-manager";
import { MyProfileForm } from "./my-profile-form";
import { ReceiptAiStatus } from "./receipt-ai-toggle";
import { getCurrentUserRole } from "@/lib/permissions/current-role";
import {
  canViewSettings,
  type Role,
  isValidRole,
} from "@/lib/permissions/roles";

export default async function SettingsPage() {
  const supabase = await createClient();
  const admin = createAdminClient();

  // Scan meter for the AI Receipt Scanning card — this month, tenant rows
  // only (RLS). The meter is service-role-written; members can only read.
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  // Two rounds: everything that doesn't need the business id at once, then
  // the team and its audit log (read with the admin client, so scoped by the
  // session's business id, never by RLS).
  const [session, { data: clients }, { data: { user: currentUser } }, { count: scansThisMonth }, { data: usersData }] =
    await Promise.all([
      getCurrentUserRole(),
      supabase
        .from("Clients")
        .select(
          "id, business_name, business_short_name, owner_first_name, owner_email, owner_phone, timezone, brand_logo_url, brand_primary_color, business_website, feature_receipt_ai_enabled",
        )
        .limit(1),
      // Current user for "My profile" (their latest name, not the session's copy).
      supabase.auth.getUser(),
      supabase
        .from("receipt_scans")
        .select("id", { count: "exact", head: true })
        .gte("created_at", monthStart.toISOString()),
      admin.auth.admin.listUsers(),
    ]);
  if (!session) {
    redirect("/login");
  }

  // Members can't see Settings — they only see their Team page (rendered
  // separately at /app/team for read-only access). Bounce them.
  if (!canViewSettings(session.role)) {
    redirect("/app/team");
  }

  const client = clients?.[0];
  const currentUserDisplayName =
    (currentUser?.user_metadata as { display_name?: string } | null | undefined)
      ?.display_name ?? "";
  const currentUserEmail = currentUser?.email ?? "";

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
    const [{ data: memberships }, { data: audit }] = await Promise.all([
      admin
        .from("client_users")
        .select("id, auth_user_id, role, created_at")
        .eq("client_id", session.clientId)
        .order("created_at", { ascending: true }),
      // Recent audit entries (last 25) for the activity log section
      admin
        .from("team_audit_log")
        .select(
          "id, action, actor_user_id, actor_role_at_time, target_email, old_role, new_role, created_at",
        )
        .eq("client_id", session.clientId)
        .order("created_at", { ascending: false })
        .limit(25),
    ]);
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
        Your business details, team, branding and connections.
      </p>

      <div className="space-y-3 max-w-3xl">
        {/* My profile — display name editor for the signed-in user */}
        <MyProfileForm
          initialDisplayName={currentUserDisplayName}
          email={currentUserEmail}
        />

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
          <FieldRow label="Timezone" value={client?.timezone ?? "—"} />
        </Section>

        {/* Editable profile */}
        <Section
          icon={Building2}
          title="Business profile"
          subtitle="Owner contact and website"
        >
          <BusinessProfileForm
            initial={{
              business_short_name: client?.business_short_name ?? "",
              owner_first_name: client?.owner_first_name ?? "",
              owner_email: client?.owner_email ?? "",
              owner_phone: client?.owner_phone ?? "",
              business_website: client?.business_website ?? "",
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
