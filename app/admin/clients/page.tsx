import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { ChevronRight, Users, Inbox, AlertCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { RejectIntakeButton } from "./reject-intake-button";

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtRelative(d: string | null): string {
  if (!d) return "—";
  const ms = Date.now() - new Date(d).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDate(d);
}

export default async function AdminClientsPage() {
  const supabase = createAdminClient();
  const { data: clients, error } = await supabase
    .from("Clients")
    .select(
      "id, business_name, business_phone, owner_email, intake_mode, is_active, created_at, service_type, service_constraints",
    )
    .neq("id", 6) // hide platform sentinel row
    .order("created_at", { ascending: false });

  const all = clients ?? [];
  const pending = all.filter((c) => !c.is_active);
  const active = all.filter((c) => c.is_active);

  return (
    <div>
      <div className="flex items-end justify-between mb-6 gap-4">
        <div>
          <div className="label-eyebrow mb-1">Tenants</div>
          <h1 className="text-2xl font-semibold text-bone-50 tracking-tight">
            Clients
          </h1>
          <p className="text-sm text-bone-300 mt-1">
            {active.length} active · {pending.length} pending intake
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

      {/* Pending intake — operator action queue */}
      {pending.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Inbox size={13} className="text-status-lead" />
            <h2 className="text-sm font-semibold text-bone-100">
              Pending intake
            </h2>
            <span className="ml-auto text-2xs text-bone-400">
              {pending.length} awaiting review
            </span>
          </div>
          <div className="panel overflow-hidden border border-status-lead/20">
            <ul className="divide-y divide-line-subtle">
              {pending.map((c) => {
                const intakeNote = (c.service_constraints ?? "")
                  .split("\n")
                  .slice(1) // first line is "Intake notes from /onboard:"
                  .join(" ")
                  .trim();
                return (
                  <li
                    key={c.id}
                    className="px-4 py-3 hover:bg-ink-2 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <Link
                        href={`/admin/clients/${c.id}`}
                        className="flex-1 min-w-0 block"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="text-sm font-medium text-bone-100 truncate">
                            {c.business_name || `(no name) #${c.id}`}
                          </div>
                          <span className="text-2xs text-status-lead uppercase tracking-wider font-bold">
                            New
                          </span>
                        </div>
                        <div className="text-2xs text-bone-400 mt-0.5 flex items-center gap-2 flex-wrap">
                          <span className="font-mono">#{c.id}</span>
                          <span>·</span>
                          <span>{c.business_phone || "no phone"}</span>
                          <span>·</span>
                          <span>{c.owner_email || "no email"}</span>
                          <span>·</span>
                          <span>{fmtRelative(c.created_at)}</span>
                        </div>
                        {c.service_type && (
                          <div className="text-2xs text-bone-300 mt-1.5 line-clamp-2">
                            <span className="text-bone-400">Service: </span>
                            {c.service_type}
                          </div>
                        )}
                        {intakeNote && (
                          <div className="text-2xs text-bone-300 mt-1 line-clamp-2 italic">
                            {intakeNote}
                          </div>
                        )}
                      </Link>
                      <div className="flex flex-col items-stretch gap-1.5 shrink-0">
                        <Link
                          href={`/admin/clients/${c.id}`}
                          className="btn-primary text-2xs h-7 whitespace-nowrap"
                        >
                          Review
                          <ChevronRight size={11} />
                        </Link>
                        <RejectIntakeButton
                          clientId={c.id}
                          businessName={c.business_name ?? `Client #${c.id}`}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {/* Active tenants */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <Users size={13} className="text-bone-400" />
          <h2 className="text-sm font-semibold text-bone-100">Active</h2>
          <span className="ml-auto text-2xs text-bone-400">
            {active.length} {active.length === 1 ? "tenant" : "tenants"}
          </span>
        </div>
        {active.length === 0 ? (
          <div className="panel px-6 py-14 text-center">
            <Users
              size={20}
              className="mx-auto text-bone-400 mb-2"
              strokeWidth={1.5}
            />
            <p className="text-sm text-bone-100 font-medium mb-1">
              No active tenants yet
            </p>
            <p className="text-xs text-bone-400">
              Approve a pending intake to activate it.
            </p>
          </div>
        ) : (
          <div className="panel overflow-hidden">
            <ul className="divide-y divide-line-subtle">
              {active.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/admin/clients/${c.id}`}
                    className="block px-4 py-3 hover:bg-ink-2 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full shrink-0",
                          "bg-status-completed",
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
      </section>
    </div>
  );
}
