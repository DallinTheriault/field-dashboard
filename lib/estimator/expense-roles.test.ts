import { describe, it, expect } from "vitest";
import {
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
});
