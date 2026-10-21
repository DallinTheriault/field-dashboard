/**
 * Readies receipt files on the phone before upload: photos come out upright
 * JPEGs (HEIC converted, EXIF rotation baked in), sized for reading, with a
 * small thumbnail; a receipt too tall to read whole also gets the overlapping
 * pieces the scanner reads instead (lib/receipts/pieces.ts). PDFs (emailed
 * receipts) pass through untouched.
 *
 * Browser only.
 */
import { planPieces, storedSize } from "./pieces";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export type PreparedReceipt = {
  file: File;
  /** Small rendition for lists; null for PDFs or if it couldn't be made. */
  thumb: File | null;
  /** Overlapping pieces for the scanner; empty when it reads the whole file. */
  pieces: File[];
};

export function isPdf(f: File): boolean {
  return f.type === "application/pdf" || /\.pdf$/i.test(f.name);
}

function isHeic(f: File): boolean {
  return /^image\/hei[cf]/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);
}

async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    /* fall through: most browsers outside Safari can't decode HEIC */
  }
  if (isHeic(file)) {
    const { default: heic2any } = await import("heic2any");
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
    const jpeg = Array.isArray(out) ? out[0] : out;
    return await createImageBitmap(jpeg, { imageOrientation: "from-image" });
  }
  throw new Error("Couldn't open this photo. Try a JPEG or PNG, or a screenshot of it.");
}

function canvasOf(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't prepare photos.");
  return [canvas, ctx];
}

async function jpeg(canvas: HTMLCanvasElement, quality: number, name: string): Promise<File> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("Couldn't prepare the photo.");
  return new File([blob], name, { type: "image/jpeg" });
}

export async function prepareReceipt(file: File): Promise<PreparedReceipt> {
  if (isPdf(file)) {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("That PDF is too large (max 8 MB).");
    return { file: new File([file], "receipt.pdf", { type: "application/pdf" }), thumb: null, pieces: [] };
  }

  const bitmap = await decode(file);
  try {
    const size = storedSize(bitmap.width, bitmap.height);
    const [canvas, ctx] = canvasOf(size.w, size.h);
    ctx.drawImage(bitmap, 0, 0, size.w, size.h);
    let full = await jpeg(canvas, 0.85, "receipt.jpg");
    if (full.size > MAX_UPLOAD_BYTES) full = await jpeg(canvas, 0.7, "receipt.jpg");
    if (full.size > MAX_UPLOAD_BYTES) throw new Error("That photo is too large to upload.");

    // Best-effort: a list falls back to the full image without it.
    let thumb: File | null = null;
    try {
      const t = Math.min(1, 400 / Math.max(size.w, size.h));
      const [tc, tctx] = canvasOf(Math.max(1, Math.round(size.w * t)), Math.max(1, Math.round(size.h * t)));
      tctx.drawImage(canvas, 0, 0, tc.width, tc.height);
      thumb = await jpeg(tc, 0.7, "thumb.jpg");
    } catch {
      thumb = null;
    }

    const pieces: File[] = [];
    for (const [i, p] of planPieces(size.w, size.h).entries()) {
      const [pc, pctx] = canvasOf(size.w, p.h);
      pctx.drawImage(canvas, 0, p.y, size.w, p.h, 0, 0, size.w, p.h);
      pieces.push(await jpeg(pc, 0.85, `piece-${i + 1}.jpg`));
    }
    return { file: full, thumb, pieces };
  } finally {
    bitmap.close();
  }
}
