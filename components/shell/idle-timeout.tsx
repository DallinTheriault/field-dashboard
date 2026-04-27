"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AlertCircle } from "lucide-react";

// Configurable thresholds. Conservative for business data.
const IDLE_LIMIT_MS = 30 * 60 * 1000; // 30 minutes
const WARN_AT_MS = 25 * 60 * 1000; // Warn at 25 min (5 min remaining)
const TICK_MS = 10 * 1000; // Check every 10s
const STORAGE_KEY = "field.lastActivity";

export function IdleTimeout() {
  const router = useRouter();
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const lastActivityRef = useRef<number>(Date.now());

  const recordActivity = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    try {
      localStorage.setItem(STORAGE_KEY, String(now));
    } catch {
      // localStorage might be disabled; in-memory ref is the source of truth
    }
    if (showWarning) setShowWarning(false);
  }, [showWarning]);

  const stayActive = useCallback(() => {
    recordActivity();
  }, [recordActivity]);

  const forceLogout = useCallback(async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    router.replace("/login?reason=idle");
    router.refresh();
  }, [router]);

  // Initialize from cross-tab storage so multiple tabs share an idle clock
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const t = parseInt(stored, 10);
        if (!Number.isNaN(t)) lastActivityRef.current = t;
      } else {
        recordActivity();
      }
    } catch {
      recordActivity();
    }
  }, [recordActivity]);

  // Activity listeners — any of these resets the timer
  useEffect(() => {
    const events: (keyof DocumentEventMap)[] = [
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "click",
    ];
    const handler = () => recordActivity();
    for (const e of events) document.addEventListener(e, handler, { passive: true });

    // Cross-tab sync via storage events
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        const t = parseInt(e.newValue, 10);
        if (!Number.isNaN(t) && t > lastActivityRef.current) {
          lastActivityRef.current = t;
          if (showWarning) setShowWarning(false);
        }
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      for (const e of events) document.removeEventListener(e, handler);
      window.removeEventListener("storage", onStorage);
    };
  }, [recordActivity, showWarning]);

  // Tick — checks idle duration and decides whether to warn or log out
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const idle = now - lastActivityRef.current;

      if (idle >= IDLE_LIMIT_MS) {
        forceLogout();
        return;
      }

      if (idle >= WARN_AT_MS) {
        setShowWarning(true);
        setSecondsLeft(Math.ceil((IDLE_LIMIT_MS - idle) / 1000));
      } else if (showWarning) {
        setShowWarning(false);
      }
    }, TICK_MS);

    return () => clearInterval(id);
  }, [forceLogout, showWarning]);

  if (!showWarning) return null;

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 pointer-events-none">
      <div
        role="alertdialog"
        aria-live="assertive"
        className="panel-elevated pointer-events-auto max-w-md w-full p-4 flex items-start gap-3 border border-status-danger/40"
      >
        <AlertCircle
          size={18}
          className="text-status-danger shrink-0 mt-0.5"
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-bone-50">
            You&apos;ll be signed out for inactivity
          </div>
          <div className="text-xs text-bone-300 mt-0.5">
            Signing out in{" "}
            <span className="num font-mono text-bone-50">
              {mins}:{String(secs).padStart(2, "0")}
            </span>
            . Move your mouse or click anywhere to stay signed in.
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={stayActive}
              className="btn-primary h-8 px-3 text-xs"
            >
              Stay signed in
            </button>
            <button
              type="button"
              onClick={forceLogout}
              className="btn-ghost h-8 px-3 text-xs"
            >
              Sign out now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
