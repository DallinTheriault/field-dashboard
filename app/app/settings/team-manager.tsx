"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  UserPlus,
  Loader2,
  Trash2,
  ShieldCheck,
  Users as UsersIcon,
  User as UserIcon,
  AlertCircle,
  History,
} from "lucide-react";
import {
  addTeamMemberByEmail,
  removeTeamMember,
  changeTeamMemberRole,
} from "./team-actions";
import {
  type Role,
  canAddRole,
  canChangeRole,
  canRemoveRole,
} from "@/lib/permissions/roles";

type Member = {
  id: number;
  auth_user_id: string;
  role: Role;
  email: string | null;
  is_self: boolean;
};

type AuditEntry = {
  id: number;
  action: "member_added" | "member_removed" | "role_changed";
  actor_email: string | null;
  actor_role_at_time: string;
  target_email: string;
  old_role: string | null;
  new_role: string | null;
  created_at: string;
};

/**
 * Team management UI. Hierarchy-aware: controls only show for actions
 * the caller is allowed to perform per lib/permissions/roles.
 *
 * Layout: list of members at top with inline role + remove controls;
 * "Add member" CTA below; recent activity log at bottom.
 */
export function TeamManager({
  clientId,
  members,
  callerRole,
  auditEntries,
}: {
  clientId: number;
  members: Member[];
  callerRole: Role;
  auditEntries: AuditEntry[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [email, setEmail] = useState("");
  // Default new-member role to lowest the caller can add
  const [newRole, setNewRole] = useState<Role>("member");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Roles the caller can add (filtered by canAddRole)
  const addableRoles: Role[] = (["member", "manager", "owner"] as Role[]).filter(
    (r) => canAddRole(callerRole, r),
  );

  function handleAdd() {
    setError(null);
    setSuccess(null);
    if (!email.trim()) {
      setError("Enter an email address.");
      return;
    }
    startTransition(async () => {
      const result = await addTeamMemberByEmail(clientId, email, newRole);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(`${email.trim()} added as ${newRole}.`);
      setEmail("");
      setAddOpen(false);
      router.refresh();
    });
  }

  function handleRemove(m: Member) {
    if (
      !confirm(
        `Remove ${m.email || "this member"} from the team? They'll lose access immediately.`,
      )
    )
      return;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await removeTeamMember(clientId, m.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess("Member removed.");
      router.refresh();
    });
  }

  function handleChangeRole(m: Member, target: Role) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await changeTeamMemberRole(clientId, m.id, target);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  // For each member, compute which role transitions the caller can do
  function allowedTransitions(m: Member): Role[] {
    const all: Role[] = ["owner", "manager", "member"];
    return all.filter(
      (r) => r !== m.role && canChangeRole(callerRole, m.role, r),
    );
  }

  return (
    <div className="px-4 py-3" id="team">
      {/* Members list */}
      <ul className="space-y-2 mb-3">
        {members.map((m) => {
          const transitions = allowedTransitions(m);
          const canRemove =
            !m.is_self && canRemoveRole(callerRole, m.role);
          const showControls = !m.is_self && (transitions.length > 0 || canRemove);

          return (
            <li
              key={m.id}
              className="flex flex-wrap items-center gap-2 group"
            >
              <RoleAvatar role={m.role} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-bone-100 truncate">
                  {m.email ?? "(unknown email)"}
                  {m.is_self && (
                    <span className="ml-1.5 text-2xs text-bone-400">(you)</span>
                  )}
                </div>
                <div className="text-2xs text-bone-400 capitalize">{m.role}</div>
              </div>
              {showControls && (
                <>
                  {transitions.length > 0 && (
                    <select
                      value={m.role}
                      onChange={(e) =>
                        handleChangeRole(m, e.target.value as Role)
                      }
                      disabled={pending}
                      className="!bg-ink-2 text-2xs h-7 py-0 pl-2 pr-7"
                      aria-label={`Change role for ${m.email}`}
                    >
                      <option value={m.role}>{cap(m.role)}</option>
                      {transitions.map((r) => (
                        <option key={r} value={r}>
                          {cap(r)}
                        </option>
                      ))}
                    </select>
                  )}
                  {canRemove && (
                    <button
                      type="button"
                      onClick={() => handleRemove(m)}
                      disabled={pending}
                      className="btn-ghost text-2xs h-7 px-2 hover:!text-status-danger"
                      title="Remove member"
                      aria-label={`Remove ${m.email}`}
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>

      {error && (
        <div className="rounded-sm border border-status-danger/40 bg-status-danger/[0.06] px-3 py-2 mb-3 flex items-start gap-2">
          <AlertCircle
            size={12}
            className="text-status-danger shrink-0 mt-0.5"
          />
          <p className="text-2xs text-bone-100 leading-relaxed">{error}</p>
        </div>
      )}
      {success && (
        <div className="text-2xs text-status-completed mb-3 px-1">
          {success}
        </div>
      )}

      {/* Add member */}
      {addableRoles.length > 0 ? (
        addOpen ? (
          <div className="bg-ink-2 border border-line rounded-sm p-3 space-y-2">
            <p className="text-2xs text-bone-400 leading-relaxed">
              The person you&apos;re adding must already have a Field account
              at this email. If they don&apos;t, ask them to sign up at{" "}
              <span className="font-mono text-bone-100">
                fielddashboard.netlify.app
              </span>{" "}
              first.
            </p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="member@example.com"
              autoFocus
              disabled={pending}
              className="w-full"
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as Role)}
              disabled={pending}
              className="w-full"
            >
              {addableRoles.includes("member") && (
                <option value="member">
                  Member — field worker, sees jobs and SMS (read-only SMS)
                </option>
              )}
              {addableRoles.includes("manager") && (
                <option value="manager">
                  Manager — manages members, can edit settings
                </option>
              )}
              {addableRoles.includes("owner") && (
                <option value="owner">
                  Owner — full access including billing
                </option>
              )}
            </select>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAdd}
                disabled={pending || !email.trim()}
                className="btn-primary text-xs h-8"
              >
                {pending ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <UserPlus size={11} />
                )}
                Add member
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddOpen(false);
                  setEmail("");
                  setError(null);
                }}
                disabled={pending}
                className="btn-ghost text-xs h-8"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="btn-secondary text-xs h-8"
          >
            <UserPlus size={11} />
            Add team member
          </button>
        )
      ) : (
        <p className="text-2xs text-bone-400 italic">
          You don&apos;t have permission to add team members.
        </p>
      )}

      {/* Activity log */}
      {auditEntries.length > 0 && (
        <div className="mt-5 pt-4 border-t border-line-subtle">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="text-2xs text-bone-400 hover:text-bone-100 inline-flex items-center gap-1.5"
          >
            <History size={11} />
            {showHistory ? "Hide" : "Show"} recent activity ({auditEntries.length})
          </button>
          {showHistory && (
            <ul className="mt-3 space-y-2">
              {auditEntries.map((e) => (
                <li
                  key={e.id}
                  className="text-2xs text-bone-300 leading-relaxed"
                >
                  <span className="text-bone-400">
                    {fmtAuditTime(e.created_at)}
                  </span>
                  {" — "}
                  <AuditLine entry={e} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function RoleAvatar({ role }: { role: Role }) {
  const Icon =
    role === "owner" ? ShieldCheck : role === "manager" ? UsersIcon : UserIcon;
  const color =
    role === "owner"
      ? "text-field-500"
      : role === "manager"
        ? "text-bone-100"
        : "text-bone-400";
  return (
    <div className="w-7 h-7 rounded-full bg-ink-2 border border-line flex items-center justify-center shrink-0">
      <Icon size={12} className={color} />
    </div>
  );
}

function AuditLine({ entry }: { entry: AuditEntry }) {
  const actor = entry.actor_email || `(${entry.actor_role_at_time})`;
  if (entry.action === "member_added") {
    return (
      <span>
        <strong className="text-bone-100">{actor}</strong> added{" "}
        <strong className="text-bone-100">{entry.target_email}</strong> as{" "}
        {entry.new_role}
      </span>
    );
  }
  if (entry.action === "member_removed") {
    return (
      <span>
        <strong className="text-bone-100">{actor}</strong> removed{" "}
        <strong className="text-bone-100">{entry.target_email}</strong> (was{" "}
        {entry.old_role})
      </span>
    );
  }
  return (
    <span>
      <strong className="text-bone-100">{actor}</strong> changed{" "}
      <strong className="text-bone-100">{entry.target_email}</strong> from{" "}
      {entry.old_role} to {entry.new_role}
    </span>
  );
}

function fmtAuditTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
