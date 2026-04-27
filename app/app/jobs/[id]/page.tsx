import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Briefcase, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatusChip } from "@/components/ui/status-chip";

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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

function fmtDollar(c: number | null): string {
  if (c == null) return "—";
  return `$${(c / 100).toFixed(2)}`;
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();
  const { id } = await params;

  const { data: job } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!job) notFound();

  const { data: calls } = await supabase
    .from("call_summaries")
    .select("id, caller_name, intent, outcome, duration_seconds, started_at")
    .eq("job_id", job.id)
    .order("started_at", { ascending: false });

  return (
    <div>
      <Link
        href="/app/jobs"
        className="inline-flex items-center gap-1.5 text-xs text-bone-400 hover:text-bone-50 mb-4"
      >
        <ArrowLeft size={12} />
        Back to jobs
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Briefcase size={14} className="text-salmon-500" />
            <span className="label-eyebrow">Job #{job.id}</span>
          </div>
          <h1 className="text-2xl font-semibold text-bone-50 tracking-tight">
            {job.name || "—"}
          </h1>
          <p className="text-sm text-bone-300 mt-1">
            {job.service || "—"} · {job.address || "—"}
          </p>
        </div>
        <StatusChip status={job.status} className="shrink-0" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <section className="lg:col-span-3 space-y-5">
          <div className="panel">
            <div className="px-4 h-11 flex items-center border-b border-line">
              <h2 className="text-sm font-semibold text-bone-100">Details</h2>
            </div>
            <dl className="divide-y divide-line-subtle">
              <Row label="Customer" value={job.name ?? "—"} />
              <Row label="Phone" value={fmtPhone(job.phone)} mono />
              <Row label="Email" value={job.email ?? "—"} />
              <Row label="Service" value={job.service ?? "—"} />
              <Row label="Address" value={job.address ?? "—"} />
              <Row label="Scope" value={job.scope ?? "—"} />
              <Row label="Quoted" value={fmtDollar(job.quoted_price)} />
              <Row label="Source" value={job.source ?? "—"} />
              <Row label="SMS consent" value={job.sms_consent ?? "—"} />
            </dl>
          </div>

          {job.notes && (
            <div className="panel">
              <div className="px-4 h-11 flex items-center border-b border-line">
                <h2 className="text-sm font-semibold text-bone-100">Notes</h2>
              </div>
              <div className="px-4 py-4">
                <p className="text-sm text-bone-100 whitespace-pre-wrap">
                  {job.notes}
                </p>
              </div>
            </div>
          )}
        </section>

        <aside className="lg:col-span-2 space-y-3">
          <div className="panel p-4">
            <div className="label-eyebrow mb-3">Schedule</div>
            <dl className="space-y-2 text-xs">
              <Mini label="Start" value={fmtDate(job.start_datetime)} />
              <Mini label="End" value={fmtDate(job.end_datetime)} />
              <Mini label="Created" value={fmtDate(job.created_at)} />
              <Mini label="Updated" value={fmtDate(job.updated_at)} />
            </dl>
          </div>

          {calls && calls.length > 0 && (
            <div className="panel">
              <div className="px-4 h-11 flex items-center justify-between border-b border-line">
                <div className="flex items-center gap-2">
                  <Phone size={13} className="text-bone-400" />
                  <h2 className="text-sm font-semibold text-bone-100">
                    Linked calls
                  </h2>
                </div>
                <span className="text-2xs text-bone-400">{calls.length}</span>
              </div>
              <ul className="divide-y divide-line-subtle">
                {calls.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/app/calls/${c.id}`}
                      className="block px-4 py-3 hover:bg-ink-2"
                    >
                      <div className="text-sm text-bone-100 truncate">
                        {c.caller_name || "Unknown"}
                      </div>
                      <div className="text-2xs text-bone-400 mt-0.5">
                        {c.intent?.replace(/_/g, " ") ?? "—"}
                        {c.outcome && ` · ${c.outcome.replace(/_/g, " ")}`}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="px-4 py-2.5 grid grid-cols-3 gap-3 items-baseline">
      <dt className="text-xs text-bone-400">{label}</dt>
      <dd
        className={`col-span-2 text-xs text-bone-100 ${mono ? "font-mono" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-bone-400">{label}</dt>
      <dd className="text-bone-100 num text-right">{value}</dd>
    </div>
  );
}
