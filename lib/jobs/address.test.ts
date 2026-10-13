import { describe, it, expect } from "vitest";
import { formatAddress, jobAddress, jobContactName, jobPickLabel, toJobPick } from "./address";

describe("jobAddress", () => {
  it("reads the property's address and unit when the job has a property", () => {
    expect(
      jobAddress({
        address: "359 E 200 N Provo UT, 84606, Unit 1",
        property_id: 7,
        property: { address: "359 E 200 N Provo UT, 84606", unit: "6" },
      }),
    ).toBe("359 E 200 N Provo UT, 84606, Unit 6");
  });

  it("ignores the stale jobs.address copy whenever property_id is set", () => {
    // The property row is the truth; a job pointing at one never shows the copy.
    expect(jobAddress({ address: "old copy", property_id: 7, property: null })).toBeNull();
  });

  it("falls back to jobs.address only for jobs with no property", () => {
    expect(jobAddress({ address: "  12 Main St  ", property_id: null })).toBe("12 Main St");
    expect(jobAddress({ address: null, property_id: null })).toBeNull();
  });

  it("accepts the array shape for the embed", () => {
    expect(
      jobAddress({ address: null, property_id: 1, property: [{ address: "1 A St", unit: null }] }),
    ).toBe("1 A St");
  });
});

describe("formatAddress", () => {
  it("drops a blank unit and a blank address", () => {
    expect(formatAddress("1 A St", "  ")).toBe("1 A St");
    expect(formatAddress("  ", "4")).toBeNull();
  });
});

describe("jobContactName", () => {
  it("prefers the linked contact over the name typed on the job", () => {
    expect(
      jobContactName({ name: "Josh Ellis", address: null, property_id: null, contact: { name: "Johnny Test" } }),
    ).toBe("Johnny Test");
  });

  it("falls back to the job's name when there is no contact", () => {
    expect(jobContactName({ name: "Josh", address: null, property_id: null, contact: null })).toBe("Josh");
  });
});

describe("jobPickLabel", () => {
  it("orders address + unit, job number, contact, status", () => {
    const pick = toJobPick({
      id: 212,
      name: "Josh Ellis",
      job_number: "Ellis-072601",
      status: "completed",
      address: null,
      property_id: 3,
      property: { address: "8291 S Water Oak Dr", unit: "B" },
      contact: { name: "Josh Ellis" },
    });
    expect(jobPickLabel(pick)).toBe("8291 S Water Oak Dr, Unit B · Ellis-072601 · Josh Ellis · completed");
  });

  it("omits missing parts for legacy jobs", () => {
    const pick = toJobPick({ id: 9, name: null, address: null, property_id: null, status: null });
    expect(jobPickLabel(pick)).toBe("Job #9");
  });
});
