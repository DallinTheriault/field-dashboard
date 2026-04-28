import { cn } from "@/lib/cn";

export function MetricCard({
  label,
  value,
  sub,
  accent,
  className,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "field" | "lead" | "scheduled" | "completed" | null;
  className?: string;
}) {
  const accentBar: Record<string, string> = {
    field: "bg-accent",
    lead: "bg-status-lead",
    scheduled: "bg-status-scheduled",
    completed: "bg-status-completed",
  };
  return (
    <div
      className={cn(
        "panel relative px-4 py-3.5 flex flex-col gap-1.5",
        "transition-colors hover:bg-ink-2",
        className,
      )}
    >
      {accent && (
        <span
          aria-hidden
          className={cn(
            "absolute left-0 top-3 bottom-3 w-[3px] rounded-full",
            accentBar[accent],
          )}
        />
      )}
      <div className="label-eyebrow">{label}</div>
      <div className="num text-[26px] leading-none font-semibold text-bone-50 tracking-[-0.02em]">
        {value}
      </div>
      {sub && <div className="text-xs text-bone-300">{sub}</div>}
    </div>
  );
}
