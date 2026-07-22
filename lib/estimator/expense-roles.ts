/**
 * Role gate for expense assignment (Business/job-expense handoff §3).
 *
 * Members may capture expenses and set a limited set of assignments, but
 * never `job_extra` (it injects an at-cost invoice line — a billing act) and
 * never the customer_notified honesty flag. Owners and managers keep the full
 * model. Enforced SERVER-SIDE in every write action; the UI mirrors it only
 * for UX. Multiple owners is a supported shape — this is role-based, so two
 * owners both get full rights.
 */
import { ASSIGNMENTS, type Assignment } from "./expenses";
import type { Role } from "@/lib/permissions/roles";

/** The only assignments a member may set. Excludes `job_extra`. */
export const MEMBER_ASSIGNMENTS: readonly Assignment[] = [
  "unassigned",
  "job_in_bid",
  "job_internal",
  "stock",
] as const;

/** Assignments this role may set, in canonical order. */
export function allowedAssignmentsForRole(role: Role): Assignment[] {
  if (role === "owner" || role === "manager") return [...ASSIGNMENTS];
  return ASSIGNMENTS.filter((a) => MEMBER_ASSIGNMENTS.includes(a));
}

/** Can this role set an item to this assignment? */
export function assignmentAllowedForRole(role: Role, a: Assignment): boolean {
  if (role === "owner" || role === "manager") return true;
  return MEMBER_ASSIGNMENTS.includes(a);
}

/**
 * Can this role set/edit the customer_notified flag? It only exists on
 * job_extra items, which members can't create anyway — but gate it
 * explicitly so no route lets a member touch it.
 */
export function canEditCustomerNotified(role: Role): boolean {
  return role === "owner" || role === "manager";
}
