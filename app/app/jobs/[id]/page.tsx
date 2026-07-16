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
  Calculator,
  DollarSign,
  FileText,
  User,
  Activity,
} from "lucide-react";
import { EstimateStatusChip } from "../../estimator/estimate-status";
import { JobActuals } from "../../estimator/job-actuals";
import { JobTasks } from "./job-tasks";
import { getCurrentUserRole } from "@/lib/permissions/current-role";
import { canViewSettings } from "@/lib/permissions/roles";
import { TextAndCopyButtons } from "@/components/ui/text-copy-buttons";
import { TagChipList } from "@/components/tags/tag-chip";
import { InlineAddTagButton } from "@/components/tags/inline-add-tag";
import { AssignmentChip } from "@/components/assignment/assignment-select";
import { ActivityTimeline } from "@/components/activity/activity-timeline";
import { InlineStatusEdit } from "@/components/ui/inline-status-edit";
import { createClient } from "@/lib/supabase/server";
import { getTeamMembers } from "@/lib/team/members";
import { getActivityTimeline } from "@/lib/timeline/fetch";
import { getJobTags, listTagsForClient } from "@/lib/tags/server";
import { getTenantTimezone } from "@/lib/dates";
import { getTenantFeatureFlags } from "@/lib/features/flags";

function fmtDate(d: string | null, tz: string): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", { timeZone: tz,
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

  // Batch 1 — everything that doesn't need the job row. tz + flags share
  // the layout's tenant-context fetch; role shares the layout's auth.
  // This page's queries used to run as a 9-deep serial chain (~0.4-0.9s
  // of document render); the same reads now resolve in three waves.
  const [tz, flags, session, { data: job }] = await Promise.all([
    getTenantTimezone(),
    getTenantFeatureFlags(),
    getCurrentUserRole(),
    supabase.from("jobs").select("*").eq("id", id).maybeSingle(),
  ]);

  if (!job) notFound();

  // Estimator integration — only when the tenant's flag is on. The actuals
  // card exposes hours (pricing internals), so it's owner/manager-only.
  const estimatorOn = flags.estimator;
  const canSeeInternals = session ? canViewSettings(session.role) : false;

  // Batch 2 — every read keyed off the job row, in one wave. Tasks are the
  // scoping list + punch list: visible to every member; edits are
  // owner/manager (RLS enforces; the UI hides controls for read-only
  // roles). Uninvoiced extras are the actual money leak (architect Q1
  // refinement): materials bought as "extra" that never made it onto an
  // invoice.
  const [
    teamMembers,
    events,
    jobTags,
    allTags,
    { data: jobEstimates },
    { data: looseExtras },
    { data: taskRows },
  ] = await Promise.all([
    getTeamMembers(job.client_id),
    getActivityTimeline("job", Number(job.id)),
    getJobTags(Number(job.id)),
    listTagsForClient(job.client_id),
    estimatorOn
      ? supabase
          .from("estimates")
          .select(
            "id, version, status, computed_price, manual_override_price, estimated_at",
          )
          .eq("job_id", job.id)
          .order("version", { ascending: false })
      : Promise.resolve({ data: null }),
    estimatorOn
      ? supabase
          .from("expenses")
          .select("id")
          .eq("job_id", job.id)
          .eq("assignment", "job_extra")
          .is("invoiced_on", null)
      : Promise.resolve({ data: null }),
    supabase
      .from("tasks")
      .select("id, title, note, status, sort_order, task_photos(id, caption)")
      .eq("job_id", job.id)
      .order("sort_order")
      .order("id"),
  ]);

  const assignedMember = job.assigned_user_id
    ? teamMembers.find((m) => m.user_id === job.assigned_user_id) ?? null
    : null;

  const uninvoicedExtras = (looseExtras ?? []).length;

  const taskIds = (taskRows ?? []).map((t) => t.id);
  const { data: linkRows } = taskIds.length
    ? await supabase
        .from("estimate_line_items")
        .select("task_id")
        .in("task_id", taskIds)
    : { data: [] as Array<{ task_id: number | null }> };
  const linkCounts = new Map<number, number>();
  for (const r of linkRows ?? []) {
    if (r.task_id !== null) {
      linkCounts.set(r.task_id, (linkCounts.get(r.task_id) ?? 0) + 1);
    }
  }
  const jobTasks = (taskRows ?? []).map((t) => ({
    id: t.id as number,
    title: t.title as string,
    note: (t.note as string | null) ?? null,
    status: t.status as "open" | "done",
    sort_order: t.sort_order as number,
    photos: ((t.task_photos as unknown as Array<{ id: number; caption: string | null }>) ?? [])
      .sort((a, b) => a.id - b.id),
    linkedLines: linkCounts.get(t.id) ?? 0,
  }));

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

      {/* Tags row — directly under the name so they're clearly the job's,
          not the assignee's. Includes the inline +tag quick-add button. */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {jobTags.length > 0 && <TagChipList tags={jobTags} maxVisible={10} />}
        <InlineAddTagButton
          entityType="job"
          entityId={Number(job.id)}
          clientId={job.client_id}
          allTags={allTags}
          attachedTagIds={jobTags.map((t) => t.id)}
        />
      </div>

      {/* Status + assignment + service meta, on their own row */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <InlineStatusEdit jobId={job.id} currentStatus={job.status ?? "lead"} />
        <AssignmentChip member={assignedMember} />
        {job.service && (
          <span className="text-2xs text-bone-400">
            {job.service}
            {job.scope && ` · ${job.scope}`}
          </span>
        )}
      </div>

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
        {estimatorOn && (
          <Link
            href={`/app/estimator/new?job=${job.id}`}
            className="btn-secondary text-xs h-8"
          >
            <Calculator size={12} />
            New estimate
          </Link>
        )}
      </div>

      <JobTasks
        jobId={Number(job.id)}
        clientId={job.client_id}
        tasks={jobTasks}
        canWrite={canSeeInternals}
      />

      {estimatorOn && canSeeInternals && uninvoicedExtras > 0 && (
        <div className="panel px-4 py-2.5 mb-5 border-status-danger/40 flex items-center gap-2 text-sm">
          <span className="chip border-status-danger/40 text-status-danger bg-status-danger/10 normal-case tracking-normal shrink-0">
            {uninvoicedExtras} extra{uninvoicedExtras === 1 ? "" : "s"} not on any invoice
          </span>
          <span className="text-2xs text-bone-400">
            billable materials waiting — they ride along when an invoice is
            created, or hit &quot;Refresh extras&quot; on a draft.
          </span>
        </div>
      )}

      {estimatorOn && canSeeInternals && (
        <JobActuals clientId={job.client_id} jobId={Number(job.id)} />
      )}

      {estimatorOn && (jobEstimates ?? []).length > 0 && (
        <div className="panel px-4 py-3 mb-5">
          <div className="label-eyebrow mb-2">Estimates</div>
          <ul className="space-y-1.5">
            {(jobEstimates ?? []).map((e) => {
              const charge = Number(e.manual_override_price ?? e.computed_price ?? 0);
              return (
                <li key={e.id}>
                  <Link
                    href={`/app/estimator/${e.id}`}
                    className="flex items-center gap-2.5 text-sm hover:bg-ink-2 rounded-sm px-2 py-1.5 -mx-2 transition-colors"
                  >
                    <span className="font-mono text-2xs text-bone-400">
                      v{e.version}
                    </span>
                    <EstimateStatusChip status={e.status} />
                    <span className="num ml-auto text-bone-100">
                      ${charge.toFixed(0)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

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
                value={fmtDate(job.start_datetime, tz)}
              />
              <Field label="End" value={fmtDate(job.end_datetime, tz)} />
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
              <Mini label="Created" value={fmtDate(job.created_at, tz)} />
              <Mini label="Updated" value={fmtDate(job.updated_at, tz)} />
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
