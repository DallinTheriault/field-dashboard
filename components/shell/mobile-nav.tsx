"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Phone, Briefcase, CalendarDays, Settings } from "lucide-react";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/app", label: "Home", icon: LayoutDashboard },
  { href: "/app/calls", label: "Calls", icon: Phone },
  { href: "/app/jobs", label: "Jobs", icon: Briefcase },
  { href: "/app/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/app/settings", label: "More", icon: Settings },
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
          const active = pathname === href || (href !== "/app" && pathname?.startsWith(href));
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5",
                  "h-14 text-2xs font-medium",
                  active ? "text-field-500" : "text-bone-300",
                )}
              >
                <Icon size={18} strokeWidth={active ? 2.25 : 1.8} />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
