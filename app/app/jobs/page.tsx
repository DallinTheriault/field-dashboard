import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StatusChip } from "@/components/ui/status-chip";
import { ClickableTableRow } from "@/components/ui/clickable-table-row";
import { AddJobButton } from "./_components/add-job-button";

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
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
  searchParams: Promise<{ status?: string }>;
}) {
  const supabase = await createClient();
  const { status } = await searchParams;

  let query = supabase
    .from("jobs")
    .select("id, name, phone, address, service, status, quoted_price, start_datetime, created_at")
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const { data: jobs } = await query;
  const rows = jobs ?? [];

  return (
    <div>
      <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <div className="label-eyebrow mb-1">Jobs</div>
          <h1 className="text-2xl font-semibold text-bone-50 tracking-tight">
            {status ? status.charAt(0).toUpperCase() + status.slice(1) : "All jobs"}
          </h1>
          <p className="text-sm text-bone-300 mt-1">
            {rows.length} {rows.length === 1 ? "job" : "jobs"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status && (
            <Link href="/app/jobs" className="btn-ghost text-xs h-9">
              Clear filter
            </Link>
          )}
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
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto scroll-x-hint">
            <table className="table-pro">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Service</th>
                  <th>Address</th>
                  <th>Start</th>
                  <th>Status</th>
                  <th className="text-right">Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((j) => (
                  <ClickableTableRow key={j.id} href={`/app/jobs/${j.id}`}>
                    <td className="text-bone-100 font-medium">
                      {j.name || "—"}
                    </td>
                    <td className="num text-xs text-bone-300">
                      {fmtPhone(j.phone)}
                    </td>
                    <td className="text-bone-300">{j.service || "—"}</td>
                    <td className="text-bone-300 max-w-[200px] truncate">
                      {j.address || "—"}
                    </td>
                    <td className="num text-xs text-bone-300">
                      {fmtDate(j.start_datetime)}
                    </td>
                    <td>
                      <StatusChip status={j.status} />
                    </td>
                    <td className="num text-xs text-bone-400 text-right">
                      {fmtDate(j.created_at)}
                    </td>
                  </ClickableTableRow>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
