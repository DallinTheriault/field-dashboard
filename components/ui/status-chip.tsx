import { cn } from "@/lib/cn";

const STATUS_MAP = {
  lead: { label: "Lead", color: "text-status-lead", border: "border-status-lead/30", bg: "bg-status-lead/10" },
  estimated: { label: "Estimated", color: "text-status-estimated", border: "border-status-estimated/30", bg: "bg-status-estimated/10" },
  scheduled: { label: "Scheduled", color: "text-status-scheduled", border: "border-status-scheduled/30", bg: "bg-status-scheduled/10" },
  in_progress: { label: "In progress", color: "text-status-progress", border: "border-status-progress/30", bg: "bg-status-progress/10" },
  completed: { label: "Completed", color: "text-status-completed", border: "border-status-completed/30", bg: "bg-status-completed/10" },
  cancelled: { label: "Cancelled", color: "text-status-cancelled", border: "border-status-cancelled/30", bg: "bg-status-cancelled/10" },
} as const;

export type JobStatus = keyof typeof STATUS_MAP;

export function StatusChip({ status, className }: { status: string; className?: string }) {
  const key = (STATUS_MAP[status as JobStatus] ? (status as JobStatus) : "lead") as JobStatus;
  const { label, color, border, bg } = STATUS_MAP[key];
  return (
    <span className={cn("chip", color, border, bg, className)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", color.replace("text-", "bg-"))} />
      {label}
    </span>
  );
}
