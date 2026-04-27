import { cn } from "@/lib/cn";

/**
 * Field brand logo.
 * Mark: asymmetric four-curve dipole with two charged poles (salmon, lime).
 * Geometry from /assets/01-mark/svg/mark-bone.svg, normalized to a 120×60
 * viewBox for inline tightness next to text.
 *
 * On dark surfaces use variant="bone" (default). On light surfaces use "ink".
 *
 * The brand name "field" is always rendered lowercase. Do not capitalize.
 */
export function Logo({
  className,
  showWordmark = true,
  variant = "bone",
  size = "md",
}: {
  className?: string;
  showWordmark?: boolean;
  variant?: "bone" | "ink";
  size?: "sm" | "md" | "lg";
}) {
  // Curve color matches the variant (curves are the "lines" of the field);
  // poles stay in brand salmon + lime regardless of variant — they're the brand color.
  const curveColor = variant === "bone" ? "#f7f5f0" : "#0a0a0a";
  const polePrimary = "#FF6B6B"; // salmon — brand primary
  const poleOffset = "#BEF264";  // lime — brand offset

  const dims = {
    sm: { mark: 32, font: "text-[15px]", gap: "gap-1.5" },
    md: { mark: 40, font: "text-[17px]", gap: "gap-2" },
    lg: { mark: 56, font: "text-[24px]", gap: "gap-2.5" },
  }[size];

  return (
    <div className={cn("inline-flex items-center", dims.gap, className)}>
      <svg
        width={dims.mark}
        height={dims.mark / 2}
        viewBox="0 0 120 60"
        fill="none"
        aria-hidden
        className="shrink-0"
      >
        {/* Four asymmetric field-line curves between the poles.
            All curves terminate at pole centers (25,30) and (95,30) so
            the colored circles fully cover their endpoints. The asymmetry
            lives in the middle Q control points. */}
        <path
          d="M 25 30 Q 50 4 95 30"
          stroke={curveColor}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M 25 30 Q 72 18 95 30"
          stroke={curveColor}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M 25 30 Q 48 44 95 30"
          stroke={curveColor}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M 25 30 Q 74 58 95 30"
          stroke={curveColor}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        {/* Poles — salmon (primary) on the left, lime (offset) on the right */}
        <circle cx="25" cy="30" r="3.4" fill={polePrimary} />
        <circle cx="95" cy="30" r="3.4" fill={poleOffset} />
      </svg>
      {showWordmark && (
        <span
          className={cn(
            "font-sans font-medium",
            variant === "bone" ? "text-bone-50" : "text-ink-0",
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
