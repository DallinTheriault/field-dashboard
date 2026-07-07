import { cn } from "@/lib/cn";

const MAP = {
  draft: { label: "Draft", tone: "text-status-lead border-status-lead/30 bg-status-lead/10" },
  sent: { label: "Sent", tone: "text-status-estimated border-status-estimated/30 bg-status-estimated/10" },
  paid: { label: "Paid", tone: "text-status-completed border-status-completed/30 bg-status-completed/10" },
  void: { label: "Void", tone: "text-status-cancelled border-status-cancelled/30 bg-status-cancelled/10" },
} as const;

export function InvoiceStatusChip({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const { label, tone } = MAP[(status in MAP ? status : "draft") as keyof typeof MAP];
  return (
    <span className={cn("chip", tone, className)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", tone.split(" ")[0].replace("text-", "bg-"))} />
      {label}
    </span>
  );
}
