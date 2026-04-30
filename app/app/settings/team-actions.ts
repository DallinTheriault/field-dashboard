"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  type Role,
  isValidRole,
  canAddRole,
  canChangeRole,
  canRemoveRole,
} from "@/lib/permissions/roles";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Add an existing Field user to the current tenant.
 *
 * v0.5.11 limitation: invitee must already have a Field auth account.
 * Real magic-link invitations land in v0.6.0.
 *
 * Permission: caller must be owner (can add any role) or manager (can
 * only add members).
 */
export async function addTeamMemberByEmail(
  clientId: number,
  email: string,
  role: Role,
): Promise<Result> {
  const cleanedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanedEmail)) {
    return { ok: false, error: "Invalid email address." };
  }
  if (!isValidRole(role)) {
    return { ok: false, error: "Invalid role." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: callerMembership } = await supabase
    .from("client_users")
    .select("role")
    .eq("auth_user_id", user.id)
    .eq("client_id", clientId)
    .maybeSingle();

  if (
    !callerMembership ||
    !isValidRole(callerMembership.role) ||
    !canAddRole(callerMembership.role, role)
  ) {
    return {
      ok: false,
      error:
        callerMembership?.role === "manager"
          ? "Managers can only add members. Ask an owner to add managers or owners."
          : "You don't have permission to add team members.",
    };
  }

  const admin = createAdminClient();
  // Look up the auth user by email
  const { data: usersData, error: lookupErr } =
    await admin.auth.admin.listUsers();
  if (lookupErr) {
    return { ok: false, error: `Lookup failed: ${lookupErr.message}` };
  }
  const target = usersData.users.find(
    (u) => (u.email ?? "").toLowerCase() === cleanedEmail,
  );
  if (!target) {
    return {
      ok: false,
      error:
        "No Field account found for that email. Have them sign up at fielddashboard.netlify.app first, then try again.",
    };
  }

  const { data: existing } = await admin
    .from("client_users")
    .select("id, role")
    .eq("auth_user_id", target.id)
    .eq("client_id", clientId)
    .maybeSingle();

  if (existing) {
    return {
      ok: false,
      error: `${cleanedEmail} is already a ${existing.role} on this team.`,
    };
  }

  const { error: insertErr } = await admin.from("client_users").insert({
    auth_user_id: target.id,
    client_id: clientId,
    role,
  });

  if (insertErr) {
    return { ok: false, error: insertErr.message };
  }

  // Audit log entry
  await admin.from("team_audit_log").insert({
    client_id: clientId,
    actor_user_id: user.id,
    actor_role_at_time: callerMembership.role,
    action: "member_added",
    target_user_id: target.id,
    target_email: cleanedEmail,
    new_role: role,
  });

  revalidatePath("/app/settings");
  return { ok: true };
}

/**
 * Remove a team member. Cannot remove yourself, cannot remove the last
 * owner. Managers can only remove members.
 */
export async function removeTeamMember(
  clientId: number,
  membershipId: number,
): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: callerMembership } = await supabase
    .from("client_users")
    .select("role")
    .eq("auth_user_id", user.id)
    .eq("client_id", clientId)
    .maybeSingle();

  if (!callerMembership || !isValidRole(callerMembership.role)) {
    return { ok: false, error: "You don't have permission." };
  }

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("client_users")
    .select("id, auth_user_id, role")
    .eq("id", membershipId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (!target || !isValidRole(target.role)) {
    return { ok: false, error: "Member not found." };
  }

  if (target.auth_user_id === user.id) {
    return { ok: false, error: "You can't remove yourself." };
  }

  if (!canRemoveRole(callerMembership.role, target.role)) {
    return {
      ok: false,
      error:
        callerMembership.role === "manager"
          ? "Managers can only remove members."
          : "You don't have permission to remove this person.",
    };
  }

  // Don't allow removing the last owner
  if (target.role === "owner") {
    const { count } = await admin
      .from("client_users")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .eq("role", "owner");
    if ((count ?? 0) <= 1) {
      return {
        ok: false,
        error: "Can't remove the last owner. Promote someone else first.",
      };
    }
  }

  // Get email for audit log before delete
  const { data: targetUser } = await admin.auth.admin.getUserById(
    target.auth_user_id,
  );
  const targetEmail = targetUser?.user?.email ?? "(unknown)";

  const { error } = await admin
    .from("client_users")
    .delete()
    .eq("id", membershipId);

  if (error) return { ok: false, error: error.message };

  await admin.from("team_audit_log").insert({
    client_id: clientId,
    actor_user_id: user.id,
    actor_role_at_time: callerMembership.role,
    action: "member_removed",
    target_user_id: target.auth_user_id,
    target_email: targetEmail,
    old_role: target.role,
  });

  revalidatePath("/app/settings");
  return { ok: true };
}

/**
 * Change a member's role. Permission rules:
 *   - Owner: can change any role to any role (subject to last-owner)
 *   - Manager: can promote member → manager, demote manager → member
 *   - Cannot change own role (use a different owner)
 */
export async function changeTeamMemberRole(
  clientId: number,
  membershipId: number,
  newRole: Role,
): Promise<Result> {
  if (!isValidRole(newRole)) {
    return { ok: false, error: "Invalid role." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: callerMembership } = await supabase
    .from("client_users")
    .select("role")
    .eq("auth_user_id", user.id)
    .eq("client_id", clientId)
    .maybeSingle();

  if (!callerMembership || !isValidRole(callerMembership.role)) {
    return { ok: false, error: "You don't have permission." };
  }

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("client_users")
    .select("id, auth_user_id, role")
    .eq("id", membershipId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (!target || !isValidRole(target.role)) {
    return { ok: false, error: "Member not found." };
  }
  if (target.auth_user_id === user.id) {
    return { ok: false, error: "You can't change your own role." };
  }
  if (target.role === newRole) return { ok: true }; // no-op

  if (!canChangeRole(callerMembership.role, target.role, newRole)) {
    return {
      ok: false,
      error:
        callerMembership.role === "manager"
          ? "Managers can only promote members or demote managers."
          : "You don't have permission to change this role.",
    };
  }

  // Don't allow demoting the last owner
  if (target.role === "owner" && newRole !== "owner") {
    const { count } = await admin
      .from("client_users")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .eq("role", "owner");
    if ((count ?? 0) <= 1) {
      return {
        ok: false,
        error: "Can't demote the last owner. Promote someone else first.",
      };
    }
  }

  const { error } = await admin
    .from("client_users")
    .update({ role: newRole })
    .eq("id", membershipId);

  if (error) return { ok: false, error: error.message };

  // Audit log
  const { data: targetUser } = await admin.auth.admin.getUserById(
    target.auth_user_id,
  );
  const targetEmail = targetUser?.user?.email ?? "(unknown)";

  await admin.from("team_audit_log").insert({
    client_id: clientId,
    actor_user_id: user.id,
    actor_role_at_time: callerMembership.role,
    action: "role_changed",
    target_user_id: target.auth_user_id,
    target_email: targetEmail,
    old_role: target.role,
    new_role: newRole,
  });

  revalidatePath("/app/settings");
  return { ok: true };
}
