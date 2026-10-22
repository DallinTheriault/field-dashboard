import { normalizeVendor } from "./vendor-normalize";

/**
 * One name per common store, so a scan that reads "The Home Depot #4410" or
 * "Lowe's Home Centers, LLC" saves the same name as last time. Keyed by
 * normalizeVendor's comparison key; a receipt matches a store when its key
 * is the store's key or starts with it ("LOWE S HOME CENTERS LLC"). Only
 * names that can't be mistaken for another business are listed.
 */
const STORES: ReadonlyArray<readonly [key: string, name: string]> = [
  ["HOME DEPOT", "Home Depot"],
  ["LOWE S", "Lowe's"],
  ["LOWES", "Lowe's"],
  ["SHERWIN WILLIAMS", "Sherwin-Williams"],
  ["ACE HARDWARE", "Ace Hardware"],
  ["HARBOR FREIGHT", "Harbor Freight"],
  ["MENARDS", "Menards"],
  ["WALMART", "Walmart"],
  ["WAL MART", "Walmart"],
  ["COSTCO", "Costco"],
];

/** The store's usual name when it's a common one; otherwise the name as read (trimmed). */
export function storeName(raw: string): string;
export function storeName(raw: string | null): string | null;
export function storeName(raw: string | null): string | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  const key = normalizeVendor(trimmed);
  if (!key) return trimmed;
  const hit = STORES.find(([k]) => key === k || key.startsWith(`${k} `));
  return hit ? hit[1] : trimmed;
}
