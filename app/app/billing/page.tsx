import { createClient } from "@/lib/supabase/server";
import {
  CreditCard,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Clock,
} from "lucide-react";
import { getTenantFeatureFlags } from "@/lib/features/flags";
import { FeatureDisabledPanel } from "@/components/ui/feature-disabled-panel";
import { getTenantTimezone } from "@/lib/dates";

function fmtDollar(c: number | null): string {
  if (c == null) return "—";
  return `$${(c / 100).toFixed(2)}`;
}

function fmtDate(d: string | null, tz: string): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { timeZone: tz,
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default async function BillingPage() {
  const tz = await getTenantTimezone();
  const flags = await getTenantFeatureFlags();
  if (!flags.billing) {
    return (
      <FeatureDisabledPanel
        featureName="Billing"
        description="Self-service billing is not enabled for your account. You're likely on a custom contract."
      />
    );
  }

  const supabase = await createClient();

  const { data: clients } = await supabase
    .from("Clients")
    .select("id")
    .limit(1);
  const clientId = clients?.[0]?.id;

  const { data: sub } = clientId
    ? await supabase
        .from("subscriptions")
        .select("*")
        .eq("client_id", clientId)
        .maybeSingle()
    : { data: null };

  const cancellingAtPeriodEnd =
    sub?.status === "active" && sub?.cancel_at_period_end === true;

  return (
    <div>
      <div className="label-eyebrow mb-1">Billing</div>
      <h1 className="text-2xl font-semibold text-bone-50 tracking-tight">
        Subscription
      </h1>
      <p className="text-sm text-bone-300 mt-1 mb-6">
        Your Field plan, next charge, and payment method.
      </p>

      {!sub ? (
        <div className="panel px-6 py-12 text-center">
          <div className="w-10 h-10 mx-auto rounded-full bg-ink-2 border border-line-strong flex items-center justify-center mb-3">
            <CreditCard size={16} className="text-bone-400" />
          </div>
          <div className="text-sm font-medium text-bone-100">
            No subscription on file
          </div>
          <p className="text-xs text-bone-400 mt-1 max-w-[38ch] mx-auto">
            Your operator will send a payment link to activate your assistant.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Banner for scheduled cancellation */}
          {cancellingAtPeriodEnd && (
            <div className="panel border border-status-progress/40 bg-status-progress/5 px-4 py-3 flex items-start gap-3">
              <Clock
                size={14}
                className="text-status-progress shrink-0 mt-0.5"
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-bone-100">
                  Subscription scheduled to cancel
                </div>
                <p className="text-xs text-bone-300 mt-0.5">
                  Your plan will end on{" "}
                  <span className="num text-bone-100">
                    {fmtDate(sub.current_period_end, tz)}
                  </span>
                  . You&apos;ll keep full access to Field until then. Open the
                  portal to undo cancellation.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="panel p-5">
              <div className="flex items-center gap-2 mb-3">
                {sub.status === "active" && !cancellingAtPeriodEnd && (
                  <CheckCircle2 size={14} className="text-status-completed" />
                )}
                {cancellingAtPeriodEnd && (
                  <Clock size={14} className="text-status-progress" />
                )}
                {sub.status !== "active" && (
                  <AlertCircle size={14} className="text-status-danger" />
                )}
                <span className="label-eyebrow">Status</span>
              </div>
              <div className="text-xl font-semibold text-bone-50 capitalize">
                {cancellingAtPeriodEnd
                  ? "Cancelling"
                  : sub.status.replace("_", " ")}
              </div>
              {sub.setup_fee_paid_at && (
                <div className="text-2xs text-bone-400 mt-1">
                  Setup paid {fmtDate(sub.setup_fee_paid_at, tz)}
                </div>
              )}
            </div>

            <div className="panel p-5">
              <div className="label-eyebrow mb-3">Monthly</div>
              <div className="num text-xl font-semibold text-bone-50">
                {fmtDollar(sub.monthly_price_cents)}
              </div>
              <div className="text-2xs text-bone-400 mt-1">/ month</div>
            </div>

            <div className="panel p-5">
              <div className="label-eyebrow mb-3">
                {cancellingAtPeriodEnd ? "Access until" : "Next charge"}
              </div>
              <div className="num text-xl font-semibold text-bone-50">
                {fmtDate(sub.current_period_end, tz)}
              </div>
              <div className="text-2xs text-bone-400 mt-1">
                {cancellingAtPeriodEnd ? "Then ends" : "Auto-renews"}
              </div>
            </div>
          </div>

          <div className="panel p-5 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-sm font-medium text-bone-100">
                Manage payment
              </div>
              <div className="text-xs text-bone-400 mt-0.5">
                Update card, download invoices, or
                {cancellingAtPeriodEnd ? " resume your plan" : " cancel your plan"}.
              </div>
            </div>
            <form action="/api/stripe/portal" method="POST">
              <button type="submit" className="btn-secondary text-xs">
                Open portal
                <ExternalLink size={11} />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
