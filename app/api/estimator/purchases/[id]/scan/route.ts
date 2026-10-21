import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inTenantFolder } from "@/lib/estimator/receipt-paths";
import { SCAN_MODEL } from "@/lib/estimator/receipt-scan";
import { runScanJob } from "@/lib/receipts/scan-job";
import { SCAN_STALE_MS } from "@/lib/receipts/state";
import { signScan } from "@/lib/receipts/signature";

export const maxDuration = 60;

/**
 * Ask for a scan of a saved receipt (spec §6.1). The photo is already saved;
 * this only queues the read and hands it to the Netlify background function,
 * so the caller gets an answer at once and can leave the page. The read lands
 * on the purchase as "Check this" (or "Needs entry"). Also "Scan again".
 *
 * client_id derives from the session, never the body. The entitlement is
 * re-checked here and again by the scanner — UI hiding is UX, this is the
 * enforcement. A refusal here is metered (rejected); the scanner meters the
 * rest.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const purchaseId = Number(id);
  if (!Number.isInteger(purchaseId)) {
    return NextResponse.json({ error: "Bad purchase id" }, { status: 400 });
  }

  // Any member of the tenant may scan (architect Q1) — a member scan is the
  // same tenant, same opted-in entitlement, same metered fraction of a cent.
  const { data: clientUsers } = await supabase
    .from("client_users")
    .select("client_id")
    .eq("auth_user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);
  const clientId = clientUsers?.[0]?.client_id;
  if (!clientId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: purchase } = await supabase
    .from("purchases")
    .select("id, client_id, receipt_paths")
    .eq("id", purchaseId)
    .maybeSingle();
  if (!purchase || purchase.client_id !== clientId) {
    return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: flagRow } = await admin
    .from("Clients")
    .select("feature_receipt_ai_enabled")
    .eq("id", clientId)
    .maybeSingle();
  if (!flagRow?.feature_receipt_ai_enabled) {
    const { error } = await admin.from("receipt_scans").insert({
      client_id: clientId,
      purchase_id: purchaseId,
      model: SCAN_MODEL,
      status: "rejected",
    });
    if (error) console.error("[scan] meter write failed", error);
    return NextResponse.json(
      { error: "AI receipt scanning isn't enabled for this account." },
      { status: 403 },
    );
  }

  const paths = ((purchase.receipt_paths as string[] | null) ?? []).filter((p) => inTenantFolder(clientId, p));
  if (paths.length === 0) {
    return NextResponse.json({ error: "No receipt photo to scan." }, { status: 400 });
  }

  // Queue it, unless the scanner already has it (one that has sat longer
  // than SCAN_STALE_MS has died and may start over). A receipt saved with
  // its scan already queued (startReceipt) starts here. The last read is
  // dropped: the new one replaces it.
  const staleBefore = new Date(Date.now() - SCAN_STALE_MS).toISOString();
  const { data: queued, error: qErr } = await admin
    .from("purchases")
    .update({
      scan_status: "queued",
      scan_requested_at: new Date().toISOString(),
      scan_finished_at: null,
      scan_result: null,
      scan_error: null,
    })
    .eq("id", purchaseId)
    .or(`scan_status.is.null,scan_status.in.(queued,ready,needs_entry),scan_requested_at.lt.${staleBefore}`)
    // PostgREST applies the or() to the returned rows too: return its columns.
    .select("id, scan_status, scan_requested_at");
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
  if (!queued?.length) {
    return NextResponse.json({ status: "queued", note: "Already reading this receipt." }, { status: 202 });
  }

  if (process.env.SCAN_RUNNER !== "inline" && (await dispatch(request, purchaseId))) {
    return NextResponse.json({ status: "queued" }, { status: 202 });
  }

  // Local stack (SCAN_RUNNER=inline), or the background function couldn't be
  // reached: read it here. The caller doesn't wait on this answer.
  const result = await runScanJob(admin, purchaseId);
  return NextResponse.json({ status: result.outcome });
}

/** Hand the receipt to the background function. True once it has it. */
async function dispatch(request: Request, purchaseId: number): Promise<boolean> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return false;
  const ts = Date.now();
  try {
    const res = await fetch(new URL("/.netlify/functions/scan-receipt-background", request.url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ purchaseId, ts, sig: signScan(key, purchaseId, ts) }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 202) return true;
    console.error("[scan] background function answered", res.status);
  } catch (e) {
    console.error("[scan] background function unreachable", e instanceof Error ? e.message : e);
  }
  return false;
}
