/**
 * The scan route hands a receipt to the background function with a signed
 * note, so nobody else can make the function spend scans. The key is the
 * service-role key both sides already have; no new secret.
 *
 * Relative imports only (bundled by Netlify outside Next.js).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_AGE_MS = 5 * 60 * 1000;

export function signScan(key: string, purchaseId: number, ts: number): string {
  return createHmac("sha256", key).update(`scan.${purchaseId}.${ts}`).digest("hex");
}

export function verifyScan(
  key: string,
  body: { purchaseId?: unknown; ts?: unknown; sig?: unknown } | null,
  now = Date.now(),
): number | null {
  if (!body) return null;
  const { purchaseId, ts, sig } = body;
  if (!Number.isInteger(purchaseId) || !Number.isInteger(ts) || typeof sig !== "string") return null;
  if (Math.abs(now - (ts as number)) > MAX_AGE_MS) return null;
  const want = Buffer.from(signScan(key, purchaseId as number, ts as number), "hex");
  const got = Buffer.from(sig, "hex");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  return purchaseId as number;
}
