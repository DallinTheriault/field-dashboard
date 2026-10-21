import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { thumbPathFor } from "@/lib/estimator/receipt-paths";
import { MAX_PIECES } from "@/lib/receipts/pieces";

const MAX_BYTES = 8 * 1024 * 1024;
// Types the scanner reads: photos (the phone converts HEIC to JPEG before
// upload) and PDFs (emailed receipts).
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
/** Pieces across the whole receipt (the scanner reads at most 8 parts). */
const MAX_TOTAL_PIECES = 8;

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

  // Any member of the tenant may upload receipt photos for the scan flow
  // (architect Q1); the purchase row itself is created by a gated server
  // action. client_id derives from the session, never the body.
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
    .select("id, client_id, receipt_paths, scan_paths")
    .eq("id", purchaseId)
    .maybeSingle();
  if (!purchase || purchase.client_id !== clientId) {
    return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const files = formData.getAll("receipts").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
  }
  if (files.length > 6) {
    return NextResponse.json({ error: "Max 6 photos per receipt" }, { status: 400 });
  }
  for (const f of files) {
    if (f.size > MAX_BYTES) {
      return NextResponse.json({ error: "File too large (max 8MB each)" }, { status: 400 });
    }
    if (!ALLOWED_MIME.has(f.type)) {
      return NextResponse.json({ error: "Use a photo (JPEG, PNG, WebP) or a PDF." }, { status: 400 });
    }
  }

  const pieces = formData.getAll("pieces").filter((f): f is File => f instanceof File);
  let plan: number[] = files.map(() => 0);
  if (pieces.length > 0) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(formData.get("plan") ?? ""));
    } catch {
      parsed = null;
    }
    const ok =
      Array.isArray(parsed) &&
      parsed.length === files.length &&
      parsed.every((n) => Number.isInteger(n) && n >= 0 && n <= MAX_PIECES && n !== 1) &&
      parsed.reduce((a: number, b: number) => a + b, 0) === pieces.length &&
      pieces.length <= MAX_TOTAL_PIECES &&
      pieces.every((p) => p.type === "image/jpeg" && p.size <= MAX_BYTES);
    if (!ok) return NextResponse.json({ error: "Bad receipt pieces." }, { status: 400 });
    plan = parsed as number[];
  }

  // Optional small renditions, one per photo, same order (field "thumbs").
  // A receipt is ~1.2MB at 2400px/85%; lists/grids render the ~400px thumb.
  const thumbs = formData.getAll("thumbs").filter((f): f is File => f instanceof File);

  const admin = createAdminClient();
  const newPaths: string[] = [];
  const written: string[] = []; // photos and pieces, for cleanup on failure
  const scanOrder: string[] = []; // what the scanner reads for these files
  let pieceAt = 0;
  for (const [i, f] of files.entries()) {
    const path = `${clientId}/purchase-${purchaseId}-${randomUUID()}.${EXT[f.type]}`;
    const { error } = await admin.storage
      .from("receipts")
      .upload(path, await f.arrayBuffer(), { contentType: f.type, upsert: false });
    if (error) {
      // Don't leave earlier objects orphaned behind a failed batch.
      if (written.length > 0) await admin.storage.from("receipts").remove(written);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    newPaths.push(path);
    written.push(path);

    if (plan[i] === 0) scanOrder.push(path);
    for (let k = 0; k < plan[i]; k++) {
      const piece = pieces[pieceAt++];
      const piecePath = `${clientId}/purchase-${purchaseId}-${randomUUID()}-piece${k + 1}.jpg`;
      const { error: pErr } = await admin.storage
        .from("receipts")
        .upload(piecePath, await piece.arrayBuffer(), { contentType: "image/jpeg", upsert: false });
      if (pErr) {
        await admin.storage.from("receipts").remove(written);
        return NextResponse.json({ error: pErr.message }, { status: 500 });
      }
      written.push(piecePath);
      scanOrder.push(piecePath);
    }

    // Thumbnail is best-effort by design: field connectivity is unreliable and
    // losing a receipt because its thumbnail failed would be absurd. The list
    // falls back to the full image when no -thumb object exists.
    const thumb = thumbs[i];
    if (thumb && thumb.size > 0) {
      const thumbPath = thumbPathFor(path);
      const { error: tErr } = await admin.storage
        .from("receipts")
        .upload(thumbPath, await thumb.arrayBuffer(), {
          contentType: thumb.type || "image/jpeg",
          upsert: true,
        });
      if (tErr) console.error("[receipts] thumbnail upload failed (degrading)", tErr);
    }
  }

  const priorPaths = (purchase.receipt_paths as string[] | null) ?? [];
  const priorScan = (purchase.scan_paths as string[] | null) ?? [];
  const allPaths = [...priorPaths, ...newPaths];
  // Pieces anywhere on the receipt: the scanner reads the whole receipt in
  // order, pieces in place of their photo. None: it reads receipt_paths.
  const scanPaths =
    priorScan.length > 0 || pieces.length > 0 ? [...(priorScan.length > 0 ? priorScan : priorPaths), ...scanOrder] : [];
  const { error: updateErr } = await admin
    .from("purchases")
    .update({ receipt_paths: allPaths, scan_paths: scanPaths })
    .eq("id", purchaseId);
  if (updateErr) {
    await admin.storage.from("receipts").remove(written);
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, paths: newPaths });
}
