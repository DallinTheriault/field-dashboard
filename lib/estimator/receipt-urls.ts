import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { thumbPathFor } from "./receipt-paths";

/**
 * Batched signed-URL minting for receipt listings (RECEIPTS_VIEW_SPEC §6.3).
 *
 * The per-purchase viewer route mints ONE url per request — fine for a single
 * full-size image, ruinous for a list (one round trip per thumbnail, exactly
 * the regression the perf effort removed). `createSignedUrls` takes the whole
 * path array and mints them in a SINGLE storage call, so a page of receipts
 * costs one pass regardless of row count.
 *
 * Thumb-or-full: both candidate paths go in the same batch, and each purchase
 * resolves to its thumbnail when that object exists, else the full image
 * (legacy receipts and any upload whose thumbnail failed). Callers must have
 * already authorized the tenant — this uses the admin client.
 */
const TTL_SECONDS = 3600;

export type ReceiptThumb = { purchaseId: number; url: string | null };

export async function mintReceiptThumbUrls(
  purchases: Array<{ id: number; receipt_paths: string[] | null; receipt_path: string | null }>,
): Promise<Map<number, string>> {
  const firstPathByPurchase = new Map<number, string>();
  for (const p of purchases) {
    const first =
      (p.receipt_paths ?? []).find(Boolean) ?? p.receipt_path ?? null;
    if (first) firstPathByPurchase.set(p.id, first);
  }
  if (firstPathByPurchase.size === 0) return new Map();

  const fullPaths = [...firstPathByPurchase.values()];
  const thumbPaths = fullPaths.map(thumbPathFor);

  // ONE storage call for every image on the page (thumbs + full fallbacks).
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("receipts")
    .createSignedUrls([...thumbPaths, ...fullPaths], TTL_SECONDS);
  if (error || !data) return new Map();

  const urlByPath = new Map<string, string>();
  for (const row of data) {
    // Per-path errors are expected: a legacy receipt has no -thumb object.
    if (!row.error && row.signedUrl && row.path) urlByPath.set(row.path, row.signedUrl);
  }

  const out = new Map<number, string>();
  for (const [purchaseId, full] of firstPathByPurchase) {
    const url = urlByPath.get(thumbPathFor(full)) ?? urlByPath.get(full);
    if (url) out.set(purchaseId, url);
  }
  return out;
}

/** All full-size signed URLs for ONE purchase, in order, in a single call. */
export async function mintPurchasePhotoUrls(purchase: {
  receipt_paths: string[] | null;
  receipt_path: string | null;
}): Promise<string[]> {
  const paths = [
    ...((purchase.receipt_paths ?? []).filter(Boolean)),
    ...(purchase.receipt_path ? [purchase.receipt_path] : []),
  ];
  if (paths.length === 0) return [];
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("receipts")
    .createSignedUrls(paths, TTL_SECONDS);
  if (error || !data) return [];
  return data
    .filter((r) => !r.error && r.signedUrl)
    .map((r) => r.signedUrl as string);
}
