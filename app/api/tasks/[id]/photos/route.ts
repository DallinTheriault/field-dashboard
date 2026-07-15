import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
]);

/**
 * Upload a photo onto a task. Same private-bucket door as receipts:
 * the job-photos bucket has NO storage policies — this route (service
 * role + tenant checks) is the only way in. Client compresses first;
 * the size cap here is the backstop.
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
  const taskId = Number(id);
  if (!Number.isInteger(taskId)) {
    return NextResponse.json({ error: "Bad task id" }, { status: 400 });
  }

  // Writer check — photo writes are owner/manager, like the table RLS.
  const { data: clientUsers } = await supabase
    .from("client_users")
    .select("client_id, role")
    .eq("auth_user_id", user.id)
    .in("role", ["owner", "manager"])
    .limit(1);
  const clientId = clientUsers?.[0]?.client_id;
  if (!clientId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: task } = await supabase
    .from("tasks")
    .select("id, client_id, job_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!task || task.client_id !== clientId) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("photo");
  const caption = formData.get("caption");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 8MB)" }, { status: 400 });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: "Use a photo (PNG/JPEG/WebP/HEIC)." }, { status: 400 });
  }

  const ext =
    file.type === "image/png" ? "png"
    : file.type === "image/webp" ? "webp"
    : file.type === "image/heic" ? "heic"
    : "jpg";
  const path = `${task.client_id}/${task.job_id}/${task.id}/${randomUUID()}.${ext}`;

  const admin = createAdminClient();
  const { error: uploadErr } = await admin.storage
    .from("job-photos")
    .upload(path, await file.arrayBuffer(), {
      contentType: file.type,
      upsert: false,
    });
  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const { data: photo, error: insertErr } = await admin
    .from("task_photos")
    .insert({
      client_id: task.client_id,
      task_id: task.id,
      storage_path: path,
      caption: typeof caption === "string" && caption.trim() ? caption.trim() : null,
    })
    .select("id")
    .single();
  if (insertErr || !photo) {
    // Don't leave an orphaned object behind the failed row.
    await admin.storage.from("job-photos").remove([path]);
    return NextResponse.json(
      { error: insertErr?.message ?? "Photo save failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, id: photo.id });
}
