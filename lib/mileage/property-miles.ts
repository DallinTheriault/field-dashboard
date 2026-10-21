import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { drivingMiles, lookupAddress, pointKey, type Point } from "./geo";
import { addressKey, baseOn, mapsUrl } from "./plan";

export type PropertyMiles =
  | { status: "ok"; miles: number; base: string; url: string }
  | { status: "no_base" }
  | { status: "no_address"; address: string }
  | { status: "failed"; base: string; url: string };

/**
 * Driving miles one way from the base in effect on `date` to an address, for
 * checking a property against Google Maps. Uses the same caches as the trips,
 * and fills them.
 */
export async function milesFromBase(
  admin: SupabaseClient,
  clientId: number,
  address: string,
  date: string,
): Promise<PropertyMiles> {
  const { data: bases } = await admin.from("mileage_bases").select("id, address, effective_from").eq("client_id", clientId);
  const base = baseOn(
    date,
    (bases ?? []).map((b) => ({ id: Number(b.id), address: String(b.address), effectiveFrom: String(b.effective_from).slice(0, 10) })),
  );
  if (!base) return { status: "no_base" };
  const url = mapsUrl(base.address, [address], false);

  const point = async (addr: string): Promise<Point | "not_found" | "error"> => {
    const key = addressKey(addr);
    const { data: hit } = await admin
      .from("geocode_cache")
      .select("status, lat, lon")
      .eq("client_id", clientId)
      .eq("address_key", key)
      .maybeSingle();
    if (hit) return hit.status === "ok" ? { lat: Number(hit.lat), lon: Number(hit.lon) } : "not_found";
    const g = await lookupAddress(addr);
    if (g.status === "error") return "error";
    await admin.from("geocode_cache").upsert(
      {
        client_id: clientId,
        address_key: key,
        address: addr,
        status: g.status,
        lat: g.status === "ok" ? g.point.lat : null,
        lon: g.status === "ok" ? g.point.lon : null,
        matched_address: g.status === "ok" ? g.matched : null,
        source: g.status === "ok" ? g.source : null,
      },
      { onConflict: "client_id,address_key" },
    );
    return g.status === "ok" ? g.point : "not_found";
  };

  const a = await point(base.address);
  if (a === "not_found") return { status: "no_address", address: base.address };
  const b = await point(address);
  if (b === "not_found") return { status: "no_address", address };
  if (a === "error" || b === "error") return { status: "failed", base: base.address, url };

  const from = pointKey(a);
  const to = pointKey(b);
  const { data: cached } = await admin
    .from("route_cache")
    .select("miles")
    .eq("client_id", clientId)
    .or(`and(from_point.eq.${from},to_point.eq.${to}),and(from_point.eq.${to},to_point.eq.${from})`)
    .limit(1);
  if (cached?.[0]) return { status: "ok", miles: Math.round(Number(cached[0].miles) * 10) / 10, base: base.address, url };
  const r = await drivingMiles(a, b);
  if (!r) return { status: "failed", base: base.address, url };
  await admin
    .from("route_cache")
    .upsert({ client_id: clientId, from_point: from, to_point: to, miles: Math.round(r.miles * 100) / 100, source: r.source }, {
      onConflict: "client_id,from_point,to_point",
    });
  return { status: "ok", miles: Math.round(r.miles * 10) / 10, base: base.address, url };
}
