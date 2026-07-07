import Link from "next/link";
import { redirect } from "next/navigation";
import { LineChart, Plus, Receipt, Settings2, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/permissions/current-role";
import { canViewSettings } from "@/lib/permissions/roles";
import { getTenantFeatureFlags } from "@/lib/features/flags";
import { FeatureDisabledPanel } from "@/components/ui/feature-disabled-panel";
import { EstimateStatusChip } from "./estimate-status";
import { getTenantTimezone } from "@/lib/dates";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function fmtDate(d: string | null, tz: string): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { timeZone: tz,
    month: "short",
    day: "numeric",
  });
}

/** Estimates list — pipeline view grouped by status. */
export default async function EstimatorHome() {
  const tz = await getTenantTimezone();
  const [session, flags] = await Promise.all([
    getCurrentUserRole(),
    getTenantFeatureFlags(),
  ]);
  if (!session) redirect("/login");
  // Pricing internals are owner/manager-only.
  if (!canViewSettings(session.role)) redirect("/app");
  if (!flags.estimator) {
    return (
      <FeatureDisabledPanel
        featureName="Estimator"
        description="Estimating + invoicing: pricing settings, estimate builder, and job insights."
      />
    );
  }

  const supabase = await createClient();
  const { data: estimates } = await supabase
    .from("estimates")
    .select(
      "id, version, status, computed_price, manual_override_price, estimated_at, created_at, job_id, jobs(name, address)",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  const groups: Array<{ key: string; title: string }> = [
    { key: "draft", title: "Drafts" },
    { key: "sent", title: "Sent" },
    { key: "accepted", title: "Accepted" },
    { key: "lost", title: "Lost" },
  ];

  const rows = estimates ?? [];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <header className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-bone-50">Estimator</h1>
            <p className="text-sm text-bone-400 mt-0.5 truncate">
              Same inputs, same price — every time.
            </p>
          </div>
          <Link
            href="/app/estimator/new"
            className="btn-primary text-sm shrink-0 min-h-[42px]"
          >
            <Plus size={14} />
            New estimate
          </Link>
        </div>
        {/* Labeled sub-nav — icon-only buttons were cryptic and overflowed
            the header on phones. */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { href: "/app/estimator/expenses", icon: Wallet, label: "Money" },
            { href: "/app/estimator/insights", icon: LineChart, label: "Insights" },
            { href: "/app/estimator/invoices", icon: Receipt, label: "Invoices" },
            { href: "/app/estimator/settings", icon: Settings2, label: "Settings" },
          ].map(({ href, icon: Icon, label }) => (
            <Link key={href} href={href} className="btn-secondary text-xs h-8">
              <Icon size={12} />
              {label}
            </Link>
          ))}
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="panel px-6 py-12 text-center">
          <p className="text-sm text-bone-300 mb-1">No estimates yet.</p>
          <p className="text-xs text-bone-400 mb-4">
            Price your first job — on-site, from your phone.
          </p>
          <Link href="/app/estimator/new" className="btn-primary text-sm">
            <Plus size={14} />
            New estimate
          </Link>
        </div>
      ) : (
        groups.map(({ key, title }) => {
          const group = rows.filter((e) => e.status === key);
          if (group.length === 0) return null;
          return (
            <section key={key}>
              <h2 className="label-eyebrow mb-2">{title}</h2>
              <ul className="space-y-1.5">
                {group.map((e) => {
                  const job = e.jobs as unknown as {
                    name: string | null;
                    address: string | null;
                  } | null;
                  const price =
                    e.manual_override_price ?? e.computed_price ?? 0;
                  return (
                    <li key={e.id}>
                      <Link
                        href={`/app/estimator/${e.id}`}
                        className="flex items-center gap-3 px-3 py-2.5 bg-ink-1 hover:bg-ink-2 rounded-sm shadow-inset-line transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-bone-100 font-medium truncate">
                            {job?.name || `Job #${e.job_id}`}
                            {e.version > 1 && (
                              <span className="ml-1.5 text-2xs text-bone-400 font-mono">
                                v{e.version}
                              </span>
                            )}
                          </div>
                          <div className="text-2xs text-bone-400 truncate">
                            {job?.address || "—"} · {fmtDate(e.estimated_at ?? e.created_at, tz)}
                          </div>
                        </div>
                        {e.manual_override_price !== null && (
                          <span className="chip border-status-danger/30 text-status-danger bg-status-danger/10">
                            overridden
                          </span>
                        )}
                        <span className="num text-sm text-bone-50">
                          {usd.format(Number(price))}
                        </span>
                        <EstimateStatusChip status={e.status} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
