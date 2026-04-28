"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronDown, Check, X } from "lucide-react";
import { cn } from "@/lib/cn";

type Option = { key: string; label: string };

/**
 * Multi-select dropdown that mirrors selection state into a URL param.
 *
 * Selection lives in `searchParams[paramName]` as a comma-separated list
 * (e.g. `?outcomes=estimate_saved,booking_saved`). On change we
 * router.push() the new URL so the server component re-runs its query.
 *
 * Click outside or press Escape to close. Keeps the rest of the URL params
 * intact (search query, tab, etc.) when toggling.
 */
export function FilterDropdown({
  paramName,
  options,
  label,
  className,
}: {
  paramName: string;
  options: Option[];
  label: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const raw = searchParams.get(paramName) ?? "";
  const selected = new Set(raw.split(",").filter(Boolean));

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pushUpdated(next: Set<string>) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.size === 0) {
      params.delete(paramName);
    } else {
      params.set(paramName, Array.from(next).join(","));
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function toggle(key: string) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    pushUpdated(next);
  }

  function clearAll() {
    pushUpdated(new Set());
  }

  const count = selected.size;
  const buttonLabel =
    count === 0
      ? label
      : count === 1
      ? options.find((o) => o.key === Array.from(selected)[0])?.label ?? label
      : `${label} · ${count}`;

  return (
    <div ref={ref} className={cn("relative inline-block", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-2 h-8 px-3 rounded-sm",
          "text-xs font-medium border transition-colors",
          count > 0
            ? "bg-ink-2 border-field-500/40 text-bone-50"
            : "bg-ink-1 border-line text-bone-300 hover:text-bone-50 hover:border-line-strong",
        )}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="truncate max-w-[160px]">{buttonLabel}</span>
        {count > 0 && (
          <span
            role="button"
            aria-label={`Clear ${label} filter`}
            onClick={(e) => {
              e.stopPropagation();
              clearAll();
            }}
            className="ml-0.5 -mr-1 p-0.5 rounded-xs hover:bg-ink-3 cursor-pointer"
          >
            <X size={11} />
          </span>
        )}
        <ChevronDown
          size={12}
          className={cn("transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          className={cn(
            "absolute z-30 mt-1.5 left-0 min-w-[220px]",
            "bg-ink-1 border border-line rounded-md shadow-pop",
            "py-1 animate-fade-in",
          )}
        >
          {options.map(({ key, label: optLabel }) => {
            const checked = selected.has(key);
            return (
              <button
                key={key}
                type="button"
                role="option"
                aria-selected={checked}
                onClick={() => toggle(key)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 h-8 text-xs text-left",
                  "hover:bg-ink-2 transition-colors",
                  checked ? "text-bone-50" : "text-bone-300",
                )}
              >
                <span
                  className={cn(
                    "w-3.5 h-3.5 rounded-xs border flex items-center justify-center shrink-0",
                    checked
                      ? "bg-field-500 border-field-500"
                      : "border-line-strong",
                  )}
                >
                  {checked && <Check size={9} className="text-ink-0" strokeWidth={3} />}
                </span>
                <span className="flex-1 truncate">{optLabel}</span>
              </button>
            );
          })}

          {count > 0 && (
            <>
              <div className="my-1 border-t border-line-subtle" />
              <button
                type="button"
                onClick={clearAll}
                className="w-full text-left px-3 h-8 text-xs text-bone-400 hover:bg-ink-2 hover:text-bone-50 transition-colors"
              >
                Clear all
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
