/**
 * Centralized role-based permission rules for Field.
 *
 * Three roles: owner, manager, member.
 * The matrix lives here so every check is consistent across pages and
 * server actions. Don't inline role checks anywhere else — call these.
 *
 * Capability naming: verb_noun, present tense. e.g. canManageTeam, canSendSms.
 *
 * Hierarchy (for "can A act on B?" decisions):
 *   owner > manager > member
 * Owners are untouchable by anyone except other owners.
 * Managers can act on members only — never on managers or owners.
 */

export type Role = "owner" | "manager" | "member";

const ROLE_RANK: Record<Role, number> = {
  owner: 3,
  manager: 2,
  member: 1,
};

export function isValidRole(r: string | null | undefined): r is Role {
  return r === "owner" || r === "manager" || r === "member";
}

export function rankOf(r: Role): number {
  return ROLE_RANK[r];
}

/* ---------- Capability checks ---------- */

/** Can this user view the Settings page at all? */
export function canViewSettings(role: Role): boolean {
  return role === "owner" || role === "manager";
}

/** Can this user edit the business profile (name, hours, scope, etc.)? */
export function canEditBusinessProfile(role: Role): boolean {
  return role === "owner" || role === "manager";
}

/** Can this user edit branding (logo + color)? */
export function canEditBranding(role: Role): boolean {
  return role === "owner" || role === "manager";
}

/** Can this user view the Team page? Members can VIEW (read-only). */
export function canViewTeam(_role: Role): boolean {
  return true;
}

/** Can this user manage team membership at all? */
export function canManageTeam(role: Role): boolean {
  return role === "owner" || role === "manager";
}

/**
 * Can `actor` add a member with `targetRole`?
 * Owners can add anyone. Managers can only add members.
 */
export function canAddRole(actor: Role, targetRole: Role): boolean {
  if (actor === "owner") return true;
  if (actor === "manager") return targetRole === "member";
  return false;
}

/**
 * Can `actor` change `target` from `oldRole` → `newRole`?
 *
 * Owner: can do anything (subject to last-owner protection).
 * Manager: can promote member → manager, demote manager → member. Cannot
 *   touch owners. Cannot promote anyone to owner.
 * Member: nothing.
 */
export function canChangeRole(
  actor: Role,
  oldRole: Role,
  newRole: Role,
): boolean {
  if (actor === "owner") {
    return true;
  }
  if (actor === "manager") {
    // Cannot touch owners
    if (oldRole === "owner" || newRole === "owner") return false;
    // Allowed transitions: member ↔ manager
    return (
      (oldRole === "member" && newRole === "manager") ||
      (oldRole === "manager" && newRole === "member")
    );
  }
  return false;
}

/**
 * Can `actor` remove a `target` whose role is `targetRole`?
 * Same hierarchy: owners can remove anyone, managers can only remove members.
 */
export function canRemoveRole(actor: Role, targetRole: Role): boolean {
  if (actor === "owner") return true;
  if (actor === "manager") return targetRole === "member";
  return false;
}

/* ---------- Jobs / contacts ---------- */

/** All roles can view jobs. */
export function canViewJobs(_role: Role): boolean {
  return true;
}

/** Members can edit job details (status, notes, address) since they need
 *  to update job state from the field. */
export function canEditJobs(_role: Role): boolean {
  return true;
}

/** All roles can view contacts. */
export function canViewContacts(_role: Role): boolean {
  return true;
}

/** Members can edit contacts (correcting phone, name, etc. from the field). */
export function canEditContacts(_role: Role): boolean {
  return true;
}
