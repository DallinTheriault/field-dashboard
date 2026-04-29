import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Users, Search } from "lucide-react";
import { ClickableTableRow } from "@/components/ui/clickable-table-row";
import { MobileContactCard } from "@/components/list-cards/mobile-contact-card";

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

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const supabase = await createClient();
  const { q } = await searchParams;

  let query = supabase
    .from("contacts")
    .select("id, name, phone, email, address, updated_at, created_at")
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (q) {
    query = query.or(
      `name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`,
    );
  }

  const { data: contacts, error } = await query;
  const rows = contacts ?? [];

  return (
    <div>
      <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <div className="label-eyebrow mb-1">Customers</div>
          <h1 className="text-2xl font-semibold text-bone-50 tracking-tight">
            Contacts
          </h1>
          <p className="text-sm text-bone-300 mt-1">
            {rows.length} {rows.length === 1 ? "contact" : "contacts"}
            {q && ` · matching "${q}"`}
          </p>
        </div>

        <form className="flex items-center gap-2">
          <div className="relative">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-bone-400 pointer-events-none"
            />
            <input
              type="text"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search name, phone, email…"
              className="!bg-ink-1 pl-7 h-8 w-64 text-xs"
            />
          </div>
          {q && (
            <Link href="/app/contacts" className="btn-ghost text-xs h-8">
              Clear
            </Link>
          )}
        </form>
      </div>

      {error && (
        <div className="panel border border-status-danger/30 p-4 mb-4">
          <div className="text-sm text-status-danger font-medium">
            Couldn&apos;t load contacts
          </div>
          <div className="text-xs text-bone-400 mt-1 font-mono">
            {error.message}
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="panel px-6 py-14 text-center">
          <div className="w-10 h-10 mx-auto rounded-full bg-ink-2 border border-line-strong flex items-center justify-center mb-3">
            <Users size={16} className="text-bone-400" strokeWidth={1.6} />
          </div>
          <p className="text-sm text-bone-100 font-medium mb-1">
            {q ? "No matching contacts" : "No contacts yet"}
          </p>
          <p className="text-xs text-bone-400">
            {q
              ? "Try clearing your filter."
              : "Contacts populate automatically as your assistant captures calls."}
          </p>
        </div>
      ) : (
        <>
          {/* Mobile: stacked cards */}
          <div className="panel divide-y divide-line-subtle md:hidden">
            {rows.map((c) => (
              <MobileContactCard key={c.id} contact={c} />
            ))}
          </div>

          {/* Desktop: table */}
          <div className="panel overflow-hidden hidden md:block">
            <div className="overflow-x-auto scroll-x-hint">
              <table className="table-pro">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>Address</th>
                    <th className="text-right">Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <ClickableTableRow
                      key={c.id}
                      href={`/app/contacts/${c.id}`}
                    >
                      <td className="text-bone-100 font-medium">
                        {c.name || "—"}
                      </td>
                      <td className="num text-xs text-bone-300">
                        {fmtPhone(c.phone)}
                      </td>
                      <td className="text-xs text-bone-300 max-w-[220px] truncate">
                        {c.email || "—"}
                      </td>
                      <td className="text-bone-300 max-w-[200px] truncate text-xs">
                        {c.address || "—"}
                      </td>
                      <td className="num text-xs text-bone-400 text-right">
                        {fmtDate(c.updated_at ?? c.created_at)}
                      </td>
                    </ClickableTableRow>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
