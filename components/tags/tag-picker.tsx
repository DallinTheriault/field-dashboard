"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Search, Plus, Tag as TagIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Tag } from "@/lib/tags/types";
import { nextTagColor, TAG_COLORS } from "@/lib/tags/colors";
import { TagChip } from "./tag-chip";

/**
 * Tag picker — search, suggest, attach, create-with-color.
 * Used on edit forms and inline add-tag flows for jobs and contacts.
 *
 * v0.6.2: when creating a new tag, user picks the color from a swatch grid
 * before confirming. Default is the next color in palette rotation, but
 * any of the 16 can be picked manually.
 */
export function TagPicker({
  clientId,
  allTags,
  selected,
  onChange,
  label = "Tags",
  compact = false,
}: {
  clientId: number;
  allTags: Tag[];
  selected: Tag[];
  onChange: (tags: Tag[]) => void;
  label?: string;
  /** Compact mode: smaller search bar (~20ch) for inline use on detail pages. */
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  // Color picker state for create-new flow
  const [pendingColor, setPendingColor] = useState<string>(
    nextTagColor(allTags.length),
  );
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // When the query changes (or allTags grows), reset pending color to next-in-palette
  useEffect(() => {
    setPendingColor(nextTagColor(allTags.length));
  }, [allTags.length, query]);

  const selectedIds = useMemo(() => new Set(selected.map((t) => t.id)), [selected]);
  const availableTags = useMemo(
    () => allTags.filter((t) => !selectedIds.has(t.id)),
    [allTags, selectedIds],
  );

  const filteredTags = useMemo(() => {
    if (!query.trim()) return availableTags;
    const q = query.toLowerCase().trim();
    return availableTags.filter((t) => t.name.toLowerCase().includes(q));
  }, [availableTags, query]);

  const suggestions = useMemo(() => {
    if (query.trim()) return [];
    const sortedByUse = [...availableTags].sort((a, b) => b.use_count - a.use_count);
    const mostUsed = sortedByUse[0];
    const mostRecent = [...availableTags].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0];
    const result: Tag[] = [];
    if (mostUsed) result.push(mostUsed);
    if (mostRecent && mostRecent.id !== mostUsed?.id) result.push(mostRecent);
    return result;
  }, [availableTags, query]);

  const exactMatch = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return null;
    return allTags.find((t) => t.name.toLowerCase() === q);
  }, [allTags, query]);

  function attachTag(tag: Tag) {
    onChange([...selected, tag]);
    setQuery("");
  }

  function removeTag(tagId: number) {
    onChange(selected.filter((t) => t.id !== tagId));
  }

  async function createNewTag() {
    if (!query.trim() || creating) return;
    setCreating(true);
    setCreateError(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("tags")
      .insert({
        client_id: clientId,
        name: query.trim(),
        color_hex: pendingColor,
      })
      .select()
      .single();
    setCreating(false);
    if (error || !data) {
      setCreateError(error?.message || "Failed to create tag");
      return;
    }
    const newTag = data as Tag;
    allTags.push(newTag);
    attachTag(newTag);
  }

  const inputClasses = compact
    ? "w-[220px] pl-8 h-7 text-xs"
    : "w-full pl-9";

  return (
    <div className={compact ? "" : "field-group"} ref={containerRef}>
      {!compact && (
        <label className="field-label flex items-center gap-1.5">
          <TagIcon size={12} className="text-bone-400" />
          {label}
        </label>
      )}

      {!compact && selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          {selected.map((tag) => (
            <TagChip
              key={tag.id}
              tag={tag}
              onRemove={() => removeTag(tag.id)}
              size="default"
            />
          ))}
        </div>
      )}

      <div className="relative">
        <div className="relative">
          <Search
            size={compact ? 12 : 14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-bone-400 pointer-events-none"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={
              compact
                ? "Search or add tag"
                : selected.length === 0
                  ? "Search or create a tag"
                  : "Add another tag"
            }
            className={inputClasses}
          />
        </div>

        {open && (
          <div className="absolute z-30 left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-md border border-line-strong bg-ink-2 shadow-lg">
            {!query.trim() && suggestions.length > 0 && (
              <div className="py-1 border-b border-line-subtle">
                <div className="px-3 py-1 text-2xs uppercase tracking-wider text-bone-500 font-medium">
                  Suggestions
                </div>
                {suggestions.map((tag) => (
                  <TagPickerRow key={tag.id} tag={tag} onClick={() => attachTag(tag)} />
                ))}
              </div>
            )}

            {query.trim() && filteredTags.length > 0 && (
              <div className="py-1">
                {filteredTags.slice(0, 20).map((tag) => (
                  <TagPickerRow key={tag.id} tag={tag} onClick={() => attachTag(tag)} />
                ))}
              </div>
            )}

            {!query.trim() && availableTags.length > suggestions.length && (
              <div className="py-1">
                <div className="px-3 py-1 text-2xs uppercase tracking-wider text-bone-500 font-medium">
                  All tags
                </div>
                {availableTags
                  .filter((t) => !suggestions.find((s) => s.id === t.id))
                  .slice(0, 20)
                  .map((tag) => (
                    <TagPickerRow key={tag.id} tag={tag} onClick={() => attachTag(tag)} />
                  ))}
              </div>
            )}

            {availableTags.length === 0 && !query.trim() && (
              <div className="px-3 py-3 text-xs text-bone-400 text-center">
                No tags yet. Type a name to create one.
              </div>
            )}

            {/* Create-new flow with color picker */}
            {query.trim() && !exactMatch && (
              <div className="border-t border-line-subtle">
                <div className="px-3 pt-2 pb-1 text-2xs uppercase tracking-wider text-bone-500 font-medium">
                  Pick a color
                </div>
                <div className="px-3 pb-2 grid grid-cols-8 gap-1.5">
                  {TAG_COLORS.map((c) => {
                    const isPicked = c.hex === pendingColor;
                    return (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => setPendingColor(c.hex)}
                        title={c.name}
                        className={`w-6 h-6 rounded-full border-2 transition-all ${
                          isPicked
                            ? "border-bone-50 scale-110"
                            : "border-transparent hover:scale-105"
                        }`}
                        style={{ backgroundColor: c.hex }}
                      />
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={createNewTag}
                  disabled={creating}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-ink-3 transition-colors border-t border-line-subtle"
                  style={{ color: pendingColor }}
                >
                  <Plus size={12} />
                  {creating ? "Creating…" : `Create "${query.trim()}"`}
                </button>
              </div>
            )}

            {query.trim() && filteredTags.length === 0 && exactMatch && (
              <div className="px-3 py-2 text-xs text-bone-400">Already added.</div>
            )}

            {createError && (
              <div className="px-3 py-2 text-xs text-status-danger border-t border-line-subtle">
                {createError}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TagPickerRow({ tag, onClick }: { tag: Tag; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-ink-3 transition-colors"
    >
      <span
        className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: tag.color_hex }}
      />
      <span className="text-xs text-bone-50">{tag.name}</span>
      {tag.use_count > 0 && (
        <span className="ml-auto text-2xs text-bone-500 font-mono">
          {tag.use_count}
        </span>
      )}
    </button>
  );
}
