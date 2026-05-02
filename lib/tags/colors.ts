/**
 * Field tag color system.
 *
 * 16 visually distinct colors selected to be readable on dark background
 * (--ink-0 = #0A0A0A) at small sizes (10-12px chip text). Colors cycle
 * deterministically based on position in the palette so new tags get
 * the next unused color.
 *
 * After 16 tags created, colors repeat. The eye can only meaningfully
 * distinguish ~12 hues anyway — repetition is a feature, not a bug.
 */

export type TagColor = {
  /** Hex value used as the chip background fill */
  hex: string;
  /** Human-readable name for tooltips and color picker UI */
  name: string;
};

export const TAG_COLORS: readonly TagColor[] = [
  { hex: "#4A9D8E", name: "teal" },        // brand primary
  { hex: "#5DC97D", name: "green" },        // brand secondary
  { hex: "#E85C43", name: "coral" },        // warm accent
  { hex: "#F5A623", name: "amber" },
  { hex: "#9B6BCC", name: "violet" },
  { hex: "#3B82F6", name: "blue" },
  { hex: "#EC4899", name: "pink" },
  { hex: "#14B8A6", name: "cyan" },
  { hex: "#84CC16", name: "lime" },
  { hex: "#F97316", name: "orange" },
  { hex: "#A78BFA", name: "lavender" },
  { hex: "#EAB308", name: "yellow" },
  { hex: "#06B6D4", name: "sky" },
  { hex: "#D946EF", name: "magenta" },
  { hex: "#10B981", name: "emerald" },
  { hex: "#64748B", name: "slate" },
] as const;

/**
 * Return the next color from the palette, given the current count of tags
 * already created. Wraps at 16. Used when creating new tags so they get
 * deterministically assigned a fresh color.
 */
export function nextTagColor(existingCount: number): string {
  return TAG_COLORS[existingCount % TAG_COLORS.length].hex;
}

/**
 * Compute a contrasting text color (ink-pure or bone-50) for a given hex
 * background. Used so chip text stays readable across the palette.
 *
 * Simple luminance check — full WCAG contrast calc is overkill for this.
 */
export function tagTextColor(bgHex: string): "#0A0A0A" | "#F7F5F0" {
  const hex = bgHex.replace("#", "");
  if (hex.length !== 6) return "#F7F5F0";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#0A0A0A" : "#F7F5F0";
}
