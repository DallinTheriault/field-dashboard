"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";

/**
 * A `<tr>` that navigates to `href` when the row is clicked or activated
 * via keyboard. Replaces the stretched-link CSS pattern, which is
 * unreliable inside HTML tables (table-row formatting context doesn't
 * always honor `position: relative` for absolute descendants — leading
 * to the bug where every click landed on the last row).
 *
 * Children render normally inside the row. Inner interactive elements
 * (buttons, anchors, inputs) call e.stopPropagation() automatically via
 * the click handler so they keep working without firing the row navigate.
 */
export function ClickableTableRow({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();

  function handleClick(e: React.MouseEvent<HTMLTableRowElement>) {
    // If the click was on a real interactive element inside the row, let
    // it own the event — don't double-navigate.
    const target = e.target as HTMLElement;
    if (target.closest("a, button, input, select, textarea, label")) return;
    router.push(href);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      router.push(href);
    }
  }

  return (
    <tr
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="link"
      tabIndex={0}
      aria-label={`Open ${href}`}
      className={cn("cursor-pointer", className)}
    >
      {children}
    </tr>
  );
}
