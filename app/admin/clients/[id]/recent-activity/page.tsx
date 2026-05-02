import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Phone, MessageSquare, Briefcase, ClipboardList } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Admin debug page — when a tenant calls support and says "the call from
 * 10 minutes ago didn't save," this is where you look.
 *
 * Shows the most recent 50 events of each type for the tenant. Uses the
 * admin client (service role) so it bypasses RLS for cross-tenant support
 * access. Gating is enforced by the /admin layout.
 */
export default async function AdminRecentActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createAdminClient();
  const clientId = Number(id);

  const { data: client } = await supabase
    .from("Clients")
    .select("id, business_name")
    .eq("id", clientId)
    .maybeSingle();

  if (!client) notFound();

  const [calls, smsRows, jobs, intakes] = await Promise.all([
    supabase
      .from("call_summaries")
      .select(
        "id, vapi_call_id, caller_name, caller_phone, intent, outcome, duration_seconds, started_at, created_at",
      )
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("sms_messages")
      .select(
        "id, thread_id, direction, body, twilio_status, error_code, created_at",
      )
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("jobs")
      .select(
        "id, name, phone, status, source, created_at, updated_at",
      )
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("onboard_intake_log")
      .select("id, ip_hash, business_name, owner_email, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  function fmt(d: string | null): string {
    if (!d) return "—";
    return new Date(d).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  return (
    <div className="max-w-5xl">
      <Link
        href={`/admin/clients/${clientId}`}
        className="inline-flex items-center gap-1.5 text-xs text-bone-400 hover:text-bone-50 mb-4"
      >
        <ArrowLeft size={12} />
        Back to tenant config
      </Link>

      <div className="mb-6">
        <div className="label-eyebrow mb-1">Recent activity · debug</div>
        <h1 className="text-2xl font-semibold text-bone-50 tracking-tight">
          {client.business_name || `Tenant #${clientId}`}
        </h1>
        <p className="text-sm text-bone-300 mt-1">
          Last 50 of each event type. Use this to debug &ldquo;the call didn&apos;t save&rdquo;
          or &ldquo;why didn&apos;t the text send&rdquo; reports.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DebugSection
          icon={Phone}
          title="Calls"
          count={calls.data?.length ?? 0}
        >
          {(calls.data ?? []).length === 0 ? (
            <Empty />
          ) : (
            <table className="w-full text-2xs">
              <thead>
                <tr className="text-bone-400 border-b border-line-subtle">
                  <th className="text-left py-1.5">Time</th>
                  <th className="text-left py-1.5">Caller</th>
                  <th className="text-left py-1.5">Outcome</th>
                  <th className="text-right py-1.5">Dur</th>
                </tr>
              </thead>
              <tbody>
                {(calls.data ?? []).map((c) => (
                  <tr key={c.id} className="border-b border-line-subtle">
                    <td className="py-1 font-mono text-bone-300">
                      {fmt(c.started_at ?? c.created_at)}
                    </td>
                    <td className="py-1 text-bone-100 truncate max-w-[140px]">
                      {c.caller_name ?? c.caller_phone ?? "—"}
                    </td>
                    <td className="py-1 text-bone-300">
                      {c.outcome ?? "—"}
                    </td>
                    <td className="py-1 text-right text-bone-300 font-mono">
                      {c.duration_seconds ? `${c.duration_seconds}s` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DebugSection>

        <DebugSection
          icon={MessageSquare}
          title="SMS messages"
          count={smsRows.data?.length ?? 0}
        >
          {(smsRows.data ?? []).length === 0 ? (
            <Empty />
          ) : (
            <table className="w-full text-2xs">
              <thead>
                <tr className="text-bone-400 border-b border-line-subtle">
                  <th className="text-left py-1.5">Time</th>
                  <th className="text-left py-1.5">Dir</th>
                  <th className="text-left py-1.5">Status</th>
                  <th className="text-left py-1.5">Body</th>
                </tr>
              </thead>
              <tbody>
                {(smsRows.data ?? []).map((m) => (
                  <tr key={m.id} className="border-b border-line-subtle">
                    <td className="py-1 font-mono text-bone-300">
                      {fmt(m.created_at)}
                    </td>
                    <td className="py-1 text-bone-300">
                      {m.direction === "inbound" ? "in" : "out"}
                    </td>
                    <td
                      className={`py-1 ${
                        m.twilio_status === "delivered"
                          ? "text-field-500"
                          : m.twilio_status === "failed" ||
                              m.twilio_status === "undelivered"
                            ? "text-status-danger"
                            : "text-bone-400"
                      }`}
                    >
                      {m.twilio_status ?? "—"}
                      {m.error_code && ` (${m.error_code})`}
                    </td>
                    <td className="py-1 text-bone-100 truncate max-w-[180px]">
                      {m.body}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DebugSection>

        <DebugSection
          icon={Briefcase}
          title="Jobs"
          count={jobs.data?.length ?? 0}
        >
          {(jobs.data ?? []).length === 0 ? (
            <Empty />
          ) : (
            <table className="w-full text-2xs">
              <thead>
                <tr className="text-bone-400 border-b border-line-subtle">
                  <th className="text-left py-1.5">Created</th>
                  <th className="text-left py-1.5">ID</th>
                  <th className="text-left py-1.5">Customer</th>
                  <th className="text-left py-1.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {(jobs.data ?? []).map((j) => (
                  <tr key={j.id} className="border-b border-line-subtle">
                    <td className="py-1 font-mono text-bone-300">
                      {fmt(j.created_at)}
                    </td>
                    <td className="py-1 font-mono text-bone-400">{j.id}</td>
                    <td className="py-1 text-bone-100 truncate max-w-[140px]">
                      {j.name ?? "—"}
                    </td>
                    <td className="py-1 text-bone-300">{j.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DebugSection>

        <DebugSection
          icon={ClipboardList}
          title="Onboard intakes"
          count={intakes.data?.length ?? 0}
        >
          {(intakes.data ?? []).length === 0 ? (
            <Empty />
          ) : (
            <table className="w-full text-2xs">
              <thead>
                <tr className="text-bone-400 border-b border-line-subtle">
                  <th className="text-left py-1.5">Created</th>
                  <th className="text-left py-1.5">Business</th>
                  <th className="text-left py-1.5">IP hash</th>
                </tr>
              </thead>
              <tbody>
                {(intakes.data ?? []).map((it) => (
                  <tr key={it.id} className="border-b border-line-subtle">
                    <td className="py-1 font-mono text-bone-300">
                      {fmt(it.created_at)}
                    </td>
                    <td className="py-1 text-bone-100 truncate max-w-[140px]">
                      {it.business_name ?? "—"}
                    </td>
                    <td className="py-1 font-mono text-bone-500 truncate">
                      {(it.ip_hash ?? "").substring(0, 8)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DebugSection>
      </div>
    </div>
  );
}

function DebugSection({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: typeof Phone;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="panel overflow-hidden">
      <div className="px-4 h-11 flex items-center justify-between border-b border-line">
        <div className="flex items-center gap-2">
          <Icon size={13} className="text-bone-400" />
          <h2 className="text-sm font-semibold text-bone-100">{title}</h2>
        </div>
        <span className="text-2xs text-bone-400 font-mono">{count}</span>
      </div>
      <div className="px-4 py-3 max-h-96 overflow-y-auto">{children}</div>
    </div>
  );
}

function Empty() {
  return <div className="text-xs text-bone-500 py-3 text-center">None.</div>;
}
