import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTagsByJobIds } from "@/lib/tags/server";

/**
 * GET /api/export/jobs
 *
 * Streams a CSV of all (non-archived) jobs in the caller's tenant.
 */
export async function GET() {
  const supabase = await createClient();

  const { data: jobs, error } = await supabase
    .from("jobs")
    .select(
      "id, name, phone, email, address, service, scope, quoted_price, start_datetime, end_datetime, status, notes, created_at, updated_at",
    )
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = jobs ?? [];
  const tagsMap = await getTagsByJobIds(rows.map((j) => j.id));

  const header = [
    "id",
    "name",
    "phone",
    "email",
    "address",
    "service",
    "scope",
    "quoted_price_cents",
    "start_datetime",
    "end_datetime",
    "status",
    "tags",
    "notes",
    "created_at",
    "updated_at",
  ];

  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines: string[] = [header.join(",")];
  for (const j of rows) {
    const tags = (tagsMap.get(j.id) ?? []).map((t) => t.name).join("; ");
    lines.push(
      [
        j.id,
        j.name,
        j.phone,
        j.email,
        j.address,
        j.service,
        j.scope,
        j.quoted_price,
        j.start_datetime,
        j.end_datetime,
        j.status,
        tags,
        j.notes,
        j.created_at,
        j.updated_at,
      ]
        .map(escape)
        .join(","),
    );
  }

  const csv = lines.join("\n");
  const filename = `jobs-${new Date().toISOString().split("T")[0]}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
