import { getTenantContext } from "@/lib/supabase/request-cache";

/**
 * Tenant-timezone date rendering for SERVER components.
 *
 * Server components render on Netlify where the process timezone is UTC —
 * naive toLocaleString()/toDateString() calls silently produced UTC dates
 * and times (a 7:00 PM Mountain job displayed as July 8, 1:00 AM). Every
 * server-rendered timestamp must format through the tenant's IANA timezone
 * (Clients.timezone — the same value the AI receptionist books against).
 *
 * Client components ("use client") are unaffected: the browser's timezone
 * is the right one there.
 */

export async function getTenantTimezone(): Promise<string> {
  // Rides the per-request tenant-context fetch — no dedicated round-trip.
  const ctx = await getTenantContext();
  return ctx?.timezone || "America/Denver";
}

type DateInput = string | number | Date;

export function fmtInTz(
  d: DateInput,
  tz: string,
  opts: Intl.DateTimeFormatOptions,
): string {
  return new Date(d).toLocaleString("en-US", { ...opts, timeZone: tz });
}

/** "Jul 7" style. */
export function fmtDayShort(d: DateInput, tz: string): string {
  return fmtInTz(d, tz, { month: "short", day: "numeric" });
}

/** "Jul 7, 2026, 7:00 PM" style. */
export function fmtDateTime(d: DateInput, tz: string): string {
  return fmtInTz(d, tz, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "7:00 PM" style. */
export function fmtTime(d: DateInput, tz: string): string {
  return fmtInTz(d, tz, { hour: "numeric", minute: "2-digit" });
}

/**
 * Calendar-date key ("2026-07-07") of an instant in a timezone — the ONLY
 * safe way to group timestamps into day buckets server-side.
 */
export function dayKeyInTz(d: DateInput, tz: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(d));
}
