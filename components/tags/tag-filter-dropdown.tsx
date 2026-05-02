"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Tag, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Tag filter for list pages. Shows a dropdown of all available tags;
 * selecting one navigates with ?tag= preserved alongside any existing
 * query params (e.g. status). Single-select; multi-tag filter is v0.7+.
 */
export function TagFilterDropdown({
  currentTag,
  currentStatus,
  availableTags,
  baseHref = "/app/jobs",
}: {
  currentTag?: string;
  currentStatus?: string;
  availableTags: string[];
  baseHref?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function applyTag(tag: string | null) {
    const params = new URLSearchParams();
    if (currentStatus) params.set("status", currentStatus);
    if (tag) params.set("tag", tag);
    const qs = params.toString();
    router.push(qs ? `${baseHref}?${qs}` : baseHref);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "btn-secondary text-xs h-9 inline-flex items-center gap-1.5",
          currentTag && "!border-field-500/50 !text-field-500",
        )}
      >
        <Tag size={11} />
        {currentTag || "Filter by tag"}
        <ChevronDown size={11} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 panel min-w-[180px] max-h-[360px] overflow-y-auto rounded-sm border border-line shadow-md">
          <ul className="py-1">
            {currentTag && (
              <li>
                <button
                  type="button"
                  onClick={() => applyTag(null)}
                  className="w-full text-left px-3 py-1.5 text-xs text-bone-400 hover:bg-ink-2 italic"
                >
                  Clear tag filter
                </button>
              </li>
            )}
            {availableTags.map((t) => (
              <li key={t}>
                <button
                  type="button"
                  onClick={() => applyTag(t)}
                  className={cn(
                    "w-full text-left px-3 py-1.5 text-xs hover:bg-ink-2 inline-flex items-center justify-between gap-2",
                    t === currentTag && "text-field-500",
                  )}
                >
                  <span className="font-mono truncate">{t}</span>
                  {t === currentTag && <Check size={11} className="shrink-0" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
