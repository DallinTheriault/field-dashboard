/**
 * Where a receipt stands, worked out from its scan columns (v100) and whether
 * it has items yet. Pure, so the list, the job page and Home agree.
 *
 *   reading      saved, the scanner is on it
 *   check        a read is waiting to be checked ("Check this")
 *   compare      a new read of a receipt already saved, to compare
 *   needs_entry  the scan failed ("Needs entry"); the photo is kept
 *   failed_again a new read of a saved receipt failed; what's saved stands
 *   waiting      photo, no items, never scanned (older receipts)
 *   null         done: saved, nothing waiting
 */
import type { StoredScan } from "../estimator/receipt-scan";

/** A scan still queued or scanning after this long has died. */
export const SCAN_STALE_MS = 3 * 60 * 1000;

export type ReceiptState = "reading" | "check" | "compare" | "needs_entry" | "failed_again" | "waiting" | null;

export const PURCHASE_SCAN_COLS = "scan_status, scan_result, scan_error, scan_requested_at, scan_job_id";

export type ScanCols = {
  scan_status: string | null;
  scan_requested_at: string | null;
};

export function receiptState(p: ScanCols & { itemCount: number }, now = Date.now()): ReceiptState {
  const saved = p.itemCount > 0;
  switch (p.scan_status) {
    case "queued":
    case "scanning": {
      const asked = p.scan_requested_at ? Date.parse(p.scan_requested_at) : 0;
      if (now - asked <= SCAN_STALE_MS) return "reading";
      return saved ? "failed_again" : "needs_entry";
    }
    case "ready":
      return saved ? "compare" : "check";
    case "needs_entry":
      return saved ? "failed_again" : "needs_entry";
    default:
      return saved ? null : "waiting";
  }
}

/** States that ask the owner to do something (Home's "receipts to check"). */
export function needsAttention(s: ReceiptState): boolean {
  return s === "check" || s === "compare" || s === "needs_entry";
}

export type PendingReceipt = {
  id: number;
  vendor: string | null;
  purchaseDate: string;
  total: number | null;
  tax: number | null;
  hasPhotos: boolean;
  itemCount: number;
  state: ReceiptState;
  scan: StoredScan | null;
  scanJobId: number | null;
};

export function toPendingReceipt(
  row: ScanCols & {
    id: number;
    vendor: string | null;
    purchase_date: string | null;
    total: number | string | null;
    tax: number | string | null;
    receipt_paths: string[] | null;
    scan_result?: unknown;
    scan_job_id?: number | null;
  },
  itemCount: number,
  now = Date.now(),
): PendingReceipt {
  const n = (v: number | string | null) => (v === null || v === undefined ? null : Number(v));
  return {
    id: row.id,
    vendor: row.vendor,
    purchaseDate: String(row.purchase_date ?? "").slice(0, 10),
    total: n(row.total),
    tax: n(row.tax),
    hasPhotos: (row.receipt_paths ?? []).length > 0,
    itemCount,
    state: receiptState({ ...row, itemCount }, now),
    scan: (row.scan_result as StoredScan | null) ?? null,
    scanJobId: row.scan_job_id ?? null,
  };
}
