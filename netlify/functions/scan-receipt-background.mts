import { createClient } from "@supabase/supabase-js";
import { runScanJob } from "../../lib/receipts/scan-job";
import { verifyScan } from "../../lib/receipts/signature";

/**
 * Reads a saved receipt in the background (up to 15 minutes; the "-background"
 * name makes Netlify answer the caller 202 straight away). The scan route
 * sends { purchaseId, ts, sig }; the read lands on the purchase as "Check
 * this", or "Needs entry" if it fails. Uses the env vars the app already has.
 */
export default async (req: Request): Promise<void> => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("[scan-receipt] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set");
    return;
  }
  const purchaseId = verifyScan(key, await req.json().catch(() => null));
  if (purchaseId === null) {
    console.warn("[scan-receipt] refused: bad or expired signature");
    return;
  }
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const start = Date.now();
  const result = await runScanJob(admin, purchaseId);
  console.log("[scan-receipt] done", { purchaseId, ...result, elapsedMs: Date.now() - start });
};

// Answer the caller 202 at once and run up to 15 minutes. (The "-background"
// file name does the same on its own; this says it outright.)
export const config = { background: true };
