"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bell, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";

type Notification = {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  link_url: string | null;
  read_at: string | null;
  created_at: string;
};

const KIND_COLOR: Record<string, string> = {
  estimate_saved: "text-status-estimated",
  booking_saved: "text-status-scheduled",
  booking_rescheduled: "text-status-progress",
  booking_cancelled: "text-status-cancelled",
  message_left: "text-salmon-500",
};

const KIND_LABEL: Record<string, string> = {
  estimate_saved: "Estimate",
  booking_saved: "Booking",
  booking_rescheduled: "Reschedule",
  booking_cancelled: "Cancel",
  message_left: "Message",
};

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function NotificationDropdown() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("notifications")
        .select("id, kind, title, body, link_url, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(15);
      setItems(data ?? []);
      setUnread((data ?? []).filter((n) => n.read_at === null).length);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + polling every 30s when tab is visible
  useEffect(() => {
    load();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 30000);
    return () => clearInterval(interval);
  }, [load]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleClickItem(n: Notification) {
    // Optimistically mark read
    if (!n.read_at) {
      const supabase = createClient();
      await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", n.id);
      setItems((prev) =>
        prev.map((x) =>
          x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x,
        ),
      );
      setUnread((u) => Math.max(0, u - 1));
    }
    setOpen(false);
    if (n.link_url) {
      router.push(n.link_url);
    }
  }

  async function handleMarkAllRead() {
    const supabase = createClient();
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null);
    setItems((prev) =>
      prev.map((n) => ({
        ...n,
        read_at: n.read_at ?? new Date().toISOString(),
      })),
    );
    setUnread(0);
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
        className="btn-ghost h-8 w-8 px-0 relative"
      >
        <Bell size={15} strokeWidth={1.8} />
        {unread > 0 && (
          <span
            className={cn(
              "absolute top-0.5 right-0.5",
              "min-w-[14px] h-[14px] px-1",
              "rounded-full bg-salmon-500",
              "text-[9px] font-bold text-ink-0",
              "flex items-center justify-center",
              "shadow-sm",
            )}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className={cn(
            "absolute right-0 top-10 z-30",
            "w-[360px] max-h-[480px]",
            "panel-elevated overflow-hidden",
            "flex flex-col",
          )}
        >
          {/* Header */}
          <div className="h-10 px-3 flex items-center border-b border-line shrink-0">
            <span className="text-xs font-semibold text-bone-100">
              Notifications
            </span>
            <span className="ml-2 text-2xs text-bone-400">
              {unread > 0 ? `${unread} new` : "all read"}
            </span>
            <div className="ml-auto flex items-center gap-1">
              {unread > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-2xs text-bone-300 hover:text-bone-50 px-2 py-1 rounded-xs"
                >
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn-ghost h-7 w-7 px-0"
                aria-label="Close"
              >
                <X size={12} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="p-6 text-center text-2xs text-bone-400">
                Loading…
              </div>
            ) : items.length === 0 ? (
              <div className="p-6 text-center">
                <Bell
                  size={20}
                  className="mx-auto text-bone-400 mb-2"
                  strokeWidth={1.5}
                />
                <div className="text-xs text-bone-100 font-medium">
                  No notifications yet
                </div>
                <div className="text-2xs text-bone-400 mt-1">
                  When Field captures a call outcome, you&apos;ll see it here.
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-line-subtle">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleClickItem(n)}
                      className={cn(
                        "w-full text-left px-3 py-2.5 flex items-start gap-2.5",
                        "hover:bg-ink-2 transition-colors",
                        !n.read_at && "bg-salmon-500/[0.04]",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-1 w-1.5 h-1.5 rounded-full shrink-0",
                          n.read_at ? "bg-transparent" : "bg-salmon-500",
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span
                            className={cn(
                              "text-2xs font-medium uppercase tracking-wide",
                              KIND_COLOR[n.kind] ?? "text-bone-300",
                            )}
                          >
                            {KIND_LABEL[n.kind] ?? n.kind}
                          </span>
                          <span className="text-2xs text-bone-400 shrink-0">
                            {timeAgo(n.created_at)}
                          </span>
                        </div>
                        <div className="text-xs text-bone-100 font-medium mt-0.5 truncate">
                          {n.title}
                        </div>
                        {n.body && (
                          <div className="text-2xs text-bone-400 mt-0.5 line-clamp-2">
                            {n.body}
                          </div>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
