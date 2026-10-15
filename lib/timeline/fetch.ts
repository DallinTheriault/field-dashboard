import { createClient } from "@/lib/supabase/server";

export type TimelineEvent = {
  kind: "status_change";
  id: string;
  occurred_at: string;
  old_status: string | null;
  new_status: string;
  changed_by: string | null;
  job_id: number;
};

/**
 * Activity for a job (its status changes) or a contact (status changes
 * across their jobs), newest first. Calls and texts were the receptionist's
 * and are no longer shown; their tables are kept.
 */
export async function getActivityTimeline(kind: "job" | "contact", id: number): Promise<TimelineEvent[]> {
  const supabase = await createClient();

  let jobIds: number[] = [id];
  if (kind === "contact") {
    const { data: jobs } = await supabase.from("jobs").select("id").eq("contact_id", id);
    jobIds = (jobs ?? []).map((j) => j.id as number);
    if (jobIds.length === 0) return [];
  }

  const { data } = await supabase
    .from("job_status_log")
    .select("id, old_status, new_status, changed_by, changed_at, job_id")
    .in("job_id", jobIds)
    .order("changed_at", { ascending: false })
    .limit(50);

  return (data ?? []).map((s) => ({
    kind: "status_change" as const,
    id: `status-${s.id}`,
    occurred_at: s.changed_at as string,
    old_status: (s.old_status as string | null) ?? null,
    new_status: s.new_status as string,
    changed_by: (s.changed_by as string | null) ?? null,
    job_id: s.job_id as number,
  }));
}
