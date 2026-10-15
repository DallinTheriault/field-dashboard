import { describe, expect, it } from "vitest";
import { activeHref } from "./nav-active";

const NAV = ["/app", "/app/jobs", "/app/estimator", "/app/estimator/invoices", "/app/settings"];

describe("activeHref", () => {
  it("picks the most specific item", () => {
    expect(activeHref("/app/estimator/invoices/12", NAV)).toBe("/app/estimator/invoices");
    expect(activeHref("/app/estimator/invoices", NAV)).toBe("/app/estimator/invoices");
    expect(activeHref("/app/estimator/settings", NAV)).toBe("/app/estimator");
    expect(activeHref("/app/jobs/4/invoice", NAV)).toBe("/app/jobs");
  });
  it("matches Home only on itself", () => {
    expect(activeHref("/app", NAV)).toBe("/app");
    expect(activeHref("/app/contacts", NAV)).toBeNull();
  });
  it("doesn't treat a shared prefix as a match", () => {
    expect(activeHref("/app/jobsite", NAV)).toBeNull();
  });
});
