import { describe, expect, it } from "vitest";
import {
  jobStatusAfterEstimateCreated,
  jobStatusAfterEstimateAccepted,
} from "./job-status";

const ALL_STATUSES = [
  "lead",
  "estimated",
  "accepted",
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
  "callback",
  "callback_complete",
] as const;

describe("jobStatusAfterEstimateCreated", () => {
  it("moves a lead to estimated", () => {
    expect(jobStatusAfterEstimateCreated("lead")).toBe("estimated");
  });

  it("is a no-op from every other status", () => {
    for (const s of ALL_STATUSES) {
      if (s === "lead") continue;
      expect(jobStatusAfterEstimateCreated(s)).toBeNull();
    }
  });
});

describe("jobStatusAfterEstimateAccepted", () => {
  it("moves lead and estimated to accepted", () => {
    expect(jobStatusAfterEstimateAccepted("lead")).toBe("accepted");
    expect(jobStatusAfterEstimateAccepted("estimated")).toBe("accepted");
  });

  it("never regresses scheduled-or-beyond, callbacks, or cancelled", () => {
    for (const s of ALL_STATUSES) {
      if (s === "lead" || s === "estimated") continue;
      expect(jobStatusAfterEstimateAccepted(s)).toBeNull();
    }
  });

  it("second acceptance on an accepted job is a no-op (multi-scope versions)", () => {
    expect(jobStatusAfterEstimateAccepted("accepted")).toBeNull();
  });
});
