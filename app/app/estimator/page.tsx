import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Briefcase,
  Car,
  ChevronRight,
  LineChart,
  Receipt,
  ScanLine,
  Settings2,
  Wallet,
} from "lucide-react";
import { getCurrentUserRole } from "@/lib/permissions/current-role";
import { canViewSettings } from "@/lib/permissions/roles";
import { getTenantFeatureFlags } from "@/lib/features/flags";
import { FeatureDisabledPanel } from "@/components/ui/feature-disabled-panel";

/**
 * Estimator hub. Estimates themselves live on the job — created, listed,
 * and opened from the job page (jobs are the root object). This tab is the
 * doorway to the money side: P&L, variance insights, invoices, pricing.
 */
export default async function EstimatorHome() {
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

  const destinations = [
    {
      href: "/app/estimator/purchases",
      icon: ScanLine,
      label: "Expenses",
      blurb: "Scan receipts, assign materials.",
    },
    {
      href: "/app/estimator/expenses",
      icon: Wallet,
      label: "Money",
      blurb: "Year P&L and the tax CSV.",
    },
    {
      href: "/app/estimator/mileage",
      icon: Car,
      label: "Mileage",
      blurb: "Log the drive the day you make it.",
    },
    {
      href: "/app/estimator/insights",
      icon: LineChart,
      label: "Insights",
      blurb: "Estimated vs actual — where bids drift.",
    },
    {
      href: "/app/estimator/invoices",
      icon: Receipt,
      label: "Invoices",
      blurb: "Every invoice, its status, and Stripe sends.",
    },
    {
      href: "/app/estimator/settings",
      icon: Settings2,
      label: "Settings",
      blurb: "Rates, margin, catalog, letterheads.",
    },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-bone-50">Business</h1>
        <p className="text-sm text-bone-400 mt-0.5">
          Same inputs, same price — every time.
        </p>
      </header>

      <ul className="space-y-2">
        {destinations.map(({ href, icon: Icon, label, blurb }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex items-center gap-3 px-4 py-3.5 bg-ink-1 hover:bg-ink-2 rounded-sm shadow-inset-line transition-colors"
            >
              <Icon size={16} className="text-bone-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-bone-100 font-medium">{label}</div>
                <div className="text-2xs text-bone-400 truncate">{blurb}</div>
              </div>
              <ChevronRight size={14} className="text-bone-500 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>

      <div className="panel px-4 py-3 flex items-center gap-3">
        <Briefcase size={14} className="text-bone-400 shrink-0" />
        <p className="text-2xs text-bone-400">
          Estimates live on the job now — open a job and hit{" "}
          <span className="text-bone-300">New estimate</span>.
        </p>
        <Link href="/app/jobs" className="btn-secondary text-xs h-8 ml-auto shrink-0">
          Jobs
        </Link>
      </div>
    </div>
  );
}
