import { Search } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/ui/logo";
import { NotificationDropdown } from "./notification-dropdown";
import { ThemeToggle } from "./theme-toggle";
import { NavDrawerTrigger } from "./nav-drawer-trigger";

export function Topbar({
  userEmail,
  businessName,
  businessShortName,
  brandLogoUrl,
}: {
  userEmail: string;
  businessName: string;
  businessShortName?: string | null;
  brandLogoUrl?: string | null;
}) {
  // Compact display name: prefer the TTS-friendly short name; fall back to
  // legal business name. Truncated visually if it gets long.
  const displayName = (businessShortName || businessName || "").trim();

  return (
    <header
      className={cn(
        "sticky top-0 z-20",
        "h-14 shrink-0",
        "bg-ink-0/80 backdrop-blur-md",
        "border-b border-line",
        "flex items-center",
      )}
    >
      <div className="flex items-center gap-2 sm:gap-3 w-full px-3 sm:px-4 md:px-6 min-w-0">
        {/* Hamburger trigger — mobile only. The drawer itself is mounted at
            the layout root (NOT here) because backdrop-blur on this header
            creates a containing block that breaks fixed positioning. */}
        <NavDrawerTrigger />

        {/* Field lockup — always visible on mobile, hidden on desktop where the
            sidebar already shows it. Tap to go home. */}
        <Link
          href="/app"
          className="md:hidden shrink-0 flex items-center"
          aria-label="Field home"
        >
          <Logo size="sm" />
        </Link>

        {/* Tenant chip — small logo + short name, visible on every viewport.
            Sits to the right of the Field lockup on mobile, to the left of
            the search bar on desktop. */}
        {displayName && (
          <div
            className={cn(
              "flex items-center gap-1.5 shrink min-w-0",
              "pl-2 sm:pl-3 ml-1 border-l border-line",
            )}
          >
            {brandLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brandLogoUrl}
                alt=""
                className="w-6 h-6 rounded-xs object-contain border-2 border-accent/40 bg-ink-2 shrink-0"
              />
            ) : (
              <span
                aria-hidden
                className="w-6 h-6 rounded-xs border-2 border-accent/40 bg-ink-2 flex items-center justify-center shrink-0 text-[10px] font-mono text-bone-100"
              >
                {displayName.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="text-xs font-medium text-bone-100 truncate max-w-[140px] sm:max-w-[200px]">
              {displayName}
            </span>
          </div>
        )}

        {/* Desktop search */}
        <div className="hidden md:block flex-1 max-w-md ml-2">
          <label className="relative block">
            <span className="sr-only">Search</span>
            <Search
              size={14}
              strokeWidth={2}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-bone-400 pointer-events-none"
            />
            <input
              type="text"
              placeholder="Search calls, jobs, customers…"
              className="!bg-ink-1 !border-line pl-8 pr-16 h-8 text-xs w-full"
            />
            <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-bone-400 border border-line-strong rounded-xs px-1.5 py-0.5 bg-ink-2">
              ⌘K
            </kbd>
          </label>
        </div>

        {/* Spacer pushes right cluster to the edge */}
        <div className="flex-1" />

        {/* Right cluster */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Mobile-only search icon */}
          <button
            type="button"
            aria-label="Search"
            className="md:hidden btn-ghost h-8 w-8 px-0"
          >
            <Search size={15} strokeWidth={1.8} />
          </button>

          <ThemeToggle />
          <NotificationDropdown />

          <div className="hidden md:flex items-center gap-2 pl-3 ml-1 border-l border-line">
            <div className="flex flex-col items-end leading-none">
              <span className="text-2xs text-bone-400">{userEmail}</span>
            </div>
            <form action="/auth/logout" method="POST">
              <button type="submit" className="btn-secondary btn h-8 px-2.5 text-xs">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </div>
    </header>
  );
}
