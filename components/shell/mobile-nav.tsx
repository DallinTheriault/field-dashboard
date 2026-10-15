"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Briefcase,
  CalendarDays,
  Calculator,
  MoreHorizontal,
  Receipt,
  Settings,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { FeatureFlags } from "./sidebar";
import { activeHref } from "./nav-active";

type Item = { href: string; label: string; icon: typeof LayoutDashboard; flag: keyof FeatureFlags | null };

/** The phone's bottom bar: the four places you go all day, then More. */
const TABS: Item[] = [
  { href: "/app", label: "Home", icon: LayoutDashboard, flag: null },
  { href: "/app/jobs", label: "Jobs", icon: Briefcase, flag: null },
  { href: "/app/calendar", label: "Calendar", icon: CalendarDays, flag: "calendar" },
  { href: "/app/estimator/invoices", label: "Invoices", icon: Receipt, flag: "estimator" },
];

const MORE: Item[] = [
  { href: "/app/contacts", label: "Contacts", icon: Users, flag: null },
  { href: "/app/estimator", label: "Business", icon: Calculator, flag: "estimator" },
  { href: "/app/settings", label: "Settings", icon: Settings, flag: null },
];

export function MobileNav({ featureFlags }: { featureFlags: FeatureFlags }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const on = (i: Item) => i.flag === null || featureFlags[i.flag];
  const tabs = TABS.filter(on);
  const more = MORE.filter(on);
  const current = activeHref(pathname, [...tabs, ...more].map((t) => t.href));
  const moreActive = more.some((m) => m.href === current);

  // Close the sheet on navigation and on Escape.
  useEffect(() => setMoreOpen(false), [pathname]);
  useEffect(() => {
    if (!moreOpen) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setMoreOpen(false);
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [moreOpen]);

  const tabClass = (active: boolean) =>
    cn(
      "flex flex-col items-center justify-center gap-1 w-full",
      "h-16 text-xs font-medium px-1",
      active ? "text-field-500" : "text-bone-300",
    );

  return (
    <>
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-30" onClick={() => setMoreOpen(false)} aria-hidden="true">
          <div className="absolute inset-0 bg-black/40" />
        </div>
      )}
      {moreOpen && (
        <div
          id="more-sheet"
          role="dialog"
          aria-label="More"
          className={cn(
            "md:hidden fixed left-0 right-0 z-40 bottom-[calc(4rem+env(safe-area-inset-bottom))]",
            "bg-ink-1 border-t border-line rounded-t-md shadow-lg",
          )}
        >
          <div className="flex items-center px-4 pt-2">
            <span className="label-eyebrow flex-1">More</span>
            <button
              type="button"
              onClick={() => setMoreOpen(false)}
              aria-label="Close"
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-bone-300"
            >
              <X size={18} />
            </button>
          </div>
          <ul className="pb-2">
            {more.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-3 px-4 min-h-[52px] text-sm",
                    href === current ? "text-field-500" : "text-bone-100",
                  )}
                >
                  <Icon size={18} />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <nav
        className={cn(
          "md:hidden",
          "fixed bottom-0 left-0 right-0 z-40",
          "bg-ink-1/95 backdrop-blur-md",
          "border-t border-line",
          "pl-[max(env(safe-area-inset-left),4px)]",
          "pr-[max(env(safe-area-inset-right),4px)]",
          "pb-[env(safe-area-inset-bottom)]",
        )}
        aria-label="Main"
      >
        <ul className="flex items-stretch justify-around">
          {tabs.map(({ href, label, icon: Icon }) => {
            const active = href === current;
            return (
              <li key={href} className="flex-1">
                <Link href={href} className={tabClass(active)} aria-current={active ? "page" : undefined}>
                  <Icon size={22} strokeWidth={active ? 2.25 : 1.8} />
                  <span>{label}</span>
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              aria-expanded={moreOpen}
              aria-controls="more-sheet"
              className={tabClass(moreActive || moreOpen)}
            >
              <MoreHorizontal size={22} strokeWidth={moreActive ? 2.25 : 1.8} />
              <span>More</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
