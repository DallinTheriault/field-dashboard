import { cn } from "@/lib/cn";

const STATUS_MAP = {
  lead: { label: "Lead", color: "text-status-lead", border: "border-status-lead/30", bg: "bg-status-lead/10", pulse: false },
  estimated: { label: "Estimated", color: "text-status-estimated", border: "border-status-estimated/30", bg: "bg-status-estimated/10", pulse: false },
  scheduled: { label: "Scheduled", color: "text-status-scheduled", border: "border-status-scheduled/30", bg: "bg-status-scheduled/10", pulse: false },
  in_progress: { label: "In progress", color: "text-status-progress", border: "border-status-progress/30", bg: "bg-status-progress/10", pulse: false },
  completed: { label: "Completed", color: "text-status-completed", border: "border-status-completed/30", bg: "bg-status-completed/10", pulse: false },
  cancelled: { label: "Cancelled", color: "text-status-cancelled", border: "border-status-cancelled/30", bg: "bg-status-cancelled/10", pulse: false },
  // Callbacks are urgent (warranty/litigation). Bright danger-red badge with
  // a pulsing dot so the operator can't miss them in a list of jobs.
  callback: { label: "Callback", color: "text-status-danger", border: "border-status-danger/40", bg: "bg-status-danger/15", pulse: true },
  callback_complete: { label: "Callback resolved", color: "text-status-completed", border: "border-status-completed/30", bg: "bg-status-completed/10", pulse: false },
} as const;

export type JobStatus = keyof typeof STATUS_MAP;

export function StatusChip({ status, className }: { status: string; className?: string }) {
  const key = (STATUS_MAP[status as JobStatus] ? (status as JobStatus) : "lead") as JobStatus;
  const { label, color, border, bg, pulse } = STATUS_MAP[key];
  return (
    <span className={cn("chip", color, border, bg, className)}>
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          color.replace("text-", "bg-"),
          pulse && "animate-pulse",
        )}
      />
      {label}
    </span>
  );
}
