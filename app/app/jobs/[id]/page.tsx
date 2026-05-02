import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Briefcase,
  Phone,
  Mail,
  MapPin,
  Pencil,
  Calendar,
  DollarSign,
  FileText,
  User,
  Activity,
} from "lucide-react";
import { TextAndCopyButtons } from "@/components/ui/text-copy-buttons";
import { TagChipList } from "@/components/tags/tag-chip";
import { AssignmentChip } from "@/components/assignment/assignment-select";
import { ActivityTimeline } from "@/components/activity/activity-timeline";
import { InlineStatusEdit } from "@/components/ui/inline-status-edit";
import { createClient } from "@/lib/supabase/server";
import { getTeamMembers } from "@/lib/team/members";
import { getActivityTimeline } from "@/lib/timeline/fetch";
import { getJobTags } from "@/lib/tags/server";

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

function fmtPrice(cents: number | null): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
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

  const [teamMembers, events, jobTags] = await Promise.all([
    getTeamMembers(job.client_id),
    getActivityTimeline("job", Number(job.id)),
    getJobTags(Number(job.id)),
  ]);

  const assignedMember = job.assigned_user_id
    ? teamMembers.find((m) => m.user_id === job.assigned_user_id) ?? null
    : null;

  return (
    <div>
      <Link
        href="/app/jobs"
        className="inline-flex items-center gap-1.5 text-xs text-bone-400 hover:text-bone-50 mb-4"
      >
        <ArrowLeft size={12} />
        Back to jobs
      </Link>

      <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Briefcase size={14} className="text-field-500" />
            <span className="label-eyebrow">Job #{job.id}</span>
          </div>
          <h1 className="text-2xl font-semibold text-bone-50 tracking-tight break-words">
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
        </div>
        <Link
          href={`/app/jobs/${job.id}/edit`}
          className="btn-secondary text-xs h-9 shrink-0"
        >
          <Pencil size={12} />
          Edit
        </Link>
      </div>

      {/* Inline-editable status + assignment + meta */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <InlineStatusEdit jobId={job.id} currentStatus={job.status ?? "lead"} />
        <AssignmentChip member={assignedMember} />
        {job.service && (
          <span className="text-2xs text-bone-400">
            {job.service}
            {job.scope && ` · ${job.scope}`}
          </span>
        )}
      </div>

      {/* Tag chips */}
      {jobTags.length > 0 && (
        <div className="mb-5">
          <TagChipList tags={jobTags} maxVisible={10} />
        </div>
      )}

      {/* Quick contact actions */}
      <div className="flex flex-wrap items-center gap-1.5 mb-6">
        {job.phone && (
          <>
            <a href={`tel:${job.phone}`} className="btn-secondary text-xs h-8">
              <Phone size={12} />
              Call
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
        <section className="lg:col-span-3 space-y-3">
          <div className="panel">
            <div className="px-4 h-11 flex items-center border-b border-line">
              <h2 className="text-sm font-semibold text-bone-100">Customer</h2>
            </div>
            <dl className="px-4 py-3 divide-y divide-line-subtle">
              <Field icon={User} label="Name" value={job.name || "—"} />
              <Field
                icon={Phone}
                label="Phone"
                value={fmtPhone(job.phone)}
                mono
              />
              <Field icon={Mail} label="Email" value={job.email || "—"} />
              <Field
                icon={MapPin}
                label="Address"
                value={job.address || "—"}
              />
            </dl>
          </div>

          <div className="panel">
            <div className="px-4 h-11 flex items-center border-b border-line">
              <h2 className="text-sm font-semibold text-bone-100">Job</h2>
            </div>
            <dl className="px-4 py-3 divide-y divide-line-subtle">
              <Field
                icon={Briefcase}
                label="Service"
                value={job.service || "—"}
              />
              <Field label="Scope" value={job.scope || "—"} />
              <Field
                icon={DollarSign}
                label="Quoted price"
                value={fmtPrice(job.quoted_price)}
                mono
              />
              <Field
                icon={Calendar}
                label="Start"
                value={fmtDate(job.start_datetime)}
              />
              <Field label="End" value={fmtDate(job.end_datetime)} />
            </dl>
          </div>

          {job.notes && (
            <div className="panel">
              <div className="px-4 h-11 flex items-center gap-2 border-b border-line">
                <FileText size={13} className="text-bone-400" />
                <h2 className="text-sm font-semibold text-bone-100">Notes</h2>
              </div>
              <div className="px-4 py-3 text-sm text-bone-100 leading-relaxed whitespace-pre-wrap">
                {job.notes}
              </div>
            </div>
          )}
        </section>

        <aside className="lg:col-span-2 space-y-3">
          <div className="panel">
            <div className="px-4 h-11 flex items-center justify-between border-b border-line">
              <div className="flex items-center gap-2">
                <Activity size={13} className="text-bone-400" />
                <h2 className="text-sm font-semibold text-bone-100">Activity</h2>
              </div>
              <span className="text-2xs text-bone-400">{events.length}</span>
            </div>
            <div className="px-4 py-3">
              <ActivityTimeline events={events} members={teamMembers} />
            </div>
          </div>

          <div className="panel p-4">
            <div className="label-eyebrow mb-3">Timestamps</div>
            <dl className="space-y-2 text-xs">
              <Mini label="Created" value={fmtDate(job.created_at)} />
              <Mini label="Updated" value={fmtDate(job.updated_at)} />
              {job.source && <Mini label="Source" value={job.source} />}
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  mono = false,
}: {
  icon?: typeof Phone;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
      <div className="w-24 sm:w-28 shrink-0 flex items-center gap-1.5 text-2xs text-bone-400 pt-0.5">
        {Icon && <Icon size={11} className="shrink-0" />}
        <span className="truncate">{label}</span>
      </div>
      <div
        className={`flex-1 min-w-0 text-sm text-bone-100 break-words ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
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
