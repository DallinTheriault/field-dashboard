import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "application/pdf",
]);

/** Receipt for a PURCHASE (multi-item). Same private-bucket door as
 * expense receipts: owner/manager auth + tenant check, signed-URL viewing. */
async function authorizePurchase(idRaw: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 401 as const, error: "Unauthorized" };

  const purchaseId = Number(idRaw);
  if (!Number.isInteger(purchaseId)) {
    return { status: 400 as const, error: "Bad purchase id" };
  }

  const { data: clientUsers } = await supabase
    .from("client_users")
    .select("client_id, role")
    .eq("auth_user_id", user.id)
    .in("role", ["owner", "manager"])
    .limit(1);
  const clientId = clientUsers?.[0]?.client_id;
  if (!clientId) return { status: 403 as const, error: "Forbidden" };

  const { data: purchase } = await supabase
    .from("purchases")
    .select("id, client_id, receipt_path")
    .eq("id", purchaseId)
    .maybeSingle();
  if (!purchase || purchase.client_id !== clientId) {
    return { status: 404 as const, error: "Purchase not found" };
  }

  return { status: 200 as const, clientId, purchase };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const auth = await authorizePurchase(id);
  if (auth.status !== 200) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const formData = await request.formData();
  const file = formData.get("receipt");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 8MB)" }, { status: 400 });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: "Use a photo (PNG/JPEG/WebP/HEIC) or PDF." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${auth.clientId}/purchase-${auth.purchase.id}-${Date.now()}.${ext}`;
  const { error: uploadErr } = await admin.storage
    .from("receipts")
    .upload(path, await file.arrayBuffer(), {
      contentType: file.type,
      upsert: false,
    });
  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const { error: updateErr } = await admin
    .from("purchases")
    .update({ receipt_path: path })
    .eq("id", auth.purchase.id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const auth = await authorizePurchase(id);
  if (auth.status !== 200) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!auth.purchase.receipt_path) {
    return NextResponse.json({ error: "No receipt attached" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("receipts")
    .createSignedUrl(auth.purchase.receipt_path, 3600);
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Signing failed" }, { status: 500 });
  }
  return NextResponse.redirect(data.signedUrl);
}
