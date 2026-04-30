"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Result = { ok: true } | { ok: false; error: string };

const ALLOWED_ROLES = ["owner", "manager"] as const;
type Role = (typeof ALLOWED_ROLES)[number];

/**
 * Add an existing Field user to the current tenant as a member.
 *
 * v0.5.10 limitation: requires the invitee to have already signed up at
 * Field with the email being added. There's no magic-link invitation
 * flow yet — that's v0.6.0+. This serves the immediate "add my second
 * account" need.
 *
 * Auth: caller must be an OWNER of the tenant they're adding to.
 * (Managers can manage day-to-day work but can't add other operators.)
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
  if (!ALLOWED_ROLES.includes(role)) {
    return { ok: false, error: "Invalid role." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Caller must be owner of this tenant
  const { data: callerMembership } = await supabase
    .from("client_users")
    .select("role")
    .eq("auth_user_id", user.id)
    .eq("client_id", clientId)
    .maybeSingle();

  if (!callerMembership || callerMembership.role !== "owner") {
    return {
      ok: false,
      error: "Only the owner can add or remove team members.",
    };
  }

  // Look up the auth user by email — admin client because regular users
  // can't read auth.users. We use the service-role admin API.
  const admin = createAdminClient();
  // Supabase admin API: list users with email filter
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

  // Check if already a member
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

  revalidatePath("/app/settings");
  return { ok: true };
}

/**
 * Remove a team member. Cannot remove yourself, cannot remove the last owner.
 * Caller must be an owner.
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

  if (!callerMembership || callerMembership.role !== "owner") {
    return { ok: false, error: "Only the owner can remove team members." };
  }

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("client_users")
    .select("id, auth_user_id, role")
    .eq("id", membershipId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (!target) return { ok: false, error: "Member not found." };

  if (target.auth_user_id === user.id) {
    return {
      ok: false,
      error: "You can't remove yourself. Have another owner do it.",
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

  const { error } = await admin
    .from("client_users")
    .delete()
    .eq("id", membershipId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/settings");
  return { ok: true };
}

/**
 * Change a member's role. Same auth rules as add/remove.
 */
export async function changeTeamMemberRole(
  clientId: number,
  membershipId: number,
  newRole: Role,
): Promise<Result> {
  if (!ALLOWED_ROLES.includes(newRole)) {
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

  if (!callerMembership || callerMembership.role !== "owner") {
    return { ok: false, error: "Only the owner can change roles." };
  }

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("client_users")
    .select("id, role")
    .eq("id", membershipId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (!target) return { ok: false, error: "Member not found." };
  if (target.role === newRole) return { ok: true }; // no-op

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

  revalidatePath("/app/settings");
  return { ok: true };
}
