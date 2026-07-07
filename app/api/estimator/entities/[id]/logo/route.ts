import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/svg+xml",
  "image/webp",
]);

async function authorizeEntity(entityIdRaw: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 401 as const, error: "Unauthorized" };

  const entityId = Number(entityIdRaw);
  if (!Number.isInteger(entityId)) {
    return { status: 400 as const, error: "Bad entity id" };
  }

  const { data: clientUsers } = await supabase
    .from("client_users")
    .select("client_id, role")
    .eq("auth_user_id", user.id)
    .in("role", ["owner", "manager"])
    .limit(1);
  const clientId = clientUsers?.[0]?.client_id;
  if (!clientId) return { status: 403 as const, error: "Forbidden" };

  // RLS double-check: the entity must belong to the caller's tenant.
  const { data: entity } = await supabase
    .from("billing_entities")
    .select("id, client_id")
    .eq("id", entityId)
    .maybeSingle();
  if (!entity || entity.client_id !== clientId) {
    return { status: 404 as const, error: "Entity not found" };
  }

  return { status: 200 as const, clientId, entityId };
}

/** Upload a billing-entity letterhead logo (mirrors /api/branding/logo). */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const auth = await authorizeEntity(id);
  if (auth.status !== 200) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const formData = await request.formData();
  const file = formData.get("logo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 2MB)" }, { status: 400 });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: "Unsupported file type. Use PNG, JPEG, SVG, or WebP." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${auth.clientId}/entity-${auth.entityId}-${Date.now()}.${ext}`;
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadErr } = await admin.storage
    .from("tenant-logos")
    .upload(path, arrayBuffer, { contentType: file.type, upsert: false });
  if (uploadErr) {
    return NextResponse.json(
      { error: "Upload failed", details: uploadErr.message },
      { status: 500 },
    );
  }

  const {
    data: { publicUrl },
  } = admin.storage.from("tenant-logos").getPublicUrl(path);

  const { error: updateErr } = await admin
    .from("billing_entities")
    .update({ logo_path: publicUrl })
    .eq("id", auth.entityId);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ url: publicUrl });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const auth = await authorizeEntity(id);
  if (auth.status !== 200) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("billing_entities")
    .update({ logo_path: null })
    .eq("id", auth.entityId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
