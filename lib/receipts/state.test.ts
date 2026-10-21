import { describe, expect, it } from "vitest";
import { needsAttention, receiptState, SCAN_STALE_MS } from "./state";

const now = Date.parse("2026-10-19T18:00:00Z");
const ago = (ms: number) => new Date(now - ms).toISOString();

describe("receiptState", () => {
  it("reads while queued or scanning, until it goes stale", () => {
    expect(receiptState({ scan_status: "queued", scan_requested_at: ago(5_000), itemCount: 0 }, now)).toBe("reading");
    expect(receiptState({ scan_status: "scanning", scan_requested_at: ago(60_000), itemCount: 0 }, now)).toBe("reading");
    expect(
      receiptState({ scan_status: "scanning", scan_requested_at: ago(SCAN_STALE_MS + 1), itemCount: 0 }, now),
    ).toBe("needs_entry");
  });

  it("asks to check a read; compares a read of a saved receipt", () => {
    expect(receiptState({ scan_status: "ready", scan_requested_at: ago(1), itemCount: 0 }, now)).toBe("check");
    expect(receiptState({ scan_status: "ready", scan_requested_at: ago(1), itemCount: 3 }, now)).toBe("compare");
  });

  it("a failed read of a saved receipt leaves what was saved", () => {
    expect(receiptState({ scan_status: "needs_entry", scan_requested_at: ago(1), itemCount: 0 }, now)).toBe("needs_entry");
    expect(receiptState({ scan_status: "needs_entry", scan_requested_at: ago(1), itemCount: 2 }, now)).toBe("failed_again");
    expect(
      receiptState({ scan_status: "queued", scan_requested_at: ago(SCAN_STALE_MS + 1), itemCount: 2 }, now),
    ).toBe("failed_again");
  });

  it("older receipts: waiting without items, done with them", () => {
    expect(receiptState({ scan_status: null, scan_requested_at: null, itemCount: 0 }, now)).toBe("waiting");
    expect(receiptState({ scan_status: null, scan_requested_at: null, itemCount: 4 }, now)).toBeNull();
  });

  it("only check, compare and needs entry ask for attention", () => {
    expect(["check", "compare", "needs_entry"].every((s) => needsAttention(s as never))).toBe(true);
    expect(["reading", "failed_again", "waiting", null].some((s) => needsAttention(s as never))).toBe(false);
  });
});
