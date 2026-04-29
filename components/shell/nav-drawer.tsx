"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  LayoutDashboard,
  Phone,
  Briefcase,
  Users,
  MessageSquare,
  CalendarDays,
  CreditCard,
  Settings,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/ui/logo";
import packageJson from "../../package.json";

const APP_VERSION = `v${packageJson.version}`;

const NAV = [
  { href: "/app", label: "Overview", icon: LayoutDashboard },
  { href: "/app/calls", label: "Calls", icon: Phone },
  { href: "/app/jobs", label: "Jobs", icon: Briefcase },
  { href: "/app/contacts", label: "Contacts", icon: Users },
  { href: "/app/messages", label: "Messages", icon: MessageSquare },
  { href: "/app/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/app/billing", label: "Billing", icon: CreditCard },
  { href: "/app/settings", label: "Settings", icon: Settings },
] as const;

/**
 * Mobile-only hamburger menu. Trigger button lives in the topbar (left side,
 * shown only on `md:hidden`). Tapping it opens a drawer covering the left
 * 80% of the screen with the full navigation list. Tapping outside or
 * navigating closes it.
 *
 * Desktop never uses this — the always-visible left sidebar serves the
 * same purpose there.
 */
export function NavDrawer({
  userEmail,
  isAdmin = false,
}: {
  userEmail: string;
  isAdmin?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while open
  useEffect(() => {
    if (open) {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="md:hidden btn-ghost h-9 w-9 px-0 shrink-0"
      >
        <Menu size={18} strokeWidth={1.8} />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Drawer */}
      <aside
        ref={drawerRef}
        className={cn(
          "md:hidden",
          "fixed top-0 left-0 z-50 h-full",
          "w-[82%] max-w-xs",
          "bg-ink-1 border-r border-line",
          "flex flex-col",
          "transition-transform duration-200 ease-out",
          "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
          open ? "translate-x-0" : "-translate-x-full pointer-events-none",
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        {/* Drawer header — Field lockup + close */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-line shrink-0">
          <Link href="/app" onClick={() => setOpen(false)} aria-label="Field home">
            <Logo size="sm" />
          </Link>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="btn-ghost h-9 w-9 px-0"
          >
            <X size={18} strokeWidth={1.8} />
          </button>
        </div>

        {/* Nav list */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <ul className="space-y-0.5">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active =
                pathname === href ||
                (href !== "/app" && pathname?.startsWith(href));
              return (
                <li key={href}>
                  <Link
                    href={href}
                    className={cn(
                      "flex items-center gap-3 px-3 h-11 rounded-sm text-sm",
                      active
                        ? "bg-field-500/10 text-field-500 font-medium"
                        : "text-bone-100 hover:bg-ink-2",
                    )}
                  >
                    <Icon size={17} strokeWidth={active ? 2.25 : 1.8} />
                    {label}
                  </Link>
                </li>
              );
            })}

            {isAdmin && (
              <li className="pt-2 mt-2 border-t border-line-subtle">
                <Link
                  href="/admin"
                  className="flex items-center gap-3 px-3 h-11 rounded-sm text-sm text-field-500"
                >
                  <ShieldCheck size={17} strokeWidth={1.8} />
                  Admin console
                </Link>
              </li>
            )}
          </ul>
        </nav>

        {/* Drawer footer — user email, sign out, version */}
        <div className="border-t border-line px-3 py-3 shrink-0 space-y-2">
          <div className="text-2xs text-bone-400 px-1 truncate">{userEmail}</div>
          <form action="/auth/logout" method="POST">
            <button
              type="submit"
              className="btn-secondary text-xs h-9 w-full justify-start gap-2"
            >
              <LogOut size={13} />
              Sign out
            </button>
          </form>
          <div className="flex items-center justify-between px-1 pt-1">
            <span className="text-2xs text-bone-500 font-mono">{APP_VERSION}</span>
            <span className="text-2xs text-bone-500 font-mono">field</span>
          </div>
        </div>
      </aside>
    </>
  );
}
