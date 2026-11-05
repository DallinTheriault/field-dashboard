"use client";

import { useEffect, useState } from "react";

/**
 * Works around an app-router stall: after a server action (or a router
 * refresh) the new page arrives but sometimes isn't put on screen until
 * something else re-renders. Measured on prod: "Mark paid outside Field"
 * showed Paid within 12 s in 7 runs of 8; the 8th waited for the next tap.
 * The action's answer already held the updated page each time. The
 * notification bell's 30-second poll had been that "something else"; with it
 * gone, a stalled page would stay stale until the next tap.
 *
 * This re-renders itself (no request, nothing visible) a few times right
 * after each router or action response has fully arrived, which is enough
 * for the waiting update to show.
 */
const NUDGES_MS = [0, 150, 500, 1500];

export function RouterSettle() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const original = window.fetch;
    const timers = new Set<number>();
    const nudge = () => {
      for (const ms of NUDGES_MS) {
        const t = window.setTimeout(() => {
          timers.delete(t);
          setTick((n) => n + 1);
        }, ms);
        timers.add(t);
      }
    };
    const isRouterRequest = (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      return headers.has("next-action") || headers.has("rsc");
    };
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await original(input, init);
      if (isRouterRequest(input, init)) {
        // After the whole answer has arrived (it streams), not just its headers.
        res
          .clone()
          .arrayBuffer()
          .then(nudge, nudge);
      }
      return res;
    };
    return () => {
      window.fetch = original;
      for (const t of timers) window.clearTimeout(t);
    };
  }, []);
  return null;
}
