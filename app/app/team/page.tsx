import { redirect } from "next/navigation";
import { ShieldCheck, Users as UsersIcon, User as UserIcon } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/permissions/current-role";
import { isValidRole, type Role } from "@/lib/permissions/roles";

/**
 * Team page — visible to all roles. Members get a read-only view of who
 * else is on the team. Owners and managers can also see this but their
 * full management UI lives at /app/settings#team.
 *
 * Pre-v1 plan: render a hierarchy chart (owner at top, managers below,
 * members at bottom). For now: simple grouped list, owner-first.
 */
export default async function TeamPage() {
  const session = await getCurrentUserRole();
  if (!session) redirect("/login");

  const admin = createAdminClient();
  const { data: memberships } = await admin
    .from("client_users")
    .select("id, auth_user_id, role, created_at")
    .eq("client_id", session.clientId)
    .order("created_at", { ascending: true });

  const { data: usersData } = await admin.auth.admin.listUsers();
  const userById = new Map(
    (usersData?.users ?? []).map((u) => [u.id, u.email ?? null]),
  );

  const members = (memberships ?? [])
    .filter((m) => isValidRole(m.role))
    .map((m) => ({
      id: m.id,
      role: m.role as Role,
      email: userById.get(m.auth_user_id) ?? null,
      isSelf: m.auth_user_id === session.userId,
    }));

  const owners = members.filter((m) => m.role === "owner");
  const managers = members.filter((m) => m.role === "manager");
  const memberRows = members.filter((m) => m.role === "member");

  return (
    <div>
      <div className="label-eyebrow mb-1">Team</div>
      <h1 className="text-2xl font-semibold text-bone-50 tracking-tight">
        Your team
      </h1>
      <p className="text-sm text-bone-300 mt-1 mb-8">
        People with access to this dashboard.
      </p>

      <div className="space-y-5 max-w-2xl">
        {owners.length > 0 && (
          <Group title="Owners" icon={ShieldCheck} accent="text-field-500">
            {owners.map((m) => (
              <PersonRow key={m.id} email={m.email} isSelf={m.isSelf} />
            ))}
          </Group>
        )}
        {managers.length > 0 && (
          <Group title="Managers" icon={UsersIcon} accent="text-bone-100">
            {managers.map((m) => (
              <PersonRow key={m.id} email={m.email} isSelf={m.isSelf} />
            ))}
          </Group>
        )}
        {memberRows.length > 0 && (
          <Group title="Members" icon={UserIcon} accent="text-bone-400">
            {memberRows.map((m) => (
              <PersonRow key={m.id} email={m.email} isSelf={m.isSelf} />
            ))}
          </Group>
        )}
      </div>
    </div>
  );
}

function Group({
  title,
  icon: Icon,
  accent,
  children,
}: {
  title: string;
  icon: typeof ShieldCheck;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="panel">
      <div className="px-4 h-11 flex items-center border-b border-line gap-2">
        <Icon size={13} className={accent} />
        <h2 className="text-sm font-semibold text-bone-100">{title}</h2>
      </div>
      <ul className="divide-y divide-line-subtle">{children}</ul>
    </div>
  );
}

function PersonRow({ email, isSelf }: { email: string | null; isSelf: boolean }) {
  return (
    <li className="px-4 py-3 text-sm text-bone-100">
      {email ?? "(unknown email)"}
      {isSelf && <span className="ml-2 text-2xs text-bone-400">(you)</span>}
    </li>
  );
}
