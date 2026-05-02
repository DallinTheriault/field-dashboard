import { createClient } from "@/lib/supabase/server";

export type TimelineEvent =
  | {
      kind: "call";
      id: string;
      occurred_at: string;
      caller_name: string | null;
      caller_phone: string | null;
      outcome: string | null;
      summary: string | null;
      duration_seconds: number | null;
      vapi_call_id: string | null;
      job_id: number | null;
    }
  | {
      kind: "sms";
      id: string;
      occurred_at: string;
      direction: "inbound" | "outbound";
      body: string;
      sent_by_user_id: string | null;
      twilio_status: string | null;
      thread_id: number;
    }
  | {
      kind: "status_change";
      id: string;
      occurred_at: string;
      old_status: string | null;
      new_status: string;
      changed_by: string | null;
      job_id: number;
    };

/**
 * Fetch a unified activity timeline for a job or contact.
 *
 * For a job: includes calls linked to this job, SMS for the job's primary
 * contact (looked up via the job's contact_id), and status changes from
 * job_status_log.
 *
 * For a contact: includes calls and SMS for that contact. Contacts don't
 * have statuses so status_change events are omitted.
 *
 * Read-time UNION pattern — three queries in parallel, merge in JS, sort
 * by occurred_at desc. Cap at 50 most recent events to bound the timeline
 * length. Older history can be paginated later if needed.
 *
 * RLS handles tenant scoping — every underlying table has tenant policies,
 * so this function will only return events the caller is allowed to see.
 */
export async function getActivityTimeline(
  kind: "job" | "contact",
  id: number,
): Promise<TimelineEvent[]> {
  const supabase = await createClient();
  const events: TimelineEvent[] = [];

  if (kind === "job") {
    // For a job, we need the contact_id to look up SMS. Fetch the job first.
    const { data: job } = await supabase
      .from("jobs")
      .select("contact_id, phone")
      .eq("id", id)
      .maybeSingle();

    const contactId = (job as { contact_id?: number | null } | null)?.contact_id ?? null;

    // Parallel fetch: calls for this job + sms for the job's contact + status log
    const [callsRes, smsRes, statusRes] = await Promise.all([
      supabase
        .from("call_summaries")
        .select(
          "id, started_at, created_at, caller_name, caller_phone, outcome, summary, duration_seconds, vapi_call_id, job_id",
        )
        .eq("job_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      contactId
        ? supabase
            .from("sms_messages")
            .select(
              "id, thread_id, direction, body, sent_by_user_id, twilio_status, created_at",
            )
            .eq("thread_id", contactId) // not actually thread_id; we filter via join below
            .order("created_at", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("job_status_log")
        .select("id, old_status, new_status, changed_by, changed_at, job_id")
        .eq("job_id", id)
        .order("changed_at", { ascending: false })
        .limit(50),
    ]);

    // Re-fetch SMS via thread join because we need contact_id, not thread_id
    let smsRows: Array<{
      id: number;
      thread_id: number;
      direction: string;
      body: string;
      sent_by_user_id: string | null;
      twilio_status: string | null;
      created_at: string;
    }> = [];
    if (contactId) {
      const { data: threads } = await supabase
        .from("sms_threads")
        .select("id")
        .eq("contact_id", contactId);
      const threadIds = (threads ?? []).map((t: { id: number }) => t.id);
      if (threadIds.length > 0) {
        const { data: msgs } = await supabase
          .from("sms_messages")
          .select(
            "id, thread_id, direction, body, sent_by_user_id, twilio_status, created_at",
          )
          .in("thread_id", threadIds)
          .order("created_at", { ascending: false })
          .limit(50);
        smsRows = (msgs ?? []) as typeof smsRows;
      }
    }

    for (const c of (callsRes.data ?? []) as Array<{
      id: number;
      started_at: string | null;
      created_at: string;
      caller_name: string | null;
      caller_phone: string | null;
      outcome: string | null;
      summary: string | null;
      duration_seconds: number | null;
      vapi_call_id: string | null;
      job_id: number | null;
    }>) {
      events.push({
        kind: "call",
        id: `call-${c.id}`,
        occurred_at: c.started_at ?? c.created_at,
        caller_name: c.caller_name,
        caller_phone: c.caller_phone,
        outcome: c.outcome,
        summary: c.summary,
        duration_seconds: c.duration_seconds,
        vapi_call_id: c.vapi_call_id,
        job_id: c.job_id,
      });
    }

    for (const m of smsRows) {
      events.push({
        kind: "sms",
        id: `sms-${m.id}`,
        occurred_at: m.created_at,
        direction: m.direction === "inbound" ? "inbound" : "outbound",
        body: m.body,
        sent_by_user_id: m.sent_by_user_id,
        twilio_status: m.twilio_status,
        thread_id: m.thread_id,
      });
    }

    for (const s of (statusRes.data ?? []) as Array<{
      id: number;
      old_status: string | null;
      new_status: string;
      changed_by: string | null;
      changed_at: string;
      job_id: number;
    }>) {
      events.push({
        kind: "status_change",
        id: `status-${s.id}`,
        occurred_at: s.changed_at,
        old_status: s.old_status,
        new_status: s.new_status,
        changed_by: s.changed_by,
        job_id: s.job_id,
      });
    }
  } else {
    // Contact view: calls (by contact_id) + sms (by thread.contact_id). No status log.
    const [callsRes, threadsRes] = await Promise.all([
      supabase
        .from("call_summaries")
        .select(
          "id, started_at, created_at, caller_name, caller_phone, outcome, summary, duration_seconds, vapi_call_id, job_id",
        )
        .eq("contact_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("sms_threads").select("id").eq("contact_id", id),
    ]);

    let smsRows: Array<{
      id: number;
      thread_id: number;
      direction: string;
      body: string;
      sent_by_user_id: string | null;
      twilio_status: string | null;
      created_at: string;
    }> = [];
    const threadIds = ((threadsRes.data ?? []) as Array<{ id: number }>).map(
      (t) => t.id,
    );
    if (threadIds.length > 0) {
      const { data: msgs } = await supabase
        .from("sms_messages")
        .select(
          "id, thread_id, direction, body, sent_by_user_id, twilio_status, created_at",
        )
        .in("thread_id", threadIds)
        .order("created_at", { ascending: false })
        .limit(50);
      smsRows = (msgs ?? []) as typeof smsRows;
    }

    for (const c of (callsRes.data ?? []) as Array<{
      id: number;
      started_at: string | null;
      created_at: string;
      caller_name: string | null;
      caller_phone: string | null;
      outcome: string | null;
      summary: string | null;
      duration_seconds: number | null;
      vapi_call_id: string | null;
      job_id: number | null;
    }>) {
      events.push({
        kind: "call",
        id: `call-${c.id}`,
        occurred_at: c.started_at ?? c.created_at,
        caller_name: c.caller_name,
        caller_phone: c.caller_phone,
        outcome: c.outcome,
        summary: c.summary,
        duration_seconds: c.duration_seconds,
        vapi_call_id: c.vapi_call_id,
        job_id: c.job_id,
      });
    }

    for (const m of smsRows) {
      events.push({
        kind: "sms",
        id: `sms-${m.id}`,
        occurred_at: m.created_at,
        direction: m.direction === "inbound" ? "inbound" : "outbound",
        body: m.body,
        sent_by_user_id: m.sent_by_user_id,
        twilio_status: m.twilio_status,
        thread_id: m.thread_id,
      });
    }
  }

  // Sort merged events by occurred_at desc, cap to 50
  events.sort((a, b) => {
    const at = new Date(a.occurred_at).getTime();
    const bt = new Date(b.occurred_at).getTime();
    return bt - at;
  });

  return events.slice(0, 50);
}
