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

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Confirm the user is owner/manager of a client
  const { data: clientUsers } = await supabase
    .from("client_users")
    .select("client_id, role")
    .eq("auth_user_id", user.id)
    .in("role", ["owner", "manager"])
    .limit(1);

  const clientId = clientUsers?.[0]?.client_id;
  if (!clientId) {
    return NextResponse.json(
      { error: "You do not have permission to update branding" },
      { status: 403 },
    );
  }

  // Parse multipart form data
  const formData = await request.formData();
  const file = formData.get("logo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_BYTES / 1024 / 1024}MB)` },
      { status: 400 },
    );
  }

  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type. Use PNG, JPEG, SVG, or WebP.` },
      { status: 400 },
    );
  }

  // Use admin client to bypass RLS (we've already authorized via client_users above)
  const admin = createAdminClient();

  // Path: <client_id>/logo-<timestamp>.<ext>
  // Timestamp prevents browser caching the old logo when replaced.
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${clientId}/logo-${Date.now()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadErr } = await admin.storage
    .from("tenant-logos")
    .upload(path, arrayBuffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadErr) {
    return NextResponse.json(
      { error: "Upload failed", details: uploadErr.message },
      { status: 500 },
    );
  }

  // Get the public URL
  const {
    data: { publicUrl },
  } = admin.storage.from("tenant-logos").getPublicUrl(path);

  // Update Clients.brand_logo_url
  const { error: updateErr } = await admin
    .from("Clients")
    .update({ brand_logo_url: publicUrl })
    .eq("id", clientId);

  if (updateErr) {
    return NextResponse.json(
      { error: "Failed to save logo URL", details: updateErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ url: publicUrl, path });
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: clientUsers } = await supabase
    .from("client_users")
    .select("client_id, role")
    .eq("auth_user_id", user.id)
    .in("role", ["owner", "manager"])
    .limit(1);

  const clientId = clientUsers?.[0]?.client_id;
  if (!clientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  // Clear the URL on the client row. We don't remove from storage to keep history
  // simple; orphaned files are cheap.
  const { error } = await admin
    .from("Clients")
    .update({ brand_logo_url: null })
    .eq("id", clientId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
