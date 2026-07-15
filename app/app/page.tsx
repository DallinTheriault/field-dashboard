import Link from "next/link";
import { ArrowRight, Phone, Calendar, TrendingUp, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusChip } from "@/components/ui/status-chip";
import { getTenantTimezone } from "@/lib/dates";

function fmtDate(d: string | null, tz: string): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { timeZone: tz,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDuration(s: number | null): string {
  if (!s || s < 1) return "—";
  const total = Math.round(s);
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const r = total % 60;
  return `${m}m ${r}s`;
}

function fmtPhone(p: string | null): string {
  if (!p) return "—";
  const d = p.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) {
    return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) {
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return p;
}

export default async function OverviewPage() {
  const tz = await getTenantTimezone();
  const supabase = await createClient();

  const [jobsRes, callsRes, upcomingRes, leadsRes] = await Promise.all([
    supabase.from("jobs").select("id, status, created_at").is("archived_at", null),
    supabase
      .from("call_summaries")
      .select(
        "id, caller_name, caller_phone, intent, outcome, duration_seconds, started_at",
      )
      .order("started_at", { ascending: false })
      .limit(6),
    supabase
      .from("jobs")
      .select("id, name, address, service, start_datetime, status")
      .is("archived_at", null)
      .not("start_datetime", "is", null)
      .gte("start_datetime", new Date().toISOString())
      .not("status", "in", '("completed","cancelled")')
      .order("start_datetime", { ascending: true })
      .limit(5),
    supabase
      .from("jobs")
      .select("id, name, phone, service, created_at")
      .is("archived_at", null)
      .eq("status", "lead")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const jobs = jobsRes.data ?? [];
  const calls = callsRes.data ?? [];
  const upcoming = upcomingRes.data ?? [];
  const leads = leadsRes.data ?? [];

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const jobsThisWeek = jobs.filter(
    (j) => j.created_at && new Date(j.created_at) > weekAgo,
  ).length;
  const callsThisWeek = calls.filter(
    (c) => c.started_at && new Date(c.started_at) > weekAgo,
  ).length;

  const byStatus = {
    lead: jobs.filter((j) => j.status === "lead").length,
    scheduled: jobs.filter((j) => j.status === "scheduled").length,
    completed: jobs.filter((j) => j.status === "completed").length,
  };

  // A lead "converted" once the customer committed — accepted or anything
  // past it (won = commitment, independent of booking). Cancelled and
  // still-open leads/estimates don't count as won.
  const WON_STATUSES = new Set([
    "accepted",
    "scheduled",
    "in_progress",
    "completed",
    "callback",
    "callback_complete",
  ]);
  const wonJobs = jobs.filter((j) => WON_STATUSES.has(j.status ?? "")).length;
  // Denominator excludes cancelled jobs — a dead lead shouldn't drag the rate.
  const convertibleJobs = jobs.filter((j) => j.status !== "cancelled").length;
  const conversionRate =
    convertibleJobs > 0
      ? Math.round((wonJobs / convertibleJobs) * 100)
      : 0;

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="label-eyebrow mb-1">Overview</div>
          <h1 className="text-2xl font-semibold text-bone-50 tracking-tight">
            Welcome back
          </h1>
          <p className="text-sm text-bone-300 mt-1">
            Here&apos;s what happened in the last 7 days.
          </p>
        </div>
        <div className="hidden md:flex items-center gap-2 text-2xs text-bone-400 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-status-completed animate-pulse-ring" />
          Live
        </div>
      </div>

      {/* Metrics row — all clickable */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Link href="/app/calls">
          <MetricCard
            label="Calls this week"
            value={callsThisWeek}
            sub={calls.length > 0 ? `${calls.length} total tracked` : "No calls yet"}
            accent="field"
            className="cursor-pointer"
          />
        </Link>
        <Link href="/app/jobs?status=lead">
          <MetricCard
            label="New leads"
            value={byStatus.lead}
            sub={`${jobsThisWeek} created this week`}
            accent="lead"
            className="cursor-pointer"
          />
        </Link>
        <Link href="/app/calendar">
          <MetricCard
            label="Upcoming"
            value={upcoming.length}
            sub="upcoming jobs"
            accent="scheduled"
            className="cursor-pointer"
          />
        </Link>
        <Link href="/app/jobs">
          <MetricCard
            label="Conversion"
            value={`${conversionRate}%`}
            sub="leads booked or won"
            accent="completed"
            className="cursor-pointer"
          />
        </Link>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Recent calls */}
        <section className="lg:col-span-3 panel">
          <div className="flex items-center justify-between px-4 h-11 border-b border-line">
            <div className="flex items-center gap-2">
              <Phone size={13} strokeWidth={2} className="text-field-500" />
              <h2 className="text-sm font-semibold text-bone-100">Recent calls</h2>
            </div>
            <Link
              href="/app/calls"
              className="text-2xs text-bone-400 hover:text-bone-50 flex items-center gap-1"
            >
              All calls <ArrowRight size={11} />
            </Link>
          </div>

          {calls.length === 0 ? (
            <EmptyState
              icon={Phone}
              title="No calls yet"
              body="Call activity will show here as your assistant handles inbound calls."
            />
          ) : (
            <ul className="divide-y divide-line-subtle">
              {calls.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/app/calls/${c.id}`}
                    className="px-4 py-3 flex items-center gap-3 hover:bg-ink-2 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-ink-3 flex items-center justify-center shrink-0 border border-line-strong">
                      <Phone size={13} className="text-bone-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium text-bone-100 truncate">
                          {c.caller_name || "Unknown caller"}
                        </span>
                        <span className="text-2xs font-mono text-bone-400 truncate">
                          {fmtPhone(c.caller_phone)}
                        </span>
                      </div>
                      <div className="text-2xs text-bone-400 mt-0.5 truncate">
                        {c.intent ? c.intent.replace("_", " ") : "—"}
                        {c.outcome && ` • ${c.outcome.replace(/_/g, " ")}`}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="num text-xs text-bone-100">
                        {fmtDuration(c.duration_seconds)}
                      </div>
                      <div className="text-2xs text-bone-400 mt-0.5">
                        {fmtDate(c.started_at, tz)}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="lg:col-span-2 space-y-5">
          {/* Upcoming */}
          <section className="panel">
            <div className="flex items-center justify-between px-4 h-11 border-b border-line">
              <div className="flex items-center gap-2">
                <Calendar size={13} strokeWidth={2} className="text-status-scheduled" />
                <h2 className="text-sm font-semibold text-bone-100">Upcoming</h2>
              </div>
              <Link
                href="/app/calendar"
                className="text-2xs text-bone-400 hover:text-bone-50 flex items-center gap-1"
              >
                Calendar <ArrowRight size={11} />
              </Link>
            </div>
            {upcoming.length === 0 ? (
              <EmptyState
                icon={Calendar}
                title="Nothing upcoming"
                body="Estimates with proposed times and confirmed bookings will appear here."
              />
            ) : (
              <ul className="divide-y divide-line-subtle">
                {upcoming.map((u) => (
                  <li key={u.id}>
                    <Link
                      href={`/app/jobs/${u.id}`}
                      className="block px-4 py-3 hover:bg-ink-2 transition-colors"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium text-bone-100 truncate">
                          {u.name || "—"}
                        </span>
                        <StatusChip status={u.status} />
                      </div>
                      <div className="text-2xs text-bone-400 mt-0.5 truncate">
                        {u.service || "—"} · {u.address || "—"}
                      </div>
                      <div className="num text-2xs text-field-500 mt-1">
                        {fmtDate(u.start_datetime, tz)}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Fresh leads */}
          <section className="panel">
            <div className="flex items-center justify-between px-4 h-11 border-b border-line">
              <div className="flex items-center gap-2">
                <TrendingUp size={13} strokeWidth={2} className="text-status-lead" />
                <h2 className="text-sm font-semibold text-bone-100">Fresh leads</h2>
              </div>
              <Link
                href="/app/jobs?status=lead"
                className="text-2xs text-bone-400 hover:text-bone-50 flex items-center gap-1"
              >
                All leads <ArrowRight size={11} />
              </Link>
            </div>
            {leads.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="No new leads"
                body="New leads from calls and web forms will show up here."
              />
            ) : (
              <ul className="divide-y divide-line-subtle">
                {leads.map((l) => (
                  <li key={l.id}>
                    <Link
                      href={`/app/jobs/${l.id}`}
                      className="block px-4 py-3 hover:bg-ink-2 transition-colors"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium text-bone-100 truncate">
                          {l.name || "—"}
                        </span>
                        <span className="num text-2xs text-bone-400 shrink-0">
                          {fmtPhone(l.phone)}
                        </span>
                      </div>
                      <div className="text-2xs text-bone-400 mt-0.5 truncate">
                        {l.service || "—"}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Phone;
  title: string;
  body: string;
}) {
  return (
    <div className="px-6 py-10 text-center">
      <div className="w-10 h-10 mx-auto rounded-full bg-ink-2 border border-line-strong flex items-center justify-center mb-3">
        <Icon size={16} className="text-bone-400" />
      </div>
      <div className="text-sm font-medium text-bone-100">{title}</div>
      <p className="text-xs text-bone-400 mt-1 max-w-[32ch] mx-auto">{body}</p>
    </div>
  );
}
