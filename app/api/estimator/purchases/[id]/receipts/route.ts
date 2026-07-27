import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { thumbPathFor } from "@/lib/estimator/receipt-paths";

const MAX_BYTES = 8 * 1024 * 1024;
// Scan images only — types Claude vision accepts (HEIC excluded on purpose;
// the client compresses to JPEG before upload anyway).
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Multi-image receipt upload for the scan flow (long receipts span
 * photos). Appends to purchases.receipt_paths[] — the legacy single-path
 * route stays for manual attachments. Same sealed-bucket door as always.
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
    .select("id, client_id, receipt_paths")
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
      return NextResponse.json({ error: "Use JPEG/PNG/WebP photos." }, { status: 400 });
    }
  }

  // Optional small renditions, one per photo, same order (field "thumbs").
  // A receipt is ~1.2MB at 2400px/85%; lists/grids render the ~400px thumb.
  const thumbs = formData.getAll("thumbs").filter((f): f is File => f instanceof File);

  const admin = createAdminClient();
  const newPaths: string[] = [];
  for (const [i, f] of files.entries()) {
    const ext = f.type === "image/png" ? "png" : f.type === "image/webp" ? "webp" : "jpg";
    const path = `${clientId}/purchase-${purchaseId}-${randomUUID()}.${ext}`;
    const { error } = await admin.storage
      .from("receipts")
      .upload(path, await f.arrayBuffer(), { contentType: f.type, upsert: false });
    if (error) {
      // Don't leave earlier objects orphaned behind a failed batch.
      if (newPaths.length > 0) await admin.storage.from("receipts").remove(newPaths);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    newPaths.push(path);

    // Thumbnail is best-effort by design: field connectivity is unreliable and
    // losing a receipt because its thumbnail failed would be absurd. The list
    // falls back to the full image when no -thumb object exists.
    const thumb = thumbs[i];
    if (thumb) {
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

  const allPaths = [...((purchase.receipt_paths as string[] | null) ?? []), ...newPaths];
  const { error: updateErr } = await admin
    .from("purchases")
    .update({ receipt_paths: allPaths })
    .eq("id", purchaseId);
  if (updateErr) {
    await admin.storage.from("receipts").remove(newPaths);
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, paths: newPaths });
}
