import { describe, it, expect } from "vitest";
import {
  canReassignExpense,
  allowedAssignmentsForRole,
  assignmentAllowedForRole,
  canEditCustomerNotified,
  MEMBER_ASSIGNMENTS,
} from "./expense-roles";
import { ASSIGNMENTS } from "./expenses";

describe("expense-roles", () => {
  it("owners and managers may set every assignment", () => {
    for (const role of ["owner", "manager"] as const) {
      expect(allowedAssignmentsForRole(role)).toEqual([...ASSIGNMENTS]);
      for (const a of ASSIGNMENTS) {
        expect(assignmentAllowedForRole(role, a)).toBe(true);
      }
      expect(canEditCustomerNotified(role)).toBe(true);
    }
  });

  it("members may set only the limited set, never job_extra", () => {
    expect(allowedAssignmentsForRole("member")).toEqual([
      "unassigned",
      "job_in_bid",
      "job_internal",
      "stock",
    ]);
    expect(assignmentAllowedForRole("member", "job_extra")).toBe(false);
    for (const a of MEMBER_ASSIGNMENTS) {
      expect(assignmentAllowedForRole("member", a)).toBe(true);
    }
  });

  it("members may never edit customer_notified", () => {
    expect(canEditCustomerNotified("member")).toBe(false);
  });

  it("MEMBER_ASSIGNMENTS excludes job_extra specifically", () => {
    expect(MEMBER_ASSIGNMENTS).not.toContain("job_extra");
  });

  it("only owner and manager may reassign an existing item", () => {
    // Not a UI preference: the expenses RLS write policy is owner/manager, so
    // a member's UPDATE returns zero rows. Showing them the control would be
    // showing a control that always fails.
    expect(canReassignExpense("owner")).toBe(true);
    expect(canReassignExpense("manager")).toBe(true);
    expect(canReassignExpense("member")).toBe(false);
  });

  it("reassignment rights are narrower than capture rights", () => {
    // A member can CREATE a job expense (admin-client action behind a role
    // gate) but cannot reassign one afterwards. If these ever converge it
    // should be a deliberate ruling, not a drift.
    expect(allowedAssignmentsForRole("member").length).toBeGreaterThan(0);
    expect(canReassignExpense("member")).toBe(false);
  });
});
