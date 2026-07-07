import { cn } from "@/lib/cn";

/** Estimate lifecycle chips — same visual language as job StatusChip. */
const MAP = {
  draft: { label: "Draft", tone: "text-status-lead border-status-lead/30 bg-status-lead/10" },
  sent: { label: "Sent", tone: "text-status-estimated border-status-estimated/30 bg-status-estimated/10" },
  accepted: { label: "Accepted", tone: "text-status-completed border-status-completed/30 bg-status-completed/10" },
  lost: { label: "Lost", tone: "text-status-cancelled border-status-cancelled/30 bg-status-cancelled/10" },
} as const;

export type EstimateStatusKey = keyof typeof MAP;

export function EstimateStatusChip({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const { label, tone } = MAP[(status in MAP ? status : "draft") as EstimateStatusKey];
  return (
    <span className={cn("chip", tone, className)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", tone.split(" ")[0].replace("text-", "bg-"))} />
      {label}
    </span>
  );
}
