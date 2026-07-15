/**
 * Client-side photo compression for field uploads. Camera originals run
 * 4–8 MB; the punch list needs "readable evidence", not print quality —
 * long edge capped at 1600px, JPEG ~80%. createImageBitmap with
 * imageOrientation:'from-image' bakes EXIF rotation into the pixels, so
 * the re-encoded JPEG (which has no EXIF) still displays upright.
 *
 * Returns the original file when it can't decode (e.g. HEIC on some
 * browsers) — the caller's size/type limits still apply.
 */
export async function compressImage(
  file: File,
  maxEdge = 1600,
  quality = 0.8,
): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      return file;
    }
  }
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) return file;
    // A tiny already-compressed image can re-encode larger; keep the smaller.
    return blob.size < file.size ? blob : file;
  } finally {
    bitmap.close();
  }
}
