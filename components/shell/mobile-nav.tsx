"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  Briefcase,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Bottom-of-screen tab bar on mobile only. Holds the 4 most-frequent daily
 * destinations. Everything else (Calls, Contacts, Billing, Settings, sign
 * out, version) lives in the hamburger menu drawer triggered from the
 * topbar — see <NavDrawer />.
 *
 * Kept at 4 slots (not 5) so each tap target is generous and to leave the
 * top bar's hamburger as the single canonical "all of nav" entry point.
 */
const TABS = [
  { href: "/app", label: "Home", icon: LayoutDashboard },
  { href: "/app/messages", label: "Messages", icon: MessageSquare },
  { href: "/app/jobs", label: "Jobs", icon: Briefcase },
  { href: "/app/calendar", label: "Calendar", icon: CalendarDays },
] as const;

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      className={cn(
        "md:hidden",
        "fixed bottom-0 left-0 right-0 z-30",
        "bg-ink-1/95 backdrop-blur-md",
        "border-t border-line",
        "pb-[env(safe-area-inset-bottom)]",
      )}
    >
      <ul className="flex items-stretch justify-around">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href || (href !== "/app" && pathname?.startsWith(href));
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1",
                  "h-16 text-xs font-medium",
                  active ? "text-field-500" : "text-bone-300",
                )}
              >
                <Icon size={22} strokeWidth={active ? 2.25 : 1.8} />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
