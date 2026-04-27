import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Surfaces — off-black layered
        ink: {
          0: "#0a0a0a", // page bg
          1: "#111111", // surface-1 (panels, cards)
          2: "#171717", // surface-2 (elevated, drawer, popover)
          3: "#1f1f1f", // surface-3 (inputs, row hover)
          4: "#2a2a2a", // borders heavy
        },
        // Text
        bone: {
          50: "#f7f5f0",   // primary text on dark
          100: "#e8e4dc",  // headings
          300: "#a8a298",  // secondary text
          400: "#6d675e",  // tertiary / placeholder
          500: "#4a453d",  // disabled
        },
        // Primary accent — salmon (the brand color; dominates wherever color appears)
        salmon: {
          50: "#FFF1EE",
          100: "#FFDDD4",
          200: "#FFC0B0",
          300: "#FFA095",
          400: "#FF8585",
          500: "#FF6B6B",   // ★ brand primary
          600: "#E04F4F",
          700: "#CC3F3F",
          800: "#A02C2C",
          900: "#6B1818",
        },
        // Offset accent — lime (used at moments only: featured hover, accent ticks, "wake-up" highlights)
        // Keep usage rare — salmon dominates, lime punctuates.
        lime: {
          50: "#F7FEE7",
          100: "#ECFCCB",
          200: "#D9F99D",
          300: "#BEF264",
          400: "#A3E635",
          500: "#BEF264",   // ★ brand offset (300 stop as primary for visibility on dark)
          600: "#84CC16",
          700: "#65A30D",
          800: "#4D7C0F",
          900: "#365314",
        },
        // Status — muted, purposeful (kept stable across rebrand for UI semantic consistency)
        status: {
          lead: "#c4b454",       // mustard
          estimated: "#7fa27f",  // sage
          scheduled: "#6b8ead",  // slate blue
          progress: "#c88b3d",   // amber
          completed: "#5a8f6f",  // forest
          cancelled: "#6d675e",  // bone-400
          danger: "#c75050",     // brick red
        },
        // Borders
        line: {
          DEFAULT: "#1f1f1f",
          strong: "#2a2a2a",
          subtle: "#141414",
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
        "inset-line": "inset 0 0 0 1px rgba(255,255,255,0.04)",
        glow: "0 0 0 1px rgba(255,107,107,0.35), 0 0 24px -6px rgba(255,107,107,0.45)",
        pop: "0 4px 24px -4px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
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
          "0%": { boxShadow: "0 0 0 0 rgba(255,107,107,0.6)" },
          "70%": { boxShadow: "0 0 0 8px rgba(255,107,107,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(255,107,107,0)" },
        },
      },
      backgroundImage: {
        "grain": "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.06 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
      },
    },
  },
  plugins: [],
};
export default config;
