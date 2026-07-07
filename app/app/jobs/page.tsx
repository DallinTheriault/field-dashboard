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

function fmtDate(d: string | null, tz: string): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { timeZone: tz,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtPhone(phone: string | null): string {
  if (!phone) return "—";
  const d = phone.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) {
    return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) {
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return phone;
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; tag?: string }>;
}) {
  const tz = await getTenantTimezone();
  const supabase = await createClient();
  const { status, tag: tagIdParam } = await searchParams;

  // Identify tenant for tag list
  const { data: { user } } = await supabase.auth.getUser();
  const { data: clientUser } = await supabase
    .from("client_users")
    .select("client_id")
    .eq("auth_user_id", user?.id ?? "")
    .limit(1)
    .maybeSingle();
  const clientId = (clientUser as { client_id?: number } | null)?.client_id ?? null;

  let baseQuery = supabase
    .from("jobs")
    .select("id, name, phone, address, service, status, quoted_price, start_datetime, created_at")
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (status) baseQuery = baseQuery.eq("status", status);

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
  const rows = jobs ?? [];

  // Bulk-fetch tags for visible jobs in one round-trip
  const tagsByJob = await getTagsByJobIds(rows.map((j) => j.id));
  const allTags = clientId ? await listTagsForClient(clientId) : [];

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
                : "All jobs"}
          </h1>
          <p className="text-sm text-bone-300 mt-1">
            {rows.length} {rows.length === 1 ? "job" : "jobs"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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
          {(status || tagIdParam) && (
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
            As your assistant captures calls, jobs will appear here. Or add one
            manually now.
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
              />
            ))}
          </div>

          {/* Desktop: table */}
          <div className="panel overflow-hidden hidden md:block">
            <div className="overflow-x-auto scroll-x-hint">
              <table className="table-pro">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Phone</th>
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
                          {j.name || "—"}
                        </td>
                        <td className="num text-xs text-bone-300">
                          {fmtPhone(j.phone)}
                        </td>
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
                          <StatusChip status={j.status} />
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
