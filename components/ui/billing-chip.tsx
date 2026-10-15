import { CircleDollarSign } from "lucide-react";
import { cn } from "@/lib/cn";
import { BILLING_LABEL, type BillingState } from "@/lib/jobs/billing";

const STYLE: Record<BillingState, string> = {
  ready: "text-status-lead border-status-lead/30 bg-status-lead/10",
  invoiced: "text-status-scheduled border-status-scheduled/30 bg-status-scheduled/10",
  part_paid: "text-status-progress border-status-progress/30 bg-status-progress/10",
  paid: "text-status-completed border-status-completed/30 bg-status-completed/10",
};

/**
 * The job's billing state next to its work status. A dollar sign rather than
 * the status dot, so the two never read as the same thing.
 */
export function BillingChip({ state, className }: { state: BillingState | null | undefined; className?: string }) {
  if (!state) return null;
  return (
    <span className={cn("chip normal-case tracking-normal", STYLE[state], className)} data-billing={state}>
      <CircleDollarSign size={10} className="shrink-0" />
      {BILLING_LABEL[state]}
    </span>
  );
}
