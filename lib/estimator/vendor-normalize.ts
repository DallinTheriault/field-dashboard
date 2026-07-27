/**
 * Vendor normalization + duplicate matching (RECEIPTS_VIEW_SPEC §5.2).
 *
 * Deliberately a SINGLE pure helper with its own tests: the rule is grounded
 * in one real production vendor string plus the spec's example, so tuning it
 * against real receipts later must be a one-file change, not surgery.
 *
 * The match is strict on purpose — all three of vendor/date/total must agree.
 * A same-day second run to the same store for a different amount is a real
 * thing and must never be flagged.
 */

/** Legal/店 suffixes and noise stripped from both sides before comparison. */
const LEADING_THE = /^THE\s+/;
const TRAILING_STORE_NUMBER = /\s*#\s*\d+\s*$/;

/**
 * "HOME DEPOT #4412" and "The Home Depot" both normalize to "HOME DEPOT".
 * Uppercase → strip a trailing store number → strip punctuation → collapse
 * whitespace → strip a leading "THE".
 */
export function normalizeVendor(raw: string | null | undefined): string {
  let v = (raw ?? "").toUpperCase();
  v = v.replace(TRAILING_STORE_NUMBER, " ");
  // Punctuation out, but keep alphanumerics and spaces as separators.
  v = v.replace(/[^A-Z0-9]+/g, " ");
  v = v.trim().replace(/\s+/g, " ");
  v = v.replace(LEADING_THE, "");
  return v.trim();
}

/** Money compare that tolerates numeric-vs-string and float dust. */
function sameAmount(
  a: number | string | null | undefined,
  b: number | string | null | undefined,
): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  const na = typeof a === "number" ? a : Number(a);
  const nb = typeof b === "number" ? b : Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
  return Math.round(na * 100) === Math.round(nb * 100);
}

/** Date compare on the calendar day (both sides are stored as YYYY-MM-DD). */
function sameDate(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false;
  return a.slice(0, 10) === b.slice(0, 10);
}

export type DuplicateCandidate = {
  vendor: string | null;
  purchase_date: string | null;
  total: number | string | null;
};

/**
 * All three must hold: normalized vendor equality, exact purchase_date,
 * exact total. Two of three is NOT a match.
 */
export function isDuplicateMatch(
  a: DuplicateCandidate,
  b: DuplicateCandidate,
): boolean {
  const va = normalizeVendor(a.vendor);
  const vb = normalizeVendor(b.vendor);
  if (!va || !vb || va !== vb) return false;
  if (!sameDate(a.purchase_date, b.purchase_date)) return false;
  return sameAmount(a.total, b.total);
}

/** First matching candidate, or null. Callers pass same-tenant rows only. */
export function findDuplicate<T extends DuplicateCandidate>(
  incoming: DuplicateCandidate,
  existing: T[],
): T | null {
  return existing.find((e) => isDuplicateMatch(incoming, e)) ?? null;
}
