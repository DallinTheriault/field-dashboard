import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dayKeyInTz } from "@/lib/dates";
import { JOB_LOCATION_SELECT, jobAddress, jobContactName, type JobLocationRow } from "@/lib/jobs/address";
import { daysBetween } from "./plan";

export type CatchUpJob = {
  id: number;
  label: string;
  address: string | null;
  status: string;
  archived: boolean;
  /** The scheduled days, to start the picker from. */
  days: string[];
};

/**
 * Every job in the year with no days on site: no hours logged, no days
 * entered, and not marked "wasn't on site". A job belongs to the year it was
 * scheduled in, or created in when it has no date. Finished work first;
 * archived and cancelled jobs last.
 */
export async function jobsWithoutSiteDays(supabase: SupabaseClient, year: number, tz: string): Promise<CatchUpJob[]> {
  const from = `${year}-01-01`;
  const to = `${year + 1}-01-01`;
  const { data: rows } = await supabase
    .from("jobs")
    .select(`id, name, job_number, status, archived_at, start_datetime, end_datetime, created_at, site_days_done_at, ${JOB_LOCATION_SELECT}`)
    .is("site_days_done_at", null)
    .or(`and(start_datetime.gte.${from},start_datetime.lt.${to}),and(start_datetime.is.null,created_at.gte.${from},created_at.lt.${to})`)
    .order("start_datetime", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  const jobs = (rows ?? []) as unknown as Array<
    JobLocationRow & {
      id: number;
      job_number: string | null;
      status: string;
      archived_at: string | null;
      start_datetime: string | null;
      end_datetime: string | null;
    }
  >;
  if (jobs.length === 0) return [];
  const ids = jobs.map((j) => j.id);
  const [{ data: hours }, { data: days }] = await Promise.all([
    supabase.from("time_entries").select("job_id").in("job_id", ids),
    supabase.from("job_site_days").select("job_id").in("job_id", ids),
  ]);
  const onSite = new Set([...(hours ?? []), ...(days ?? [])].map((r) => Number(r.job_id)));
  const rank = (j: (typeof jobs)[number]) =>
    j.archived_at || j.status === "cancelled" ? 2 : j.status === "completed" ? 0 : 1;
  return jobs
    .filter((j) => !onSite.has(j.id))
    .sort((a, b) => rank(a) - rank(b))
    .map((j) => {
      const start = j.start_datetime ? dayKeyInTz(j.start_datetime, tz) : null;
      const end = j.end_datetime ? dayKeyInTz(j.end_datetime, tz) : null;
      return {
        id: j.id,
        label: [j.job_number, jobContactName(j) ?? `Job #${j.id}`].filter(Boolean).join(" "),
        address: jobAddress(j),
        status: j.status,
        archived: !!j.archived_at,
        days: start ? daysBetween(start, end) : [],
      };
    });
}
