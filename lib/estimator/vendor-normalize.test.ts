import { describe, it, expect } from "vitest";
import {
  findDuplicate,
  isDuplicateMatch,
  normalizeVendor,
} from "./vendor-normalize";

describe("normalizeVendor", () => {
  it("matches the spec's canonical example", () => {
    expect(normalizeVendor("HOME DEPOT #4412")).toBe("HOME DEPOT");
    expect(normalizeVendor("The Home Depot")).toBe("HOME DEPOT");
    expect(normalizeVendor("HOME DEPOT #4412")).toBe(
      normalizeVendor("The Home Depot"),
    );
  });

  it("strips punctuation, casing, and collapses whitespace", () => {
    expect(normalizeVendor("lowe's  home   improvement")).toBe(
      "LOWE S HOME IMPROVEMENT",
    );
    expect(normalizeVendor("Sherwin-Williams")).toBe("SHERWIN WILLIAMS");
  });

  it("strips a trailing store number in several shapes", () => {
    expect(normalizeVendor("Ace Hardware #12")).toBe("ACE HARDWARE");
    expect(normalizeVendor("Ace Hardware # 12")).toBe("ACE HARDWARE");
    expect(normalizeVendor("Ace Hardware #0004412  ")).toBe("ACE HARDWARE");
  });

  it("strips only a LEADING 'the'", () => {
    expect(normalizeVendor("The Paint Store")).toBe("PAINT STORE");
    // not a leading article — must survive
    expect(normalizeVendor("Bath & The Beyond")).toBe("BATH THE BEYOND");
  });

  it("handles empty / null input", () => {
    expect(normalizeVendor(null)).toBe("");
    expect(normalizeVendor(undefined)).toBe("");
    expect(normalizeVendor("   ")).toBe("");
    expect(normalizeVendor("###")).toBe("");
  });

  it("does not collapse unrelated vendors together", () => {
    expect(normalizeVendor("Home Depot")).not.toBe(normalizeVendor("Home Goods"));
    expect(normalizeVendor("Ace Hardware")).not.toBe(normalizeVendor("Ace Rentals"));
  });
});

describe("isDuplicateMatch", () => {
  const base = { vendor: "HOME DEPOT #4412", purchase_date: "2026-07-21", total: 55.74 };

  it("matches when all three agree (vendor normalized)", () => {
    expect(
      isDuplicateMatch(base, {
        vendor: "The Home Depot",
        purchase_date: "2026-07-21",
        total: 55.74,
      }),
    ).toBe(true);
  });

  it("tolerates numeric-vs-string totals and timestamp dates", () => {
    expect(
      isDuplicateMatch(base, {
        vendor: "Home Depot",
        purchase_date: "2026-07-21T00:00:00Z",
        total: "55.74",
      }),
    ).toBe(true);
  });

  it("does NOT match a different total — same store, same day, second run", () => {
    expect(
      isDuplicateMatch(base, {
        vendor: "The Home Depot",
        purchase_date: "2026-07-21",
        total: 12.99,
      }),
    ).toBe(false);
  });

  it("does NOT match a different date", () => {
    expect(
      isDuplicateMatch(base, {
        vendor: "The Home Depot",
        purchase_date: "2026-07-22",
        total: 55.74,
      }),
    ).toBe(false);
  });

  it("does NOT match a different vendor", () => {
    expect(
      isDuplicateMatch(base, {
        vendor: "Lowe's",
        purchase_date: "2026-07-21",
        total: 55.74,
      }),
    ).toBe(false);
  });

  it("never matches when either vendor is unusable", () => {
    expect(
      isDuplicateMatch(
        { vendor: null, purchase_date: "2026-07-21", total: 55.74 },
        base,
      ),
    ).toBe(false);
  });

  it("requires all three — two of three is not a match", () => {
    // vendor + date agree, total differs
    expect(
      isDuplicateMatch(base, { vendor: "Home Depot", purchase_date: "2026-07-21", total: 1 }),
    ).toBe(false);
    // vendor + total agree, date differs
    expect(
      isDuplicateMatch(base, { vendor: "Home Depot", purchase_date: "2020-01-01", total: 55.74 }),
    ).toBe(false);
    // date + total agree, vendor differs
    expect(
      isDuplicateMatch(base, { vendor: "Ace", purchase_date: "2026-07-21", total: 55.74 }),
    ).toBe(false);
  });
});

describe("findDuplicate", () => {
  it("returns the first matching row, else null", () => {
    const rows = [
      { id: 1, vendor: "Lowe's", purchase_date: "2026-07-21", total: 55.74 },
      { id: 2, vendor: "HOME DEPOT #4412", purchase_date: "2026-07-21", total: 55.74 },
    ];
    expect(
      findDuplicate(
        { vendor: "The Home Depot", purchase_date: "2026-07-21", total: 55.74 },
        rows,
      )?.id,
    ).toBe(2);
    expect(
      findDuplicate(
        { vendor: "The Home Depot", purchase_date: "2026-07-21", total: 9.99 },
        rows,
      ),
    ).toBeNull();
  });
});
