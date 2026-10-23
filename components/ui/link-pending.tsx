"use client";

import { useLinkStatus } from "next/link";
import { Loader2 } from "lucide-react";

/**
 * Inside a <Link> that doesn't prefetch: shows at once that the tap was
 * taken, while the next page loads (the parent Link needs `relative`).
 */
export function LinkPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden
      data-testid="link-pending"
      className="absolute inset-0 flex items-center justify-end pr-4 bg-ink-2/60"
    >
      <Loader2 size={16} className="animate-spin text-field-400" />
    </span>
  );
}
