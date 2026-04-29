import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Briefcase, Phone, Mail, MapPin } from "lucide-react";
import { TextAndCopyButtons } from "@/components/ui/text-copy-buttons";
import { createClient } from "@/lib/supabase/server";
import { JobEditForm } from "./form";

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
            <Briefcase size={14} className="text-field-500" />
            <span className="label-eyebrow">Job #{job.id}</span>
          </div>
          <h1 className="text-2xl font-semibold text-bone-50 tracking-tight">
            {job.contact_id ? (
              <Link
                href={`/app/contacts/${job.contact_id}`}
                className="hover:text-field-500"
              >
                {job.name || "—"}
              </Link>
            ) : (
              job.name || "—"
            )}
          </h1>
          <p className="text-sm text-bone-300 mt-1">
            {job.service || "—"} · {job.address || "—"}
          </p>
        </div>
      </div>

      {/* Quick contact actions */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {job.phone && (
          <>
            <a href={`tel:${job.phone}`} className="btn-secondary text-xs h-8">
              <Phone size={12} />
              Call {fmtPhone(job.phone)}
            </a>
            <TextAndCopyButtons
              phone={job.phone}
              contactId={job.contact_id ?? null}
              displayPhone={fmtPhone(job.phone)}
            />
          </>
        )}
        {job.email && (
          <a href={`mailto:${job.email}`} className="btn-secondary text-xs h-8">
            <Mail size={12} />
            Email
          </a>
        )}
        {job.address && (
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(job.address)}`}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary text-xs h-8"
          >
            <MapPin size={12} />
            Map
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <section className="lg:col-span-3">
          <JobEditForm
            job={{
              id: job.id,
              name: job.name ?? "",
              phone: job.phone ?? "",
              email: job.email ?? "",
              address: job.address ?? "",
              service: job.service ?? "",
              scope: job.scope ?? "",
              quoted_price: job.quoted_price ?? null,
              start_datetime: job.start_datetime ?? null,
              end_datetime: job.end_datetime ?? null,
              status: job.status ?? "lead",
              notes: job.notes ?? "",
            }}
          />
        </section>

        <aside className="lg:col-span-2 space-y-3">
          <div className="panel p-4">
            <div className="label-eyebrow mb-3">Timestamps</div>
            <dl className="space-y-2 text-xs">
              <Mini label="Created" value={fmtDate(job.created_at)} />
              <Mini label="Updated" value={fmtDate(job.updated_at)} />
              {job.source && <Mini label="Source" value={job.source} />}
              {job.sms_consent !== null && job.sms_consent !== undefined && (
                <Mini label="SMS consent" value={String(job.sms_consent)} />
              )}
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

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-bone-400">{label}</dt>
      <dd className="text-bone-100 num text-right">{value}</dd>
    </div>
  );
}
