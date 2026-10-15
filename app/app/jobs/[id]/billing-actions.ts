"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/permissions/current-role";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Old jobs paid before Field had invoices: mark them paid outside Field so
 * they leave "Ready to invoice" and count as paid. Owner only. Records no
 * payment, so no income. The database enforces both rules
 * (jobs_guard_paid_outside, v099); these checks just say so sooner.
 */
export async function markPaidOutside(jobId: number, note: string): Promise<Result> {
  const session = await getCurrentUserRole();
  if (session?.role !== "owner") return { ok: false, error: "Only an owner can mark a job paid outside Field." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .update({ paid_outside_at: new Date().toISOString(), paid_outside_note: note.trim().slice(0, 500) || null })
    .eq("id", jobId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Job not found." };
  revalidate(jobId);
  return { ok: true };
}

export async function undoPaidOutside(jobId: number): Promise<Result> {
  const session = await getCurrentUserRole();
  if (session?.role !== "owner") return { ok: false, error: "Only an owner can change this." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .update({ paid_outside_at: null, paid_outside_note: null })
    .eq("id", jobId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Job not found." };
  revalidate(jobId);
  return { ok: true };
}

function revalidate(jobId: number) {
  revalidatePath(`/app/jobs/${jobId}`);
  revalidatePath("/app/jobs");
  revalidatePath("/app");
}
