"use client";

import { useEffect, useState, useCallback } from "react";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/cn";

type Theme = "dark" | "light";

const STORAGE_KEY = "field-theme";

/**
 * Inline pre-hydration script that sets data-theme on <html> before React
 * mounts, preventing a flash of the wrong theme. Imported into root layout
 * via <Script strategy="beforeInteractive">.
 */
export const themeBootstrapScript = `
(function() {
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    var prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    var theme = stored || (prefersLight ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const current = (document.documentElement.getAttribute("data-theme") as Theme) || "dark";
    setTheme(current);
    setMounted(true);
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore — private mode etc.
    }
    setTheme(next);
  }, [theme]);

  // Render a placeholder of identical size before mount to avoid layout shift.
  if (!mounted) {
    return (
      <button
        type="button"
        aria-hidden
        className={cn("btn-ghost h-8 w-8 px-0", className)}
        tabIndex={-1}
      >
        <span className="block w-[15px] h-[15px]" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className={cn("btn-ghost h-8 w-8 px-0", className)}
    >
      {theme === "dark" ? (
        <Sun size={15} strokeWidth={1.8} />
      ) : (
        <Moon size={15} strokeWidth={1.8} />
      )}
    </button>
  );
}
