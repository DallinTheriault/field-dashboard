import type { SyncResult } from "@/lib/mileage/sync";

/**
 * One batch of trip lookups, through /api/estimator/mileage/sync rather than
 * a server action, so it never holds up a tap while it waits on the map
 * services. `keepalive` lets a batch started on the way out of a page finish.
 */
export async function syncTripsBatch(opts: { keepalive?: boolean } = {}): Promise<
  { ok: true; data: SyncResult } | { ok: false; error: string }
> {
  try {
    const res = await fetch("/api/estimator/mileage/sync", { method: "POST", keepalive: opts.keepalive });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: body?.error ?? `Couldn't work out trips (${res.status}).` };
    return { ok: true, data: body as SyncResult };
  } catch {
    return { ok: false, error: "Couldn't reach Field to work out trips." };
  }
}
