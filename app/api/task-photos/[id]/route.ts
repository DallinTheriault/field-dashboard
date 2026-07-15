import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * View a task photo: any tenant member (RLS SELECT is the tenant check —
 * if the row is visible to this user, they may see the image). Redirects
 * to a short-lived signed URL; the bucket itself is sealed.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const photoId = Number(id);
  if (!Number.isInteger(photoId)) {
    return NextResponse.json({ error: "Bad photo id" }, { status: 400 });
  }

  const { data: photo } = await supabase
    .from("task_photos")
    .select("id, storage_path")
    .eq("id", photoId)
    .maybeSingle();
  if (!photo) return NextResponse.json({ error: "Photo not found" }, { status: 404 });

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("job-photos")
    .createSignedUrl(photo.storage_path, 3600);
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Signing failed" }, { status: 500 });
  }
  return NextResponse.redirect(data.signedUrl);
}
