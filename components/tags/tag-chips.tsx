import { cn } from "@/lib/cn";

/**
 * Read-only tag chips. Used in list cards, detail headers, etc. Visually
 * minimal — these are metadata, not the main content. Limit display to
 * `maxVisible` to keep cards from getting noisy; show "+N" overflow chip
 * if more.
 */
export function TagChips({
  tags,
  maxVisible = 3,
  className,
}: {
  tags: string[] | null | undefined;
  maxVisible?: number;
  className?: string;
}) {
  if (!tags || tags.length === 0) return null;

  const visible = tags.slice(0, maxVisible);
  const overflow = tags.length - visible.length;

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {visible.map((t) => (
        <span
          key={t}
          className="inline-flex items-center h-5 px-1.5 rounded-xs bg-ink-3 border border-line-subtle text-[10px] text-bone-300 leading-none"
        >
          {t}
        </span>
      ))}
      {overflow > 0 && (
        <span className="inline-flex items-center h-5 px-1.5 rounded-xs text-[10px] text-bone-400 leading-none">
          +{overflow}
        </span>
      )}
    </div>
  );
}
