"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
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
import { NAV_DRAWER_OPEN_EVENT } from "./nav-drawer-trigger";

const APP_VERSION = `v${packageJson.version}`;

import type { FeatureFlags } from "./sidebar";

const ALL_NAV = [
  { href: "/app", label: "Overview", icon: LayoutDashboard, flag: null as keyof FeatureFlags | null },
  { href: "/app/calls", label: "Calls", icon: Phone, flag: "voice" as const },
  { href: "/app/jobs", label: "Jobs", icon: Briefcase, flag: null },
  { href: "/app/contacts", label: "Contacts", icon: Users, flag: null },
  { href: "/app/messages", label: "Messages", icon: MessageSquare, flag: "sms" as const },
  { href: "/app/calendar", label: "Calendar", icon: CalendarDays, flag: "calendar" as const },
  { href: "/app/billing", label: "Billing", icon: CreditCard, flag: "billing" as const },
  { href: "/app/settings", label: "Settings", icon: Settings, flag: null },
] as const;

/**
 * Mobile-only side drawer rendered at the layout root (NOT inside topbar).
 */
export function NavDrawer({
  userEmail,
  isAdmin = false,
  featureFlags,
}: {
  userEmail: string;
  isAdmin?: boolean;
  featureFlags: FeatureFlags;
}) {
  const NAV = ALL_NAV.filter(
    (item) => item.flag === null || featureFlags[item.flag],
  );
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Listen for the trigger event
  useEffect(() => {
    function handler() {
      setOpen(true);
    }
    window.addEventListener(NAV_DRAWER_OPEN_EVENT, handler);
    return () => window.removeEventListener(NAV_DRAWER_OPEN_EVENT, handler);
  }, []);

  // Close on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while open. iOS Safari ignores overflow:hidden for
  // touch scrolling — we also pin the body with position:fixed at the
  // current scroll offset, which is the documented workaround. We restore
  // the scroll position on close.
  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    const body = document.body;
    const originalOverflow = body.style.overflow;
    const originalPosition = body.style.position;
    const originalTop = body.style.top;
    const originalWidth = body.style.width;

    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";

    return () => {
      body.style.overflow = originalOverflow;
      body.style.position = originalPosition;
      body.style.top = originalTop;
      body.style.width = originalWidth;
      // Restore scroll position
      window.scrollTo(0, scrollY);
    };
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
      {/* Backdrop */}
      <div
        className={cn(
          "md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]",
          "transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        onClick={() => setOpen(false)}
        // Prevent touchmove on the backdrop from scrolling content
        // underneath. Defensive — body lock above already handles this on
        // iOS, but cheap insurance.
        onTouchMove={(e) => e.preventDefault()}
        aria-hidden
      />

      {/* Drawer */}
      <aside
        className={cn(
          "md:hidden",
          "fixed top-0 left-0 z-50 h-full",
          "w-[82%] max-w-xs",
          "bg-ink-1 border-r border-line",
          "flex flex-col",
          "transition-transform duration-200 ease-out",
          "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        aria-hidden={!open}
      >
        {/* Drawer header */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-line shrink-0">
          <Link href="/app" aria-label="Field home">
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

        {/* Drawer footer */}
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
