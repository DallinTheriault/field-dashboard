"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Phone,
  Briefcase,
  CalendarDays,
  MessageSquare,
  Users,
  Settings,
  CreditCard,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/ui/logo";
import packageJson from "../../package.json";

const APP_VERSION = `v${packageJson.version}`;

const NAV = [
  { href: "/app", label: "Overview", icon: LayoutDashboard, soon: false },
  { href: "/app/calls", label: "Calls", icon: Phone, soon: false },
  { href: "/app/jobs", label: "Jobs", icon: Briefcase, soon: false },
  { href: "/app/contacts", label: "Contacts", icon: Users, soon: false },
  { href: "/app/messages", label: "Messages", icon: MessageSquare, soon: true },
  { href: "/app/calendar", label: "Calendar", icon: CalendarDays, soon: false },
  { href: "/app/billing", label: "Billing", icon: CreditCard, soon: false },
  { href: "/app/settings", label: "Settings", icon: Settings, soon: false },
] as const;

export function Sidebar({
  businessName,
  planStatus,
  isAdmin = false,
}: {
  businessName: string;
  planStatus: "active" | "past_due" | "paused" | "cancelled" | "trialing" | "incomplete";
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  return (
    <aside
      className={cn(
        "hidden md:flex md:flex-col",
        "w-56 shrink-0",
        "bg-ink-1 border-r border-line",
        "sticky top-0 h-screen",
      )}
    >
      {/* Brand block */}
      <div className="h-14 px-4 flex items-center border-b border-line">
        <Logo />
      </div>

      {/* Tenant context */}
      <div className="px-4 py-3 border-b border-line">
        <div className="label-eyebrow">Business</div>
        <div className="mt-0.5 text-sm text-bone-100 font-medium truncate">
          {businessName}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              planStatus === "active" && "bg-status-completed",
              planStatus === "trialing" && "bg-status-scheduled",
              planStatus === "past_due" && "bg-status-danger animate-pulse",
              planStatus === "paused" && "bg-bone-400",
              planStatus === "cancelled" && "bg-bone-500",
              planStatus === "incomplete" && "bg-status-lead",
            )}
          />
          <span className="text-2xs uppercase tracking-wide text-bone-300 font-medium">
            {planStatus.replace("_", " ")}
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon, soon }) => {
          const active = pathname === href || (href !== "/app" && pathname?.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 px-2.5 h-8 rounded-sm",
                "text-sm font-medium",
                "transition-colors",
                active
                  ? "bg-ink-3 text-bone-50 shadow-inset-line"
                  : "text-bone-300 hover:text-bone-50 hover:bg-ink-2",
              )}
            >
              <Icon
                size={15}
                strokeWidth={active ? 2.25 : 1.8}
                className={cn(active ? "text-field-500" : "text-bone-400")}
              />
              <span className="flex-1">{label}</span>
              {soon && (
                <span className="text-[9px] uppercase tracking-wide text-bone-400 border border-line-strong rounded-xs px-1 py-0.5">
                  soon
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer — admin link (if admin) + version + docs */}
      <div className="px-4 py-3 border-t border-line space-y-2">
        {isAdmin && (
          <Link
            href="/admin"
            className="flex items-center gap-2 text-2xs text-field-500 hover:text-field-400"
          >
            <ShieldCheck size={11} />
            <span className="font-medium uppercase tracking-wide">Admin</span>
          </Link>
        )}
        <div className="flex items-center justify-between">
          <span className="text-2xs text-bone-400 font-mono">{APP_VERSION}</span>
          <span className="text-2xs text-bone-400">field</span>
        </div>
      </div>
    </aside>
  );
}
