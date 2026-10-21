import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { localTurn, NOMINATIM_GAP_MS, type WaitTurn } from "./geo";

/**
 * A Nominatim turn shared by every server: the database hands out slots at
 * least 1.1 s apart (v101 geo_throttle_slot) and this waits for ours. If the
 * database can't answer, fall back to spacing requests in this process.
 */
export function sharedNominatimTurn(admin: SupabaseClient): WaitTurn {
  return async () => {
    const { data, error } = await admin.rpc("geo_throttle_slot", { p_service: "nominatim", p_gap_ms: NOMINATIM_GAP_MS });
    if (error || typeof data !== "number") {
      console.error("[mileage] shared throttle unavailable, spacing locally", error?.message);
      return localTurn();
    }
    if (data > 0) await new Promise((r) => setTimeout(r, data));
  };
}
