import { describe, expect, it } from "vitest";
import { balanceDueCents, daysBetween, invoiceTab, paidCents, parseDollarsToCents } from "./payments";

describe("payments helpers", () => {
  it("sums payments and never shows a negative balance", () => {
    const p = [{ amount_cents: 10000 }, { amount_cents: 2550 }];
    expect(paidCents(p)).toBe(12550);
    expect(balanceDueCents(17263, p)).toBe(4713);
    expect(balanceDueCents(10000, p)).toBe(0);
  });

  it("parses typed dollar amounts to cents", () => {
    expect(parseDollarsToCents("1,726.36")).toBe(172636);
    expect(parseDollarsToCents("$435")).toBe(43500);
    expect(parseDollarsToCents("24.5")).toBe(2450);
    expect(parseDollarsToCents("0")).toBeNull();
    expect(parseDollarsToCents("12.345")).toBeNull();
    expect(parseDollarsToCents("-5")).toBeNull();
    expect(parseDollarsToCents("abc")).toBeNull();
  });

  it("counts whole days between calendar dates", () => {
    expect(daysBetween("2026-10-01", "2026-10-14")).toBe(13);
    expect(daysBetween("2026-10-14", "2026-10-14")).toBe(0);
    expect(daysBetween("2026-10-15", "2026-10-14")).toBe(0);
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2); // across the DST change
  });

  it("puts each status in one list", () => {
    expect(invoiceTab("sent")).toBe("unpaid");
    expect(invoiceTab("overdue")).toBe("unpaid");
    expect(invoiceTab("draft")).toBe("drafts");
    expect(invoiceTab("paid")).toBe("paid");
    expect(invoiceTab("voided")).toBe("voided");
  });
});
