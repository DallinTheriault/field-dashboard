/**
 * Receipt storage path conventions (RECEIPTS_VIEW_SPEC §6.3).
 *
 * A full-size receipt lives at `{client_id}/purchase-{id}-{uuid}.jpg`; its
 * small rendition sits alongside with a `-thumb` suffix before the extension.
 * Thumbnails are best-effort at upload, so readers must always be prepared to
 * fall back to the full image (legacy receipts have no thumb at all).
 */

/** "8/purchase-3-abc.jpg" → "8/purchase-3-abc-thumb.jpg" */
export function thumbPathFor(path: string): string {
  const dot = path.lastIndexOf(".");
  if (dot <= path.lastIndexOf("/")) return `${path}-thumb`; // no extension
  return `${path.slice(0, dot)}-thumb${path.slice(dot)}`;
}

/** True for a thumbnail object path (so listings can skip them). */
export function isThumbPath(path: string): boolean {
  return /-thumb(\.[A-Za-z0-9]+)?$/.test(path);
}

/**
 * EVERY storage object belonging to a purchase: each full-size image plus its
 * thumbnail sibling, deduped.
 *
 * Deleting a purchase must remove both. The thumbnails aren't recorded in
 * receipt_paths[] — they're derived — so a delete that only walks that array
 * leaves them orphaned in the bucket (which is exactly what happened before
 * this helper existed). Removing a path that was never written is a no-op, so
 * legacy receipts with no thumbnail are safe.
 */
export function allStoragePathsFor(purchase: {
  receipt_path?: string | null;
  receipt_paths?: string[] | null;
}): string[] {
  const full = [
    ...((purchase.receipt_paths ?? []).filter(Boolean) as string[]),
    ...(purchase.receipt_path ? [purchase.receipt_path] : []),
  ];
  return [...new Set(full.flatMap((p) => [p, thumbPathFor(p)]))];
}
