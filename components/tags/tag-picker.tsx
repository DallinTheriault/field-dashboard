"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Search, Plus, Tag as TagIcon, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Tag } from "@/lib/tags/types";
import { nextTagColor, tagTextColor, TAG_COLORS } from "@/lib/tags/colors";
import { TagChip } from "./tag-chip";

/**
 * Tag picker — search, suggest, attach. Used on edit forms for jobs and
 * contacts. Server-side persistence happens on form submit; this component
 * just manages selected-tag state.
 *
 * Layout (per user spec):
 *   - Search bar at top (filters as you type)
 *   - 2 suggestions below: most recent + most used (when not searching)
 *   - Live results as you type
 *   - "Create new tag" button at bottom of dropdown when query has no exact match
 *   - Selected tags shown above the input as removable chips
 */
export function TagPicker({
  clientId,
  allTags,
  selected,
  onChange,
  label = "Tags",
}: {
  clientId: number;
  allTags: Tag[];
  selected: Tag[];
  onChange: (tags: Tag[]) => void;
  label?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selectedIds = useMemo(() => new Set(selected.map((t) => t.id)), [selected]);

  // Filter available tags: exclude already-selected, match query
  const availableTags = useMemo(() => {
    return allTags.filter((t) => !selectedIds.has(t.id));
  }, [allTags, selectedIds]);

  const filteredTags = useMemo(() => {
    if (!query.trim()) return availableTags;
    const q = query.toLowerCase().trim();
    return availableTags.filter((t) => t.name.toLowerCase().includes(q));
  }, [availableTags, query]);

  // Suggestions when not searching: most used + most recent
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

  // Whether to show the "Create new tag" affordance
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
    const newColor = nextTagColor(allTags.length);
    const { data, error } = await supabase
      .from("tags")
      .insert({
        client_id: clientId,
        name: query.trim(),
        color_hex: newColor,
      })
      .select()
      .single();
    setCreating(false);
    if (error || !data) {
      setCreateError(error?.message || "Failed to create tag");
      return;
    }
    const newTag = data as Tag;
    // Add to local "all" list so it shows up in subsequent searches
    allTags.push(newTag);
    attachTag(newTag);
  }

  return (
    <div className="field-group" ref={containerRef}>
      <label className="field-label flex items-center gap-1.5">
        <TagIcon size={12} className="text-bone-400" />
        {label}
      </label>

      {/* Selected tags above the input */}
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          {selected.map((tag) => (
            <TagChip key={tag.id} tag={tag} onRemove={() => removeTag(tag.id)} size="default" />
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-bone-400 pointer-events-none"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={selected.length === 0 ? "Search or create a tag" : "Add another tag"}
            className="w-full pl-9"
          />
        </div>

        {/* Dropdown */}
        {open && (
          <div className="absolute z-20 left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-md border border-line-strong bg-ink-2 shadow-lg">
            {/* Suggestions when no query */}
            {!query.trim() && suggestions.length > 0 && (
              <div className="py-1 border-b border-line-subtle">
                <div className="px-3 py-1 text-2xs uppercase tracking-wider text-bone-500 font-medium">
                  Suggestions
                </div>
                {suggestions.map((tag) => (
                  <TagPickerRow
                    key={tag.id}
                    tag={tag}
                    onClick={() => attachTag(tag)}
                  />
                ))}
              </div>
            )}

            {/* Live filter results */}
            {query.trim() && filteredTags.length > 0 && (
              <div className="py-1">
                {filteredTags.slice(0, 20).map((tag) => (
                  <TagPickerRow
                    key={tag.id}
                    tag={tag}
                    onClick={() => attachTag(tag)}
                  />
                ))}
              </div>
            )}

            {/* All tags when no query and there are tags beyond the suggestions */}
            {!query.trim() && availableTags.length > suggestions.length && (
              <div className="py-1">
                <div className="px-3 py-1 text-2xs uppercase tracking-wider text-bone-500 font-medium">
                  All tags
                </div>
                {availableTags
                  .filter((t) => !suggestions.find((s) => s.id === t.id))
                  .slice(0, 20)
                  .map((tag) => (
                    <TagPickerRow
                      key={tag.id}
                      tag={tag}
                      onClick={() => attachTag(tag)}
                    />
                  ))}
              </div>
            )}

            {/* Empty state */}
            {availableTags.length === 0 && !query.trim() && (
              <div className="px-3 py-3 text-xs text-bone-400 text-center">
                No tags yet. Type a name to create one.
              </div>
            )}

            {/* Create new tag */}
            {query.trim() && !exactMatch && (
              <button
                type="button"
                onClick={createNewTag}
                disabled={creating}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-field-500 hover:bg-ink-3 transition-colors border-t border-line-subtle"
              >
                <Plus size={12} />
                {creating ? "Creating…" : `Create "${query.trim()}"`}
                <span className="ml-auto text-2xs text-bone-500">
                  with {TAG_COLORS[allTags.length % TAG_COLORS.length].name}
                </span>
              </button>
            )}

            {/* No match */}
            {query.trim() && filteredTags.length === 0 && exactMatch && (
              <div className="px-3 py-2 text-xs text-bone-400">
                Already added.
              </div>
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
