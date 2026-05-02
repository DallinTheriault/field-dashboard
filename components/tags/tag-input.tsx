"use client";

import { useState, useRef, useMemo, type KeyboardEvent } from "react";
import { X, Plus } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Free-form tag input. Uses a single text<input> + chip rendering pattern.
 *
 * Submit a tag by typing then pressing Enter, comma, or blur. Backspace
 * on empty input removes the last tag (familiar from Gmail/Slack).
 *
 * Tags are normalized: trim, lowercase, dedupe. Max 24 chars per tag,
 * max 10 tags per item (sensible defaults; can relax later).
 *
 * Optional `suggestions` prop renders a dropdown of existing tags from
 * other rows in the same tenant — autocomplete without forcing a vocab.
 */
export function TagInput({
  value,
  onChange,
  suggestions = [],
  disabled = false,
  placeholder = "Add tag…",
  maxTags = 10,
  maxLength = 24,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
  disabled?: boolean;
  placeholder?: string;
  maxTags?: number;
  maxLength?: number;
}) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function normalize(s: string): string {
    return s.trim().toLowerCase();
  }

  function addTag(raw: string) {
    const t = normalize(raw);
    if (!t) return;
    if (t.length > maxLength) return;
    if (value.includes(t)) return;
    if (value.length >= maxTags) return;
    onChange([...value, t]);
    setDraft("");
  }

  function removeTag(t: string) {
    onChange(value.filter((x) => x !== t));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(draft);
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      removeTag(value[value.length - 1]);
    } else if (e.key === "Escape") {
      setDraft("");
      inputRef.current?.blur();
    }
  }

  // Autocomplete: tags in suggestions but not yet on this item, matching
  // the current draft (case-insensitive). Top 5.
  const matches = useMemo(() => {
    if (!draft.trim()) return [];
    const q = normalize(draft);
    return suggestions
      .filter((s) => !value.includes(s) && s.includes(q))
      .slice(0, 5);
  }, [draft, suggestions, value]);

  return (
    <div className="relative">
      <div
        className={cn(
          "flex flex-wrap items-center gap-1 min-h-[36px] px-2 py-1.5",
          "bg-ink-2 border border-line rounded-sm",
          "focus-within:border-field-500/50",
          disabled && "opacity-60 pointer-events-none",
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-xs bg-ink-3 border border-line text-2xs text-bone-100"
          >
            {t}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(t);
              }}
              className="hover:bg-ink-1 rounded-xs p-0.5"
              aria-label={`Remove tag ${t}`}
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, maxLength))}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            // Slight delay so suggestion clicks land before blur hides them
            setTimeout(() => setFocused(false), 150);
            // Auto-commit draft on blur if non-empty (prevents lost work)
            if (draft.trim()) addTag(draft);
          }}
          placeholder={value.length === 0 ? placeholder : ""}
          disabled={disabled || value.length >= maxTags}
          className="flex-1 min-w-[80px] !bg-transparent !border-0 !p-0 !h-6 text-xs focus:!ring-0"
        />
      </div>

      {focused && matches.length > 0 && (
        <ul className="absolute z-10 left-0 right-0 mt-1 panel border border-line rounded-sm overflow-hidden">
          {matches.map((m) => (
            <li key={m}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  addTag(m);
                  inputRef.current?.focus();
                }}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-ink-2 inline-flex items-center gap-1.5"
              >
                <Plus size={10} className="text-bone-400" />
                {m}
              </button>
            </li>
          ))}
        </ul>
      )}

      {value.length >= maxTags && (
        <p className="text-2xs text-bone-400 mt-1">
          Max {maxTags} tags per item.
        </p>
      )}
    </div>
  );
}
