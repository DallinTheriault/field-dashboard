import { describe, expect, it } from "vitest";
import { parseScanResponse, scanTotalsMismatch } from "./receipt-scan";

const GOOD = JSON.stringify({
  vendor: "Home Depot",
  date: "2026-07-15",
  subtotal: 45.97,
  tax: 3.22,
  total: 49.19,
  items: [
    { description: "2x4x8 lumber", sku: "2X4X8 KD WWSPF", qty: 4, unit_price: 3.98, amount: 15.92 },
    { description: "Wood screws, 1 lb", sku: "SCRW DECK 1LB", qty: 1, unit_price: 8.97, amount: 8.97 },
  ],
});

describe("parseScanResponse (defensive parse, §6.1.6)", () => {
  it("parses clean JSON", () => {
    const r = parseScanResponse(GOOD)!;
    expect(r.vendor).toBe("Home Depot");
    expect(r.items).toHaveLength(2);
    expect(r.items[0].sku).toBe("2X4X8 KD WWSPF");
  });

  it("strips markdown fences even though the prompt forbids them", () => {
    const r = parseScanResponse("```json\n" + GOOD + "\n```")!;
    expect(r.total).toBe(49.19);
  });

  it("tolerates stray prose around the object", () => {
    const r = parseScanResponse("Here is the extraction:\n" + GOOD + "\nDone!")!;
    expect(r.items).toHaveLength(2);
  });

  it("coerces string numbers and $ signs, rounds to cents", () => {
    const r = parseScanResponse(
      '{"vendor":"X","date":null,"subtotal":"$12.50","tax":null,"total":"12.5","items":[{"description":"thing","sku":null,"qty":"2","unit_price":"6.249999","amount":12.499999}]}',
    )!;
    expect(r.subtotal).toBe(12.5);
    expect(r.items[0].unit_price).toBe(6.25);
    expect(r.items[0].amount).toBe(12.5);
  });

  it("normalizes US-style dates, nulls unparseable ones (never guesses)", () => {
    expect(parseScanResponse('{"vendor":"X","date":"7/4/26","total":1,"items":[]}')!.date).toBe("2026-07-04");
    expect(parseScanResponse('{"vendor":"X","date":"last tuesday","total":1,"items":[]}')!.date).toBeNull();
  });

  it("drops malformed items but keeps the rest", () => {
    const r = parseScanResponse(
      '{"vendor":"X","total":9,"items":[{"description":"good","amount":9},{"no_description":true},"garbage"]}',
    )!;
    expect(r.items).toHaveLength(1);
  });

  it("returns null on garbage (route retries once, then manual fallback)", () => {
    expect(parseScanResponse("I could not read this receipt, sorry!")).toBeNull();
    expect(parseScanResponse("{broken json")).toBeNull();
    expect(parseScanResponse('{"items":[]}')).toBeNull(); // nothing usable
  });
});

describe("scanTotalsMismatch (§6.3 warning)", () => {
  it("no mismatch when items sum to the stated total (no tax)", () => {
    const { itemSum, mismatch } = scanTotalsMismatch({
      total: 24.89,
      items: [{ amount: 15.92 }, { amount: 8.97 }],
    });
    expect(itemSum).toBe(24.89);
    expect(mismatch).toBe(false);
  });

  it("taxed receipt: items sum to the PRE-TAX amount — no false alarm", () => {
    // Items 49.86, tax 3.49, total 53.35 — a correct extraction.
    const { expected, mismatch } = scanTotalsMismatch({
      total: 53.35,
      tax: 3.49,
      items: [{ amount: 15.92 }, { amount: 24.97 }, { amount: 8.97 }],
    });
    expect(expected).toBe(49.86);
    expect(mismatch).toBe(false);
  });

  it("fires when a line is missing (deleted or missed)", () => {
    const { mismatch } = scanTotalsMismatch({
      total: 53.35,
      tax: 3.49,
      items: [{ amount: 15.92 }, { amount: 8.97 }],
    });
    expect(mismatch).toBe(true);
  });

  it("stays quiet when the stated total is unreadable", () => {
    expect(scanTotalsMismatch({ total: null, items: [{ amount: 5 }] }).mismatch).toBe(false);
  });
});
