"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  UserPlus,
  Loader2,
  Trash2,
  ShieldCheck,
  User as UserIcon,
  AlertCircle,
} from "lucide-react";
import {
  addTeamMemberByEmail,
  removeTeamMember,
  changeTeamMemberRole,
} from "./team-actions";

type Member = {
  id: number;
  auth_user_id: string;
  role: string;
  email: string | null;
  is_self: boolean;
};

/**
 * Team management UI. Owner-only mutations. Lists current members with
 * their email + role, allows adding a member by email (must be an
 * existing Field user), changing role, and removing.
 */
export function TeamManager({
  clientId,
  members,
  callerIsOwner,
}: {
  clientId: number;
  members: Member[];
  callerIsOwner: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"owner" | "manager">("manager");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function handleAdd() {
    setError(null);
    setSuccess(null);
    if (!email.trim()) {
      setError("Enter an email address.");
      return;
    }
    startTransition(async () => {
      const result = await addTeamMemberByEmail(clientId, email, role);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(`${email} added as ${role}.`);
      setEmail("");
      setAddOpen(false);
      router.refresh();
    });
  }

  function handleRemove(membershipId: number, memberEmail: string | null) {
    if (
      !confirm(
        `Remove ${memberEmail || "this member"} from the team? They'll lose access immediately.`,
      )
    )
      return;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await removeTeamMember(clientId, membershipId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess("Member removed.");
      router.refresh();
    });
  }

  function handleChangeRole(membershipId: number, newRole: "owner" | "manager") {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await changeTeamMemberRole(clientId, membershipId, newRole);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="px-4 py-3" id="team">
      {/* Members list */}
      <ul className="space-y-2 mb-3">
        {members.map((m) => (
          <li
            key={m.id}
            className="flex items-center gap-2 group"
          >
            <div className="w-7 h-7 rounded-full bg-ink-2 border border-line flex items-center justify-center shrink-0">
              {m.role === "owner" ? (
                <ShieldCheck size={12} className="text-field-500" />
              ) : (
                <UserIcon size={12} className="text-bone-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-bone-100 truncate">
                {m.email ?? "(unknown email)"}
                {m.is_self && (
                  <span className="ml-1.5 text-2xs text-bone-400">(you)</span>
                )}
              </div>
              <div className="text-2xs text-bone-400 capitalize">{m.role}</div>
            </div>
            {callerIsOwner && !m.is_self && (
              <>
                <select
                  value={m.role}
                  onChange={(e) =>
                    handleChangeRole(
                      m.id,
                      e.target.value as "owner" | "manager",
                    )
                  }
                  disabled={pending}
                  className="!bg-ink-2 text-2xs h-7 py-0 pl-2 pr-7"
                  aria-label={`Change role for ${m.email}`}
                >
                  <option value="manager">Manager</option>
                  <option value="owner">Owner</option>
                </select>
                <button
                  type="button"
                  onClick={() => handleRemove(m.id, m.email)}
                  disabled={pending}
                  className="btn-ghost text-2xs h-7 px-2 hover:!text-status-danger"
                  title="Remove member"
                  aria-label={`Remove ${m.email}`}
                >
                  <Trash2 size={11} />
                </button>
              </>
            )}
          </li>
        ))}
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

      {callerIsOwner ? (
        addOpen ? (
          <div className="bg-ink-2 border border-line rounded-sm p-3 space-y-2">
            <p className="text-2xs text-bone-400 leading-relaxed">
              The person you're adding must already have a Field account at
              this email. If they don't, ask them to sign up at{" "}
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
              value={role}
              onChange={(e) => setRole(e.target.value as "owner" | "manager")}
              disabled={pending}
              className="w-full"
            >
              <option value="manager">Manager — day-to-day operator</option>
              <option value="owner">Owner — full access including team</option>
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
          Only owners can add or remove team members.
        </p>
      )}
    </div>
  );
}
