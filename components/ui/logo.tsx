import { cn } from "@/lib/cn";

/**
 * Field brand logo.
 * Mark: asymmetric four-curve dipole with two charged poles (field-500, lime).
 * Geometry from /assets/01-mark/svg/mark-bone.svg, normalized to a 120×60
 * viewBox for inline tightness next to text.
 *
 * Curves use `currentColor` so the logo automatically flips with the theme:
 * on dark surfaces curves render in bone-50 (light), on light surfaces they
 * render in bone-50 (which in light mode is dark ink). Poles stay in the
 * brand colors (field-500 + lime) regardless of theme — they're identity.
 *
 * The `variant` prop is kept as an override for cases where the logo sits on
 * an explicit dark or light surface that doesn't match the active theme
 * (e.g. always-dark login splash). When omitted, the logo follows the theme.
 *
 * The brand name "field" is always rendered lowercase. Do not capitalize.
 */
export function Logo({
  className,
  showWordmark = true,
  variant,
  size = "md",
}: {
  className?: string;
  showWordmark?: boolean;
  variant?: "bone" | "ink";
  size?: "sm" | "md" | "lg";
}) {
  const polePrimary = "#4A9D8E"; // field-500 — brand primary
  const poleOffset = "#BEF264"; // lime — brand offset

  const dims = {
    sm: { mark: 36, font: "text-[16px]", gap: "gap-1.5" },
    md: { mark: 52, font: "text-[20px]", gap: "gap-2" },
    lg: { mark: 72, font: "text-[28px]", gap: "gap-3" },
  }[size];

  // When variant isn't explicitly set, follow the theme via Tailwind's
  // bone-50 token (which is light on dark, dark on light). When set, use a
  // hardcoded color so the logo can render correctly on a fixed-color surface.
  const wordmarkColorClass =
    variant === "ink"
      ? "text-ink-0"
      : variant === "bone"
      ? "text-bone-50"
      : "text-bone-50"; // theme-aware default

  // SVG curves use currentColor inherited from the parent's text color.
  const svgColorClass =
    variant === "ink"
      ? "text-ink-0"
      : variant === "bone"
      ? "text-bone-50"
      : "text-bone-50";

  return (
    <div className={cn("inline-flex items-center", dims.gap, className)}>
      <svg
        width={dims.mark}
        height={dims.mark / 2}
        viewBox="0 0 120 60"
        fill="none"
        aria-hidden
        className={cn("shrink-0", svgColorClass)}
      >
        {/* Four asymmetric field-line curves between the poles. All curves
            terminate at pole centers (25,30) and (95,30) so the colored
            circles fully cover their endpoints. */}
        <path
          d="M 25 30 Q 50 4 95 30"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M 25 30 Q 72 18 95 30"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M 25 30 Q 48 44 95 30"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M 25 30 Q 74 58 95 30"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        {/* Poles — field-500 (primary) on the left, lime (offset) on the right */}
        <circle cx="25" cy="30" r="3.4" fill={polePrimary} />
        <circle cx="95" cy="30" r="3.4" fill={poleOffset} />
      </svg>
      {showWordmark && (
        <span
          className={cn(
            "font-sans font-medium",
            wordmarkColorClass,
            dims.font,
          )}
          style={{ letterSpacing: "-0.025em" }}
        >
          field
        </span>
      )}
    </div>
  );
}
