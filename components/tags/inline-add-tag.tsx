"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Check, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Tag } from "@/lib/tags/types";
import { nextTagColor, TAG_COLORS } from "@/lib/tags/colors";

/**
 * Inline `+ Tag` button used on job/contact detail pages. When clicked, opens
 * a compact 20-character search bar that attaches tags directly without going
 * through the edit form.
 *
 * Uses a single insert into job_tags or contact_tags, then router.refresh()
 * so the detail page picks up the new tag.
 */
export function InlineAddTagButton({
  entityType,
  entityId,
  clientId,
  allTags,
  attachedTagIds,
}: {
  entityType: "job" | "contact";
  entityId: number;
  clientId: number;
  allTags: Tag[];
  attachedTagIds: number[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [chosenColor, setChosenColor] = useState<string>(
    nextTagColor(allTags.length),
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const attachedSet = useMemo(() => new Set(attachedTagIds), [attachedTagIds]);
  const availableTags = useMemo(
    () => allTags.filter((t) => !attachedSet.has(t.id)),
    [allTags, attachedSet],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return availableTags.slice(0, 6);
    const q = query.toLowerCase().trim();
    return availableTags.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 6);
  }, [availableTags, query]);

  const exactMatch = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return null;
    return allTags.find((t) => t.name.toLowerCase() === q);
  }, [allTags, query]);

  async function attach(tag: Tag) {
    setPending(true);
    const supabase = createClient();
    const table = entityType === "job" ? "job_tags" : "contact_tags";
    const fkField = entityType === "job" ? "job_id" : "contact_id";
    await supabase.from(table).insert({
      [fkField]: entityId,
      tag_id: tag.id,
      client_id: clientId,
    });
    setPending(false);
    setOpen(false);
    setQuery("");
    router.refresh();
  }

  async function createAndAttach() {
    if (!query.trim() || pending) return;
    setPending(true);
    const supabase = createClient();
    const { data: created, error } = await supabase
      .from("tags")
      .insert({
        client_id: clientId,
        name: query.trim(),
        color_hex: chosenColor,
      })
      .select()
      .single();
    if (error || !created) {
      setPending(false);
      return;
    }
    const newTag = created as Tag;
    const table = entityType === "job" ? "job_tags" : "contact_tags";
    const fkField = entityType === "job" ? "job_id" : "contact_id";
    await supabase.from(table).insert({
      [fkField]: entityId,
      tag_id: newTag.id,
      client_id: clientId,
    });
    setPending(false);
    setOpen(false);
    setQuery("");
    router.refresh();
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed border-line-strong text-xs text-bone-400 hover:text-bone-50 hover:border-bone-400 transition-colors"
        >
          <Plus size={11} />
          tag
        </button>
      ) : (
        <div className="inline-flex flex-col gap-1.5 align-top">
          <div className="relative">
            <Search
              size={11}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-bone-400 pointer-events-none"
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setOpen(false);
                  setQuery("");
                }
              }}
              placeholder="search or create"
              maxLength={32}
              className="!h-7 !w-44 !pl-6 !pr-2 !text-xs"
            />
          </div>
          <div className="absolute z-20 top-full left-0 mt-1 w-56 rounded-md border border-line-strong bg-ink-2 shadow-lg overflow-hidden">
            {filtered.length > 0 && (
              <div className="py-1 max-h-44 overflow-y-auto">
                {filtered.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => attach(tag)}
                    disabled={pending}
                    className="w-full flex items-center gap-2 px-2.5 py-1 text-left hover:bg-ink-3 transition-colors text-xs"
                  >
                    <span
                      className="inline-block w-2 h-2 rounded-full border flex-shrink-0"
                      style={{ borderColor: tag.color_hex }}
                    />
                    <span className="text-bone-50 truncate">{tag.name}</span>
                  </button>
                ))}
              </div>
            )}
            {query.trim() && !exactMatch && (
              <div className="border-t border-line-subtle px-2.5 py-2">
                <div className="text-2xs text-bone-500 mb-1.5 uppercase tracking-wider">
                  Create &ldquo;{query.trim()}&rdquo;
                </div>
                <div className="grid grid-cols-8 gap-1 mb-2">
                  {TAG_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setChosenColor(c.hex)}
                      className={`w-4 h-4 rounded-full border-2 ${
                        chosenColor === c.hex
                          ? "border-bone-50"
                          : "border-transparent"
                      }`}
                      style={{ backgroundColor: c.hex }}
                      aria-label={c.name}
                    >
                      {chosenColor === c.hex && (
                        <Check size={8} className="text-white mx-auto" strokeWidth={3} />
                      )}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={createAndAttach}
                  disabled={pending}
                  className="w-full flex items-center justify-center gap-1 py-1 rounded text-2xs font-medium border transition-colors hover:bg-ink-3"
                  style={{ borderColor: chosenColor, color: chosenColor }}
                >
                  {pending ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : (
                    <Plus size={10} />
                  )}
                  Create + add
                </button>
              </div>
            )}
            {filtered.length === 0 && !query.trim() && (
              <div className="px-2.5 py-2 text-2xs text-bone-500">
                Type to search or create
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
