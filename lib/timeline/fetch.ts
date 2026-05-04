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
 * v0.6.2: rewritten to fix the wasted-query bug from v0.6.0/0.6.1.
 * Previously we did 4-5 sequential round-trips including a useless query
 * that filtered sms_messages by `thread_id = contactId` (broken — those
 * are different IDs). Now we do at most 2 round-trip waves.
 *
 * Job timeline: 2 waves
 *   Wave 1: job (sequential, needed for contact_id) + threads-by-contact
 *           (we don't yet know if there's a contact, but if there is, we
 *           need its threads — done in parallel within wave 2)
 *   Wave 2: calls + sms (via threads) + status_log — all parallel
 *
 * Contact timeline: 1 wave
 *   threads-by-contact + calls — parallel
 *   then sms-by-thread-ids in second wave (only if threads exist)
 */
export async function getActivityTimeline(
  kind: "job" | "contact",
  id: number,
): Promise<TimelineEvent[]> {
  const supabase = await createClient();
  const events: TimelineEvent[] = [];

  if (kind === "job") {
    // Step 1: fetch the job to get contact_id (must be sequential — we need it
    // to find SMS threads for the linked contact).
    const { data: job } = await supabase
      .from("jobs")
      .select("contact_id")
      .eq("id", id)
      .maybeSingle();
    const contactId = (job as { contact_id?: number | null } | null)?.contact_id ?? null;

    // Step 2: parallel fetch — calls (by job_id), status log, and threads (by contact_id).
    const [callsRes, statusRes, threadsRes] = await Promise.all([
      supabase
        .from("call_summaries")
        .select(
          "id, started_at, created_at, caller_name, caller_phone, outcome, summary, duration_seconds, vapi_call_id, job_id",
        )
        .eq("job_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("job_status_log")
        .select("id, old_status, new_status, changed_by, changed_at, job_id")
        .eq("job_id", id)
        .order("changed_at", { ascending: false })
        .limit(50),
      contactId
        ? supabase.from("sms_threads").select("id").eq("contact_id", contactId)
        : Promise.resolve({ data: [] as Array<{ id: number }>, error: null }),
    ]);

    // Step 3: if threads exist, fetch SMS messages for them
    const threadIds = ((threadsRes.data ?? []) as Array<{ id: number }>).map((t) => t.id);
    let smsRows: Array<{
      id: number;
      thread_id: number;
      direction: string;
      body: string;
      sent_by_user_id: string | null;
      twilio_status: string | null;
      created_at: string;
    }> = [];
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

    appendCalls(events, callsRes.data);
    appendSms(events, smsRows);
    appendStatusChanges(events, statusRes.data);
  } else {
    // Contact timeline — 2 waves total
    // Wave 1: parallel calls + threads
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

    // Wave 2: SMS by thread (only if any threads)
    let smsRows: Array<{
      id: number;
      thread_id: number;
      direction: string;
      body: string;
      sent_by_user_id: string | null;
      twilio_status: string | null;
      created_at: string;
    }> = [];
    const threadIds = ((threadsRes.data ?? []) as Array<{ id: number }>).map((t) => t.id);
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

    appendCalls(events, callsRes.data);
    appendSms(events, smsRows);
  }

  events.sort(
    (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
  );
  return events.slice(0, 50);
}

function appendCalls(
  events: TimelineEvent[],
  data:
    | Array<{
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
      }>
    | null,
) {
  for (const c of data ?? []) {
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
}

function appendSms(
  events: TimelineEvent[],
  rows: Array<{
    id: number;
    thread_id: number;
    direction: string;
    body: string;
    sent_by_user_id: string | null;
    twilio_status: string | null;
    created_at: string;
  }>,
) {
  for (const m of rows) {
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

function appendStatusChanges(
  events: TimelineEvent[],
  data:
    | Array<{
        id: number;
        old_status: string | null;
        new_status: string;
        changed_by: string | null;
        changed_at: string;
        job_id: number;
      }>
    | null,
) {
  for (const s of data ?? []) {
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
}
