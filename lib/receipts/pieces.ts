/**
 * Sizing for receipt photos, and when to cut a receipt into pieces. Pure
 * numbers, so it's unit-tested; lib/receipts/prepare.ts does the drawing.
 *
 * The scan model shrinks any image whose long edge is over 2576px or whose
 * area is over ~3.75 megapixels (4784 visual tokens of 28×28px). A normal
 * phone photo is barely touched. A receipt that is much taller than wide (a
 * long crop, a scanner app, an emailed receipt's screenshot) gets shrunk until
 * its print is too small to read, so it goes as overlapping pieces instead,
 * each small enough to be read at full size. Nothing else is split.
 */

export const MODEL_LONG_EDGE = 2576;
export const MODEL_MAX_PIXELS = 4784 * 28 * 28;

/** Normal photos: the receipt preset (thermal 6pt print must survive). */
export const PHOTO_LONG_EDGE = 2400;
/** Tall receipts keep their width and as much height as 4 pieces can read. */
export const TALL_RATIO = 1.8;
export const TALL_MAX_WIDTH = 1400;
export const TALL_MAX_PIXELS = 12_000_000;

/** Split only when the model would shrink the whole image by more than this. */
export const SPLIT_BELOW_SCALE = 0.8;
export const PIECE_OVERLAP = 0.12;
export const MAX_PIECES = 4;

export type Size = { w: number; h: number };
export type Piece = { y: number; h: number };

/** How much the model would shrink an image to read it (1 = not at all). */
export function modelScale(w: number, h: number): number {
  return Math.min(1, MODEL_LONG_EDGE / Math.max(w, h), Math.sqrt(MODEL_MAX_PIXELS / (w * h)));
}

export function isTall(w: number, h: number): boolean {
  return h / w >= TALL_RATIO;
}

/** The size a receipt photo is saved at. */
export function storedSize(w: number, h: number): Size {
  const scale = isTall(w, h)
    ? Math.min(1, TALL_MAX_WIDTH / w, Math.sqrt(TALL_MAX_PIXELS / (w * h)))
    : Math.min(1, PHOTO_LONG_EDGE / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

/**
 * Where to cut a saved receipt image (top to bottom, overlapping), or [] when
 * the model can read it whole.
 */
export function planPieces(w: number, h: number): Piece[] {
  if (!isTall(w, h) || modelScale(w, h) >= SPLIT_BELOW_SCALE) return [];
  // The tallest piece the model reads without shrinking.
  const fullHeight = Math.min(MODEL_LONG_EDGE, Math.floor(MODEL_MAX_PIXELS / w));
  let n = Math.ceil((h / fullHeight - PIECE_OVERLAP) / (1 - PIECE_OVERLAP));
  if (n <= 1) return [];
  n = Math.min(n, MAX_PIECES);
  // n equal pieces, each overlapping the next by PIECE_OVERLAP of a piece.
  const ph = Math.min(h, Math.ceil(h / (n - (n - 1) * PIECE_OVERLAP)));
  const step = (h - ph) / (n - 1);
  return Array.from({ length: n }, (_, i) => ({ y: Math.round(i * step), h: ph }));
}
