import { describe, expect, it } from "vitest";
import { MAX_PIECES, MODEL_LONG_EDGE, MODEL_MAX_PIXELS, modelScale, planPieces, storedSize } from "./pieces";

describe("storedSize", () => {
  it("keeps the 2400px receipt preset for ordinary photos", () => {
    expect(storedSize(3024, 4032)).toEqual({ w: 1800, h: 2400 });
    expect(storedSize(1200, 900)).toEqual({ w: 1200, h: 900 });
  });

  it("keeps a tall receipt's width instead of shrinking it to 2400 tall", () => {
    const s = storedSize(1080, 6000);
    expect(s).toEqual({ w: 1080, h: 6000 });
    expect(storedSize(2000, 8000)).toEqual({ w: 1400, h: 5600 }); // capped at 1400 wide
    const huge = storedSize(1400, 12000); // capped at 12 MP
    expect(huge.w * huge.h).toBeLessThanOrEqual(12_000_000 + 2000);
  });
});

describe("planPieces", () => {
  it("never splits an ordinary phone photo", () => {
    const s = storedSize(3024, 4032);
    expect(modelScale(s.w, s.h)).toBeGreaterThan(0.9);
    expect(planPieces(s.w, s.h)).toEqual([]);
  });

  it("never splits a tall image the model reads nearly whole", () => {
    expect(planPieces(600, 1500)).toEqual([]); // 2.5:1 but small
  });

  it("splits a receipt too tall to read whole into overlapping pieces", () => {
    const pieces = planPieces(1000, 4000);
    expect(pieces).toHaveLength(2);
    expect(pieces[0].y).toBe(0);
    const last = pieces[pieces.length - 1];
    expect(last.y + last.h).toBe(4000); // reaches the bottom
    // Overlap between neighbours, about 12% of a piece.
    const overlap = pieces[0].y + pieces[0].h - pieces[1].y;
    expect(overlap / pieces[0].h).toBeGreaterThan(0.1);
    expect(overlap / pieces[0].h).toBeLessThan(0.14);
  });

  it("makes each piece small enough to be read at full size", () => {
    for (const p of planPieces(1080, 8000)) {
      expect(p.h).toBeLessThanOrEqual(MODEL_LONG_EDGE);
      expect(1080 * p.h).toBeLessThanOrEqual(MODEL_MAX_PIXELS);
    }
  });

  it("stops at four pieces", () => {
    const pieces = planPieces(1225, 9800);
    expect(pieces).toHaveLength(MAX_PIECES);
    expect(pieces[MAX_PIECES - 1].y + pieces[MAX_PIECES - 1].h).toBe(9800);
  });
});
