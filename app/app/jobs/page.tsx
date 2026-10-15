import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StatusChip } from "@/components/ui/status-chip";
import { ClickableTableRow } from "@/components/ui/clickable-table-row";
import { MobileJobCard } from "@/components/list-cards/mobile-job-card";
import { TagChipList } from "@/components/tags/tag-chip";
import { AddJobButton } from "./_components/add-job-button";
import { getTagsByJobIds, listTagsForClient } from "@/lib/tags/server";
import { Download } from "lucide-react";
import { getTenantTimezone } from "@/lib/dates";
import { getCurrentUserRole } from "@/lib/permissions/current-role";
import { JOB_LOCATION_SELECT, jobAddress } from "@/lib/jobs/address";
import { canViewSettings } from "@/lib/permissions/roles";
import { getTenantFeatureFlags } from "@/lib/features/flags";
import { BILLING_COLS, UNPAID, billingByJob, type JobBilling } from "@/lib/jobs/billing";
import { BillingChip } from "@/components/ui/billing-chip";

function fmtDate(d: string | null, tz: string): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { timeZone: tz,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; tag?: string; billing?: string }>;
}) {
  const supabase = await createClient();
  const { status, tag: tagIdParam, billing: billingParam } = await searchParams;

  // Identify tenant for tag list — the request-cached role lookup shares
  // its auth + membership round-trips with the layout and other pages.
  const [tz, session, flags] = await Promise.all([
    getTenantTimezone(),
    getCurrentUserRole(),
    getTenantFeatureFlags(),
  ]);
  const clientId = session?.clientId ?? null;
  // Billing state (v099) is money: owners and managers, estimator on.
  const money = flags.estimator && session !== null && canViewSettings(session.role);
  const billingFilter = money && (billingParam === "unpaid" || billingParam === "paid") ? billingParam : null;
  const billing: Map<number, JobBilling> = money
    ? billingByJob((await supabase.from("job_billing").select(BILLING_COLS)).data as Array<Record<string, unknown>> | null)
    : new Map();

  let baseQuery = supabase
    .from("jobs")
    .select(`id, name, phone, service, status, quoted_price, start_datetime, created_at, ${JOB_LOCATION_SELECT}`)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (status) baseQuery = baseQuery.eq("status", status);
  if (billingFilter) {
    const want = billingFilter === "paid" ? ["paid"] : UNPAID;
    const ids = [...billing].filter(([, b]) => b.state !== null && want.includes(b.state)).map(([id]) => id);
    baseQuery = ids.length ? baseQuery.in("id", ids) : baseQuery.eq("id", -1);
  }

  // Tag filtering: pass `tag` as the tag NAME from the URL, find its ID,
  // then query job_tags for jobs with that tag.
  if (tagIdParam && clientId) {
    const { data: tagRow } = await supabase
      .from("tags")
      .select("id")
      .eq("client_id", clientId)
      .eq("name", tagIdParam)
      .maybeSingle();
    if (tagRow) {
      const { data: jt } = await supabase
        .from("job_tags")
        .select("job_id")
        .eq("tag_id", (tagRow as { id: number }).id);
      const jobIds = (jt ?? []).map((r: { job_id: number }) => r.job_id);
      if (jobIds.length === 0) {
        // No matching jobs
        baseQuery = baseQuery.eq("id", -1);
      } else {
        baseQuery = baseQuery.in("id", jobIds);
      }
    } else {
      baseQuery = baseQuery.eq("id", -1);
    }
  }

  const { data: jobs } = await baseQuery;
  // Resolve each job's address from its property once, for both layouts.
  const rows = (jobs ?? []).map((j) => ({ ...j, address: jobAddress(j) }));

  // Bulk-fetch tags for visible jobs + the tag-filter list in one wave
  const [tagsByJob, allTags] = await Promise.all([
    getTagsByJobIds(rows.map((j) => j.id)),
    clientId ? listTagsForClient(clientId) : Promise.resolve([]),
  ]);

  return (
    <div>
      <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <div className="label-eyebrow mb-1">Jobs</div>
          <h1 className="text-2xl font-semibold text-bone-50 tracking-tight">
            {tagIdParam
              ? `Tagged: ${tagIdParam}`
              : status
                ? status.charAt(0).toUpperCase() + status.slice(1)
                : billingFilter === "unpaid"
                  ? "Unpaid jobs"
                  : billingFilter === "paid"
                    ? "Paid jobs"
                    : "All jobs"}
          </h1>
          <p className="text-sm text-bone-300 mt-1">
            {rows.length} {rows.length === 1 ? "job" : "jobs"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {money && (
            <nav aria-label="Billing filter" className="flex items-center rounded-sm border border-line overflow-hidden">
              {([
                [null, "All"],
                ["unpaid", "Unpaid"],
                ["paid", "Paid"],
              ] as const).map(([value, label]) => {
                const q = new URLSearchParams();
                if (status) q.set("status", status);
                if (tagIdParam) q.set("tag", tagIdParam);
                if (value) q.set("billing", value);
                const href = q.size ? `/app/jobs?${q}` : "/app/jobs";
                const on = billingFilter === value;
                return (
                  <Link
                    key={label}
                    href={href}
                    aria-current={on ? "page" : undefined}
                    className={`px-3 min-h-[36px] inline-flex items-center text-xs ${on ? "bg-field-500/15 text-field-400" : "text-bone-300 hover:bg-ink-3"}`}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>
          )}
          {allTags.length > 0 && (
            <details className="relative">
              <summary className="btn-secondary text-xs h-9 cursor-pointer list-none">
                Tag filter
                {tagIdParam && (
                  <span className="ml-1 px-1.5 py-0.5 rounded bg-field-500/20 text-field-400 text-2xs">
                    {tagIdParam}
                  </span>
                )}
              </summary>
              <div className="absolute z-20 right-0 top-full mt-1 min-w-[200px] max-h-72 overflow-y-auto rounded-md border border-line-strong bg-ink-2 shadow-lg py-1">
                <Link
                  href={status ? `/app/jobs?status=${status}` : "/app/jobs"}
                  className="block px-3 py-1.5 text-xs text-bone-400 hover:bg-ink-3"
                >
                  All tags
                </Link>
                {allTags.map((t) => (
                  <Link
                    key={t.id}
                    href={`/app/jobs?${status ? `status=${status}&` : ""}tag=${encodeURIComponent(t.name)}`}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-ink-3"
                  >
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: t.color_hex }}
                    />
                    <span className="text-bone-50">{t.name}</span>
                    <span className="ml-auto text-2xs text-bone-500 font-mono">
                      {t.use_count}
                    </span>
                  </Link>
                ))}
              </div>
            </details>
          )}
          {(status || tagIdParam || billingFilter) && (
            <Link href="/app/jobs" className="btn-ghost text-xs h-9">
              Clear filter
            </Link>
          )}
          <a
            href="/api/export/jobs"
            className="btn-ghost text-xs h-9"
            title="Download CSV"
          >
            <Download size={12} />
            Export
          </a>
          <AddJobButton />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="panel px-6 py-14 text-center">
          <p className="text-sm text-bone-100 font-medium mb-1">No jobs yet</p>
          <p className="text-xs text-bone-400 mb-4">
            Add your first job to start pricing work and invoicing it.
          </p>
          <div className="inline-flex">
            <AddJobButton />
          </div>
        </div>
      ) : (
        <>
          {/* Mobile: stacked cards */}
          <div className="panel divide-y divide-line-subtle md:hidden">
            {rows.map((j) => (
              <MobileJobCard
                key={j.id}
                job={j}
                tags={tagsByJob.get(j.id) ?? []}
                billing={billing.get(j.id)?.state ?? null}
              />
            ))}
          </div>

          {/* Desktop: table */}
          <div className="panel overflow-hidden hidden md:block">
            <div className="overflow-x-auto scroll-x-hint">
              <table className="table-pro">
                <thead>
                  <tr>
                    <th>Address</th>
                    <th>Customer</th>
                    <th>Service</th>
                    <th>Tags</th>
                    <th>Start</th>
                    <th>Status</th>
                    <th className="text-right">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((j) => {
                    const jobTags = tagsByJob.get(j.id) ?? [];
                    return (
                      <ClickableTableRow key={j.id} href={`/app/jobs/${j.id}`}>
                        <td className="text-bone-100 font-medium">
                          {j.address || "—"}
                        </td>
                        <td className="text-bone-300">{j.name || "—"}</td>
                        <td className="text-bone-300">{j.service || "—"}</td>
                        <td className="max-w-[200px]">
                          {jobTags.length > 0 ? (
                            <TagChipList tags={jobTags} maxVisible={3} size="sm" />
                          ) : (
                            <span className="text-xs text-bone-500">—</span>
                          )}
                        </td>
                        <td className="num text-xs text-bone-300">
                          {fmtDate(j.start_datetime, tz)}
                        </td>
                        <td>
                          <span className="inline-flex flex-wrap items-center gap-1.5">
                            <StatusChip status={j.status} />
                            <BillingChip state={billing.get(j.id)?.state} />
                          </span>
                        </td>
                        <td className="num text-xs text-bone-400 text-right">
                          {fmtDate(j.created_at, tz)}
                        </td>
                      </ClickableTableRow>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
