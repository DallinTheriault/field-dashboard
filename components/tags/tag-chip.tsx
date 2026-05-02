"use client";

import { X } from "lucide-react";
import type { Tag } from "@/lib/tags/types";
import { tagTextColor } from "@/lib/tags/colors";

/**
 * Display a colored tag chip. Background = tag.color_hex, text contrast
 * computed from luminance. Sized larger than v0.6.0 chips for better
 * visibility per user feedback.
 */
export function TagChip({
  tag,
  onRemove,
  size = "default",
}: {
  tag: Tag;
  onRemove?: () => void;
  size?: "sm" | "default" | "lg";
}) {
  const textColor = tagTextColor(tag.color_hex);
  const sizeClasses = {
    sm: "text-[11px] px-2 py-0.5",
    default: "text-xs px-2.5 py-1",
    lg: "text-sm px-3 py-1.5",
  }[size];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${sizeClasses}`}
      style={{ backgroundColor: tag.color_hex, color: textColor }}
    >
      {tag.name}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="hover:opacity-70 transition-opacity"
          aria-label={`Remove ${tag.name} tag`}
          style={{ color: textColor }}
        >
          <X size={size === "sm" ? 10 : size === "lg" ? 14 : 12} strokeWidth={2.5} />
        </button>
      )}
    </span>
  );
}

/**
 * Render a list of tags as chips with optional max-visible truncation.
 */
export function TagChipList({
  tags,
  maxVisible,
  size = "default",
}: {
  tags: Tag[];
  maxVisible?: number;
  size?: "sm" | "default" | "lg";
}) {
  if (tags.length === 0) return null;
  const visible = maxVisible ? tags.slice(0, maxVisible) : tags;
  const hidden = maxVisible && tags.length > maxVisible ? tags.length - maxVisible : 0;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((tag) => (
        <TagChip key={tag.id} tag={tag} size={size} />
      ))}
      {hidden > 0 && (
        <span className="text-xs text-bone-500">+{hidden}</span>
      )}
    </div>
  );
}
