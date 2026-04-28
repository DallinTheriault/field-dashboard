import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { ChevronRight, Users } from "lucide-react";
import { cn } from "@/lib/cn";

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function AdminClientsPage() {
  const supabase = createAdminClient();
  const { data: clients, error } = await supabase
    .from("Clients")
    .select("id, business_name, business_phone, owner_email, intake_mode, is_active, created_at")
    .neq("id", 6) // hide platform sentinel row
    .order("id", { ascending: true });

  return (
    <div>
      <div className="flex items-end justify-between mb-6 gap-4">
        <div>
          <div className="label-eyebrow mb-1">Tenants</div>
          <h1 className="text-2xl font-semibold text-bone-50 tracking-tight">
            Clients
          </h1>
          <p className="text-sm text-bone-300 mt-1">
            {clients?.length ?? 0} {clients?.length === 1 ? "tenant" : "tenants"}
          </p>
        </div>
      </div>

      {error && (
        <div className="panel border border-status-danger/30 p-4 mb-4">
          <div className="text-sm text-status-danger font-medium">
            Couldn&apos;t load clients
          </div>
          <div className="text-xs text-bone-400 mt-1 font-mono">
            {error.message}
          </div>
        </div>
      )}

      {!clients || clients.length === 0 ? (
        <div className="panel px-6 py-14 text-center">
          <Users
            size={20}
            className="mx-auto text-bone-400 mb-2"
            strokeWidth={1.5}
          />
          <p className="text-sm text-bone-100 font-medium mb-1">No tenants yet</p>
          <p className="text-xs text-bone-400">
            Leads from the public /onboard page show up here.
          </p>
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <ul className="divide-y divide-line-subtle">
            {clients.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/admin/clients/${c.id}`}
                  className="block px-4 py-3 hover:bg-ink-2 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full shrink-0",
                        c.is_active ? "bg-status-completed" : "bg-status-lead",
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-bone-100 truncate">
                        {c.business_name || `Client #${c.id}`}
                      </div>
                      <div className="text-2xs text-bone-400 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span className="font-mono">#{c.id}</span>
                        <span>·</span>
                        <span>{c.business_phone || "no phone"}</span>
                        <span>·</span>
                        <span>{c.owner_email || "no email"}</span>
                        {c.intake_mode && (
                          <>
                            <span>·</span>
                            <span className="uppercase tracking-wide">
                              {c.intake_mode}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <span className="text-2xs text-bone-400 num shrink-0">
                      {fmtDate(c.created_at)}
                    </span>
                    <ChevronRight
                      size={14}
                      className="text-bone-400 shrink-0"
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
