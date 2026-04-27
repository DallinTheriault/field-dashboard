import { Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { NotificationDropdown } from "./notification-dropdown";

export function Topbar({
  userEmail,
  businessName,
}: {
  userEmail: string;
  businessName: string;
}) {
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
      <div className="flex items-center gap-3 w-full px-4 md:px-6">
        {/* Search — visual only for V1; will wire to cmd+k later */}
        <div className="flex-1 max-w-md">
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

        <div className="flex-1 md:hidden" />

        {/* Right cluster */}
        <div className="flex items-center gap-2">
          <NotificationDropdown />

          <div className="hidden md:flex items-center gap-2 pl-3 ml-1 border-l border-line">
            <div className="flex flex-col items-end leading-none">
              <span className="text-xs text-bone-100 font-medium">{businessName}</span>
              <span className="text-2xs text-bone-400 mt-0.5">{userEmail}</span>
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
