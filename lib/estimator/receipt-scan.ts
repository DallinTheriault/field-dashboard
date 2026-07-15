/**
 * Receipt-scan extraction contract (handoff 3 §6.1). Pure helpers — the
 * API route does auth/flag/storage/metering; this file owns the prompt
 * and the defensive parse so both are unit-testable.
 */

export type ScanItem = {
  description: string;
  sku: string | null;
  qty: number | null;
  unit_price: number | null;
  amount: number | null;
};

export type ScanResult = {
  vendor: string | null;
  date: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  items: ScanItem[];
};

export const SCAN_MODEL = "claude-haiku-4-5";
/** §6.1.4: a truncated 40-line receipt fails parse and masquerades as a
 * model error — never configure below 4096. */
export const SCAN_MAX_TOKENS = 8192;

export const SCAN_SYSTEM_PROMPT = `You extract data from receipt photos for a field-service bookkeeping app.

Return ONLY a valid JSON object — no markdown fences, no commentary, no text before or after. Exact schema:
{"vendor": string|null, "date": string|null, "subtotal": number|null, "tax": number|null, "total": number|null, "items": [{"description": string, "sku": string|null, "qty": number|null, "unit_price": number|null, "amount": number|null}]}

Rules:
- "date" is the purchase date in YYYY-MM-DD form.
- Numbers are plain dollars (e.g. 12.97), never strings, never "$".
- "amount" is the line total as printed; "unit_price" is per-unit when qty > 1.
- Normalize cryptic retail SKU descriptions into plain trade language a contractor would say out loud ("2X4X8 KD WWSPF" becomes "2x4x8 lumber", "GRT 1G KILZ2 PRIMER" becomes "Kilz 2 primer, 1 gal") — but preserve the raw printed text in "sku".
- Skip non-item lines: subtotals, tax lines, payment/tender lines, loyalty numbers, promos that aren't a priced item. Include discount lines only if they carry their own negative amount.
- If several photos are provided they are ONE receipt in order — combine into one result, never duplicate overlapping lines.
- Unreadable or missing values become null. NEVER guess a number you cannot read.`;

export const SCAN_RETRY_INSTRUCTION =
  "Your previous reply was not parseable as JSON. Respond again with ONLY the JSON object matching the schema — no fences, no commentary, first character must be { and last must be }.";

/** Media types Claude vision accepts (HEIC is not one of them). */
export const SCAN_IMAGE_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v * 100) / 100;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[$,]/g, ""));
    if (Number.isFinite(n)) return Math.round(n * 100) / 100;
  }
  return null;
};
const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

/**
 * Defensive parse (§6.1.6): strip fences even though the prompt forbids
 * them, tolerate prose around the object, coerce field types, drop
 * malformed items. Returns null when nothing usable can be recovered —
 * the route then retries once, then falls back to manual entry.
 */
export function parseScanResponse(raw: string): ScanResult | null {
  let text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) text = fenced[1].trim();
  // Tolerate stray prose: take the outermost {...} span.
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last <= first) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(text.slice(first, last + 1));
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return null;
  const o = obj as Record<string, unknown>;

  const rawItems = Array.isArray(o.items) ? o.items : [];
  const items: ScanItem[] = [];
  for (const it of rawItems) {
    if (typeof it !== "object" || it === null) continue;
    const i = it as Record<string, unknown>;
    const description = str(i.description);
    if (!description) continue; // an item without a description is noise
    items.push({
      description,
      sku: str(i.sku),
      qty: num(i.qty),
      unit_price: num(i.unit_price),
      amount: num(i.amount),
    });
  }

  const result: ScanResult = {
    vendor: str(o.vendor),
    date: normalizeDate(str(o.date)),
    subtotal: num(o.subtotal),
    tax: num(o.tax),
    total: num(o.total),
    items,
  };
  // "Nothing usable": no items AND no header numbers -> treat as failed.
  if (items.length === 0 && result.total === null && result.vendor === null) {
    return null;
  }
  return result;
}

/** YYYY-MM-DD or null — never guess. */
function normalizeDate(v: string | null): string | null {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const us = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (us) {
    const [, m, d, y] = us;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

/** Item-sum vs what the receipt says the items should sum to — the
 * confirm screen's mismatch warning (§6.3: catches missed lines and
 * hallucinated prices). Items sum to the PRE-TAX subtotal, so when tax
 * is known compare against total − tax, not the grand total. */
export function scanTotalsMismatch(result: {
  total: number | null;
  tax?: number | null;
  items: Array<{ amount: number | null }>;
}): { itemSum: number; expected: number | null; mismatch: boolean } {
  const itemSum =
    Math.round(
      result.items.reduce((s, i) => s + (i.amount ?? 0), 0) * 100,
    ) / 100;
  const expected =
    result.total === null
      ? null
      : Math.round((result.total - (result.tax ?? 0)) * 100) / 100;
  const mismatch = expected !== null && Math.abs(itemSum - expected) > 0.01;
  return { itemSum, expected, mismatch };
}
