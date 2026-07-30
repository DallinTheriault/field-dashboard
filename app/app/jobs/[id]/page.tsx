import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Briefcase,
  Phone,
  Car,
  ChevronRight,
  FileText,
  Activity,
} from "lucide-react";
import { EstimateStatusChip } from "../../estimator/estimate-status";
import { JobActuals } from "../../estimator/job-actuals";
import { JobExpenseCapture } from "./job-expense-capture";
import { JobDetailsSheet } from "./job-details-sheet";
import { JobOptionsMenu } from "./job-options-menu";
import { JobTasks } from "./job-tasks";
import { getCurrentUserRole } from "@/lib/permissions/current-role";
import { canViewSettings } from "@/lib/permissions/roles";
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
    { data: jobExpenseRows },
    { data: mileageRows },
    { data: mileageSettings },
    { data: jobProperty },
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
    // Job-attached expense items for the capture card's read-only list.
    // All roles may read (RLS select is tenant-wide); shows description /
    // cost / assignment only — no totals, hours, variance, or margin.
    estimatorOn
      ? supabase
          .from("expenses")
          .select("id, description, amount, assignment")
          .eq("job_id", job.id)
          .order("id", { ascending: false })
      : Promise.resolve({ data: null }),
    // Mileage context for the trip proposal + the read-only trips line.
    // Fetched here so JobActuals never round-trips from the client.
    estimatorOn && canSeeInternals
      ? supabase.from("mileage_entries").select("miles").eq("job_id", job.id)
      : Promise.resolve({ data: null }),
    estimatorOn && canSeeInternals
      ? supabase.from("pricing_settings").select("mileage_base_address").maybeSingle()
      : Promise.resolve({ data: null }),
    // Not role-gated: the property address is customer info shown to every
    // role in the header block, not a pricing internal.
    job.property_id
      ? supabase
          .from("properties")
          .select("id, address, unit, miles_from_base")
          .eq("id", job.property_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Trips logged against this job — a read-only signal (§6.2). Deliberately
  // NOT part of job costing math this pass.
  const tripCount = (mileageRows ?? []).length;
  const tripMiles =
    Math.round(
      (mileageRows ?? []).reduce((s, m) => s + Number(m.miles ?? 0), 0) * 10,
    ) / 10;

  const propertyAddress = jobProperty
    ? [jobProperty.address, jobProperty.unit ? `Unit ${jobProperty.unit}` : null]
        .filter(Boolean)
        .join(", ")
    : null;
  const mileageContext = canSeeInternals && estimatorOn
    ? {
        baseAddress:
          (mileageSettings?.mileage_base_address as string | null) ?? null,
        // Legacy jobs have no property — fall back to the job's inline address.
        destination: propertyAddress ?? (job.address as string | null) ?? null,
        cachedMiles:
          jobProperty?.miles_from_base === null ||
          jobProperty?.miles_from_base === undefined
            ? null
            : Number(jobProperty.miles_from_base),
        propertyId: (jobProperty?.id as number | undefined) ?? null,
        purpose:
          [job.service, job.scope].filter(Boolean).join(" — ") ||
          `Job ${job.job_number ?? job.id}`,
      }
    : undefined;

  const jobExpenseItems = (jobExpenseRows ?? []).map((e) => ({
    id: e.id as number,
    description: e.description as string,
    amount: Number(e.amount),
    assignment: (e.assignment as string) ?? "unassigned",
  }));

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

      {/* Header — no card chrome: heading, then content. Job number sits with
          the status and assignment pills; the phone and address stay tappable
          here because they're the two most frequent actions. */}
      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <Briefcase size={13} className="text-field-500 shrink-0" />
        <span className="label-eyebrow">{job.job_number ?? `Job #${job.id}`}</span>
        <InlineStatusEdit jobId={job.id} currentStatus={job.status ?? "lead"} />
        <AssignmentChip member={assignedMember} />
      </div>

      <h1 className="text-2xl font-semibold text-bone-50 tracking-tight break-words">
        {job.contact_id ? (
          <Link href={`/app/contacts/${job.contact_id}`} className="hover:text-field-500">
            {job.name || "—"}
          </Link>
        ) : (
          job.name || "—"
        )}
      </h1>

      <div className="mt-1 space-y-0.5">
        {job.phone && (
          <div>
            <a href={`tel:${job.phone}`} className="text-sm text-bone-300 hover:text-field-400 num">
              {fmtPhone(job.phone)}
            </a>
          </div>
        )}
        {(propertyAddress ?? job.address) && (
          <div>
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(propertyAddress ?? job.address ?? "")}`}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-bone-300 hover:text-field-400 break-words"
            >
              {propertyAddress ?? job.address}
            </a>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-2.5 mb-5">
        <JobDetailsSheet
          service={job.service ?? null}
          scope={job.scope ?? null}
          quotedPrice={fmtPrice(job.quoted_price)}
          start={fmtDate(job.start_datetime, tz)}
          end={fmtDate(job.end_datetime, tz)}
        />
        {jobTags.length > 0 && <TagChipList tags={jobTags} maxVisible={10} />}
        <InlineAddTagButton
          entityType="job"
          entityId={Number(job.id)}
          clientId={job.client_id}
          allTags={allTags}
          attachedTagIds={jobTags.map((t) => t.id)}
        />
        <div className="ml-auto">
          <JobOptionsMenu
            jobId={Number(job.id)}
            phone={job.phone ?? null}
            displayPhone={fmtPhone(job.phone)}
            email={job.email ?? null}
            address={propertyAddress ?? job.address ?? null}
            contactId={job.contact_id ?? null}
            showNewEstimate={estimatorOn}
          />
        </div>
      </div>

      {/* Job-level expense capture — all roles (members included). Shows no
          margin/hours/variance; those stay in JobActuals (owner/manager). */}
      {estimatorOn && session && (
        <JobExpenseCapture
          jobId={Number(job.id)}
          role={session.role}
          receiptAiEnabled={flags.receiptAi}
          items={jobExpenseItems}
        />
      )}

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
        <>
          <JobActuals
            clientId={job.client_id}
            jobId={Number(job.id)}
            mileage={mileageContext}
          />
          {tripCount > 0 && (
            <div className="panel px-4 py-2.5 mb-5 flex items-center gap-2 text-2xs text-bone-400">
              <Car size={12} className="text-bone-500" />
              <span>
                <span className="num text-bone-100">{tripCount}</span> trip
                {tripCount === 1 ? "" : "s"} logged ·{" "}
                <span className="num text-bone-100">{tripMiles}</span> miles
              </span>
              <Link
                href="/app/estimator/mileage"
                prefetch={false}
                className="ml-auto text-field-400 hover:text-field-300"
              >
                Mileage log
              </Link>
            </div>
          )}
        </>
      )}

      <JobTasks
        jobId={Number(job.id)}
        clientId={job.client_id}
        tasks={jobTasks}
        canWrite={canSeeInternals}
      />

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

      {job.notes && (
        <div className="panel mb-5">
          <div className="px-4 h-11 flex items-center gap-2 border-b border-line">
            <FileText size={13} className="text-bone-400" />
            <h2 className="text-sm font-semibold text-bone-100">Notes</h2>
          </div>
          <div className="px-4 py-3 text-sm text-bone-100 leading-relaxed whitespace-pre-wrap">
            {job.notes}
          </div>
        </div>
      )}

      {/* Rarely-needed detail, collapsed by default (§6.1). Native <details>
          keeps this zero-JS and accessible; state need not persist. */}
      <div className="space-y-2">
        <Disclosure label="Activity" count={events.length}>
          <div className="px-4 py-3">
            <ActivityTimeline events={events} members={teamMembers} />
          </div>
        </Disclosure>

        <Disclosure label="Timestamps">
          <dl className="px-4 py-3 space-y-2 text-xs">
            <Mini label="Created" value={fmtDate(job.created_at, tz)} />
            <Mini label="Updated" value={fmtDate(job.updated_at, tz)} />
            {job.source && <Mini label="Source" value={job.source} />}
          </dl>
        </Disclosure>
      </div>
    </div>
  );
}

/** Closed-by-default detail section. Native <details> — no client JS. */
function Disclosure({
  label,
  count,
  children,
}: {
  label: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <details className="panel group">
      <summary className="px-4 h-11 flex items-center gap-2 cursor-pointer list-none select-none">
        <ChevronRight
          size={13}
          className="text-bone-400 transition-transform group-open:rotate-90"
        />
        <h2 className="text-sm font-semibold text-bone-100">{label}</h2>
        {count !== undefined && (
          <span className="text-2xs text-bone-400 ml-auto">{count}</span>
        )}
      </summary>
      <div className="border-t border-line">{children}</div>
    </details>
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
