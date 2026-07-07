"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  Briefcase,
  CalendarDays,
  Calculator,
  Phone,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { FeatureFlags } from "./sidebar";

/**
 * Bottom tab bar on mobile only. Always 4 slots. If sms/calendar features are
 * disabled by admin, those slots are replaced with Calls or Contacts.
 */
const ALL_TABS = [
  { href: "/app", label: "Home", icon: LayoutDashboard, flag: null as keyof FeatureFlags | null },
  { href: "/app/messages", label: "Messages", icon: MessageSquare, flag: "sms" as const },
  { href: "/app/jobs", label: "Jobs", icon: Briefcase, flag: null },
  // Estimating happens on-site — when the module is on it earns a thumb slot.
  { href: "/app/estimator", label: "Estimator", icon: Calculator, flag: "estimator" as const },
  { href: "/app/calendar", label: "Calendar", icon: CalendarDays, flag: "calendar" as const },
] as const;

const FALLBACK_TABS = [
  { href: "/app/contacts", label: "Contacts", icon: Users, flag: null as keyof FeatureFlags | null },
  { href: "/app/calls", label: "Calls", icon: Phone, flag: "voice" as const },
] as const;

export function MobileNav({ featureFlags }: { featureFlags: FeatureFlags }) {
  const pathname = usePathname();

  // Replace disabled slots with fallbacks. Always keep 4 tabs.
  const enabled: Array<{ href: string; label: string; icon: typeof LayoutDashboard }> = [];
  const fallbackQueue = [...FALLBACK_TABS].filter(
    (t) => t.flag === null || featureFlags[t.flag],
  );
  for (const t of ALL_TABS) {
    if (enabled.length >= 4) break; // always exactly 4 tabs
    if (t.flag === null || featureFlags[t.flag]) {
      enabled.push({ href: t.href, label: t.label, icon: t.icon });
    } else if (fallbackQueue.length > 0) {
      const fb = fallbackQueue.shift()!;
      enabled.push({ href: fb.href, label: fb.label, icon: fb.icon });
    }
  }

  return (
    <nav
      className={cn(
        "md:hidden",
        "fixed bottom-0 left-0 right-0 z-30",
        "bg-ink-1/95 backdrop-blur-md",
        "border-t border-line",
        "pl-[max(env(safe-area-inset-left),4px)]",
        "pr-[max(env(safe-area-inset-right),4px)]",
        "pb-[env(safe-area-inset-bottom)]",
      )}
    >
      <ul className="flex items-stretch justify-around">
        {enabled.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href || (href !== "/app" && pathname?.startsWith(href));
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1",
                  "h-16 text-xs font-medium",
                  "px-2",
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
