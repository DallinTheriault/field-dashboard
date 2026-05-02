import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTagsByContactIds } from "@/lib/tags/server";

/**
 * GET /api/export/contacts
 *
 * Streams a CSV of all (non-archived) contacts in the caller's tenant.
 * RLS enforces tenant scoping — we don't filter by client_id ourselves,
 * the database refuses to return other tenants' rows.
 */
export async function GET() {
  const supabase = await createClient();

  const { data: contacts, error } = await supabase
    .from("contacts")
    .select(
      "id, name, phone, email, address, notes, created_at, updated_at",
    )
    .is("archived_at", null)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = contacts ?? [];
  const tagsMap = await getTagsByContactIds(rows.map((c) => c.id));

  const header = [
    "id",
    "name",
    "phone",
    "email",
    "address",
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
  for (const c of rows) {
    const tags = (tagsMap.get(c.id) ?? []).map((t) => t.name).join("; ");
    lines.push(
      [
        c.id,
        c.name,
        c.phone,
        c.email,
        c.address,
        tags,
        c.notes,
        c.created_at,
        c.updated_at,
      ]
        .map(escape)
        .join(","),
    );
  }

  const csv = lines.join("\n");
  const filename = `contacts-${new Date().toISOString().split("T")[0]}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
