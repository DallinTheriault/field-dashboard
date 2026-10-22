import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GAP_MS, localTurn, type Turn } from "./geo";

/**
 * Turns shared by every server: the database hands out each service's slots
 * at least 1.1 s apart (v102 geo_throttle_slot) and this waits for ours, but
 * never past `deadline`. When the next slot is further off, it says no and
 * takes none, and the lookup waits for the next batch. If the database can't
 * answer, fall back to spacing requests in this process.
 */
export function sharedTurn(admin: SupabaseClient, deadline: number): Turn {
  const local = localTurn(deadline);
  return async (service) => {
    const left = deadline - Date.now();
    if (left <= 0) return false;
    const { data, error } = await admin.rpc("geo_throttle_slot", {
      p_service: service,
      p_gap_ms: GAP_MS,
      p_max_wait_ms: Math.floor(left),
    });
    if (error || typeof data !== "number") {
      console.error("[mileage] shared throttle unavailable, spacing locally", error?.message);
      return local(service);
    }
    if (data < 0) return false;
    if (data > 0) await new Promise((r) => setTimeout(r, data));
    return true;
  };
}
