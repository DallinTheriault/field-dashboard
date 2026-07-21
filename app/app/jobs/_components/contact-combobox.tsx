"use client";

import { useState, useEffect, useRef } from "react";
import { Search, X, UserPlus, Loader2 } from "lucide-react";
import { searchContacts, type ContactHit } from "./actions";

function fmtPhone(p: string | null): string {
  if (!p) return "";
  const d = p.replace(/\D/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  if (ten.length !== 10) return p;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

/**
 * Searchable contact picker. Typing queries existing contacts (name/phone);
 * the caller decides what "no selection" means:
 *  - main contact field: no selection = manual "create new" path (the typed
 *    text becomes the new contact's name), so manual keystrokes don't grow.
 *  - bill-to field: no selection = default to the property's contact.
 *
 * `onQueryChange` surfaces the raw typed text so the manual path can use it
 * as the new contact name without a second field.
 */
export function ContactCombobox({
  selected,
  onSelect,
  onQueryChange,
  placeholder,
  allowCreateNew = false,
  disabled = false,
  autoFocus = false,
}: {
  selected: ContactHit | null;
  onSelect: (c: ContactHit | null) => void;
  onQueryChange?: (q: string) => void;
  placeholder: string;
  allowCreateNew?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContactHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    if (selected) return; // don't search while a contact is locked in
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      const hits = await searchContacts(q);
      setResults(hits);
      setLoading(false);
      setOpen(true);
    }, 200);
    return () => clearTimeout(t);
  }, [query, selected]);

  // Close on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (selected) {
    return (
      <div className="flex items-center gap-2 h-9 px-2.5 rounded-xs bg-ink-2 border border-line">
        <span className="text-sm text-bone-100 font-medium truncate">
          {selected.name || "Unnamed"}
        </span>
        {selected.phone && (
          <span className="text-2xs text-bone-400 font-mono shrink-0">
            {fmtPhone(selected.phone)}
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            onSelect(null);
            setQuery("");
            onQueryChange?.("");
          }}
          disabled={disabled}
          aria-label="Clear contact"
          className="ml-auto btn-ghost h-6 w-6 px-0 shrink-0"
        >
          <X size={13} />
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search
          size={13}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-bone-500 pointer-events-none"
        />
        <input
          type="text"
          value={query}
          autoFocus={autoFocus}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            onQueryChange?.(e.target.value);
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          className="!bg-ink-2 w-full text-sm h-9 pl-8"
        />
        {loading && (
          <Loader2
            size={13}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-bone-500 animate-spin"
          />
        )}
      </div>

      {open && (results.length > 0 || (allowCreateNew && query.trim())) && (
        <div className="absolute z-10 left-0 right-0 top-full mt-1 max-h-60 overflow-y-auto rounded-md border border-line-strong bg-ink-2 shadow-lg py-1">
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onSelect(c);
                setOpen(false);
              }}
              className="flex items-center gap-2 w-full text-left px-3 py-2 hover:bg-ink-3"
            >
              <span className="text-sm text-bone-100 truncate">
                {c.name || "Unnamed"}
              </span>
              {c.phone && (
                <span className="ml-auto text-2xs text-bone-400 font-mono shrink-0">
                  {fmtPhone(c.phone)}
                </span>
              )}
            </button>
          ))}
          {allowCreateNew && query.trim() && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 w-full text-left px-3 py-2 hover:bg-ink-3 border-t border-line-subtle"
            >
              <UserPlus size={13} className="text-field-500 shrink-0" />
              <span className="text-xs text-bone-300">
                Create new:{" "}
                <span className="text-bone-100 font-medium">
                  &ldquo;{query.trim()}&rdquo;
                </span>
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
