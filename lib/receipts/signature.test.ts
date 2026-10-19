import { describe, expect, it } from "vitest";
import { signScan, verifyScan } from "./signature";

const KEY = "service-role-key-for-tests";

describe("scan hand-off signature", () => {
  it("accepts what the route signed", () => {
    const ts = Date.now();
    expect(verifyScan(KEY, { purchaseId: 42, ts, sig: signScan(KEY, 42, ts) })).toBe(42);
  });

  it("refuses another purchase, another key, a stale note, or junk", () => {
    const ts = Date.now();
    const sig = signScan(KEY, 42, ts);
    expect(verifyScan(KEY, { purchaseId: 43, ts, sig })).toBeNull();
    expect(verifyScan("other-key", { purchaseId: 42, ts, sig })).toBeNull();
    expect(verifyScan(KEY, { purchaseId: 42, ts, sig }, ts + 6 * 60 * 1000)).toBeNull();
    expect(verifyScan(KEY, { purchaseId: "42", ts, sig })).toBeNull();
    expect(verifyScan(KEY, { purchaseId: 42, ts, sig: "abc" })).toBeNull();
    expect(verifyScan(KEY, null)).toBeNull();
  });
});
