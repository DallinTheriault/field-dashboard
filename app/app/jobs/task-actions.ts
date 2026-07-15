"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Deletes that must clean up STORAGE as well as rows live here — the row
 * delete runs through the user's client so RLS is the authority, and only
 * after it succeeds does the admin client remove the objects. Orphaned
 * storage files are a silent cost leak; orphaned rows would 404 the UI.
 * Everything else (create, toggle, reorder, captions) is plain
 * RLS-enforced client-side CRUD.
 */
export async function deleteTaskPhoto(photoId: number): Promise<Result> {
  const supabase = await createClient();
  const { data: photo } = await supabase
    .from("task_photos")
    .select("id, storage_path, tasks(job_id)")
    .eq("id", photoId)
    .maybeSingle();
  if (!photo) return { ok: false, error: "Photo not found." };

  const { data: deleted, error } = await supabase
    .from("task_photos")
    .delete()
    .eq("id", photoId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if ((deleted ?? []).length === 0) {
    return { ok: false, error: "You don't have permission to delete photos." };
  }

  const admin = createAdminClient();
  await admin.storage.from("job-photos").remove([photo.storage_path]);

  const job = photo.tasks as unknown as { job_id: number } | null;
  if (job) revalidatePath(`/app/jobs/${job.job_id}`);
  return { ok: true };
}

/**
 * Delete a task: photo rows cascade, linked estimate lines get task_id
 * NULLed by the FK (pricing untouched), and the storage objects are
 * removed after the row delete clears RLS.
 */
export async function deleteTask(taskId: number): Promise<Result> {
  const supabase = await createClient();
  const { data: task } = await supabase
    .from("tasks")
    .select("id, job_id, task_photos(storage_path)")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return { ok: false, error: "Task not found." };
  const paths = ((task.task_photos as unknown as Array<{ storage_path: string }>) ?? [])
    .map((p) => p.storage_path);

  const { data: deleted, error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", taskId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if ((deleted ?? []).length === 0) {
    return { ok: false, error: "You don't have permission to delete tasks." };
  }

  if (paths.length > 0) {
    const admin = createAdminClient();
    await admin.storage.from("job-photos").remove(paths);
  }

  revalidatePath(`/app/jobs/${task.job_id}`);
  return { ok: true };
}
