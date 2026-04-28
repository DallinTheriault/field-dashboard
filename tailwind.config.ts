import type { Config } from "tailwindcss";

/**
 * Field design tokens.
 *
 * All semantic colors are sourced from CSS custom properties defined in
 * globals.css under [data-theme="dark"] / [data-theme="light"]. This means
 * `bg-ink-0`, `text-bone-100`, `border-field-500` etc. all flip automatically
 * when the theme attribute changes — no `dark:` prefix needed in markup.
 *
 * Each token uses `rgb(var(--token) / <alpha-value>)` so opacity modifiers
 * like `bg-field-500/30` continue to work.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Surfaces — layered from deepest (canvas) to most elevated.
        ink: {
          0: "rgb(var(--ink-0) / <alpha-value>)",
          1: "rgb(var(--ink-1) / <alpha-value>)",
          2: "rgb(var(--ink-2) / <alpha-value>)",
          3: "rgb(var(--ink-3) / <alpha-value>)",
          4: "rgb(var(--ink-4) / <alpha-value>)",
        },
        // Text — primary, headings, secondary, tertiary, disabled.
        bone: {
          50: "rgb(var(--bone-50) / <alpha-value>)",
          100: "rgb(var(--bone-100) / <alpha-value>)",
          300: "rgb(var(--bone-300) / <alpha-value>)",
          400: "rgb(var(--bone-400) / <alpha-value>)",
          500: "rgb(var(--bone-500) / <alpha-value>)",
        },
        // Primary accent — Field teal-green.
        field: {
          50: "rgb(var(--field-50) / <alpha-value>)",
          100: "rgb(var(--field-100) / <alpha-value>)",
          200: "rgb(var(--field-200) / <alpha-value>)",
          300: "rgb(var(--field-300) / <alpha-value>)",
          400: "rgb(var(--field-400) / <alpha-value>)",
          500: "rgb(var(--field-500) / <alpha-value>)",
          600: "rgb(var(--field-600) / <alpha-value>)",
          700: "rgb(var(--field-700) / <alpha-value>)",
          800: "rgb(var(--field-800) / <alpha-value>)",
          900: "rgb(var(--field-900) / <alpha-value>)",
        },
        // Tenant-customizable accent. Falls back to field-500 when the
        // tenant hasn't set a custom color (see globals.css default).
        // Only used in a small set of accent surfaces — metric card stripe,
        // logo border on the topbar, primary CTA hover. Field teal stays
        // the brand color everywhere else.
        accent: "rgb(var(--tenant-accent, var(--field-500)) / <alpha-value>)",
        // Offset accent — kept for the logo's second pole. Used sparingly.
        lime: {
          300: "rgb(var(--lime-300) / <alpha-value>)",
          400: "rgb(var(--lime-400) / <alpha-value>)",
          500: "rgb(var(--lime-500) / <alpha-value>)",
        },
        // Status — muted, purposeful (theme-aware).
        status: {
          lead: "rgb(var(--status-lead) / <alpha-value>)",
          estimated: "rgb(var(--status-estimated) / <alpha-value>)",
          scheduled: "rgb(var(--status-scheduled) / <alpha-value>)",
          progress: "rgb(var(--status-progress) / <alpha-value>)",
          completed: "rgb(var(--status-completed) / <alpha-value>)",
          cancelled: "rgb(var(--status-cancelled) / <alpha-value>)",
          danger: "rgb(var(--status-danger) / <alpha-value>)",
        },
        // Borders.
        line: {
          DEFAULT: "rgb(var(--line) / <alpha-value>)",
          strong: "rgb(var(--line-strong) / <alpha-value>)",
          subtle: "rgb(var(--line-subtle) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.02em" }],
        xs: ["0.75rem", { lineHeight: "1.125rem", letterSpacing: "0.01em" }],
        sm: ["0.8125rem", { lineHeight: "1.25rem" }],
        base: ["0.9375rem", { lineHeight: "1.5rem" }],
        lg: ["1.0625rem", { lineHeight: "1.625rem" }],
        xl: ["1.25rem", { lineHeight: "1.75rem", letterSpacing: "-0.01em" }],
        "2xl": ["1.5rem", { lineHeight: "2rem", letterSpacing: "-0.02em" }],
        "3xl": ["1.875rem", { lineHeight: "2.25rem", letterSpacing: "-0.025em" }],
        "4xl": ["2.375rem", { lineHeight: "2.625rem", letterSpacing: "-0.03em" }],
      },
      spacing: {
        "4.5": "1.125rem",
        "18": "4.5rem",
      },
      borderRadius: {
        xs: "3px",
        sm: "5px",
        DEFAULT: "7px",
        md: "9px",
        lg: "12px",
      },
      boxShadow: {
        "inset-line": "inset 0 0 0 1px rgb(var(--inset-line) / 0.06)",
        glow: "0 0 0 1px rgb(var(--field-500) / 0.35), 0 0 24px -6px rgb(var(--field-500) / 0.45)",
        pop: "0 4px 24px -4px rgb(0 0 0 / 0.5), 0 0 0 1px rgb(var(--inset-line) / 0.06)",
      },
      animation: {
        "fade-in": "fade-in 200ms ease-out",
        "slide-up": "slide-up 240ms cubic-bezier(0.2, 0.9, 0.3, 1)",
        "pulse-ring": "pulse-ring 2s ease-out infinite",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgb(var(--field-500) / 0.6)" },
          "70%": { boxShadow: "0 0 0 8px rgb(var(--field-500) / 0)" },
          "100%": { boxShadow: "0 0 0 0 rgb(var(--field-500) / 0)" },
        },
      },
      backgroundImage: {
        "grain":
          "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.06 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
      },
    },
  },
  plugins: [],
};
export default config;
