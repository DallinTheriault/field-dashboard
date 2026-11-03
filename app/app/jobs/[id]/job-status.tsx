"use client";

import { useState } from "react";
import { InlineStatusEdit } from "@/components/ui/inline-status-edit";
import { browserSupabase } from "@/lib/supabase/lazy-client";
import type { ScheduleColumns } from "@/lib/schedule";
import { SiteDaysDialog } from "../../estimator/mileage/site-days";

/**
 * The job page's status menu. Marked Completed while nothing says which days
 * you were on site (no hours, no days), it asks right there: no page load in
 * between, which could stall until something else on the page updated.
 */
export function JobStatus({
  jobId,
  currentStatus,
  schedule,
  tz,
  siteDays,
}: {
  jobId: number;
  currentStatus: string;
  schedule: ScheduleColumns;
  tz: string;
  /** The job's scheduled days, for owners and managers tracking mileage; null: never ask. */
  siteDays: string[] | null;
}) {
  const [ask, setAsk] = useState<string[] | null>(null);

  async function saved(next: string) {
    if (next !== "completed" || !siteDays) return;
    const supabase = await browserSupabase();
    const [hours, days] = await Promise.all([
      supabase.from("time_entries").select("id", { count: "exact", head: true }).eq("job_id", jobId),
      supabase.from("job_site_days").select("job_id", { count: "exact", head: true }).eq("job_id", jobId),
    ]);
    // If the check fails, ask anyway: "Skip for now" is one tap.
    if (hours.error || days.error || ((hours.count ?? 0) === 0 && (days.count ?? 0) === 0)) setAsk(siteDays);
  }

  return (
    <>
      <InlineStatusEdit jobId={jobId} currentStatus={currentStatus} schedule={schedule} tz={tz} onSaved={saved} />
      {ask && <SiteDaysDialog jobId={jobId} days={ask} onClose={() => setAsk(null)} />}
    </>
  );
}
