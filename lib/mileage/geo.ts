/**
 * Addresses to points, and driving miles between points. Keyless public
 * services only:
 *   geocoding  US Census geocoder; when it has no match, OpenStreetMap's
 *              Nominatim, but only on an exact house-number match (never a
 *              street or a town centre: an address that won't place is
 *              flagged, not guessed)
 *   routing    Valhalla (FOSSGIS), with the OSRM demo server as the backup
 *
 * Callers cache every answer (lib/mileage/sync.ts), so each address and each
 * pair of points is looked up once. Server only.
 */

export type Point = { lat: number; lon: number };

export type Geocode =
  | { status: "ok"; point: Point; matched: string; source: "census" | "nominatim" }
  | { status: "not_found" }
  /** The services couldn't be reached: try again later, don't cache. */
  | { status: "error" };

export type Route = { miles: number; source: "valhalla" | "osrm" };

const UA = "FieldApp/1.0 (+https://app.getfield.co)";
const TIMEOUT_MS = 8000;
const METERS_PER_MILE = 1609.344;

// Overridable for the local stack (scripts/local-stack/geo-mock.mjs).
const CENSUS = () => process.env.GEO_CENSUS_URL ?? "https://geocoding.geo.census.gov/geocoder";
const NOMINATIM = () => process.env.GEO_NOMINATIM_URL ?? "https://nominatim.openstreetmap.org";
const VALHALLA = () => process.env.ROUTE_VALHALLA_URL ?? "https://valhalla1.openstreetmap.de";
const OSRM = () => process.env.ROUTE_OSRM_URL ?? "https://router.project-osrm.org";

async function getJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    headers: { "user-agent": UA, accept: "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

/** Nominatim's policy: at most one request a second. */
let nominatimNext = 0;
async function nominatimTurn() {
  const wait = nominatimNext - Date.now();
  nominatimNext = Math.max(Date.now(), nominatimNext) + 1100;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

async function census(address: string): Promise<Geocode> {
  const q = new URLSearchParams({ address, benchmark: "Public_AR_Current", format: "json" });
  const j = (await getJson(`${CENSUS()}/locations/onelineaddress?${q}`)) as {
    result?: { addressMatches?: Array<{ matchedAddress: string; coordinates: { x: number; y: number } }> };
  };
  const m = j.result?.addressMatches?.[0];
  if (!m) return { status: "not_found" };
  return { status: "ok", point: { lat: m.coordinates.y, lon: m.coordinates.x }, matched: m.matchedAddress, source: "census" };
}

/** The leading house number of an address ("2376 W 12920 S" → "2376"), or null. */
export function houseNumber(address: string): string | null {
  return address.trim().match(/^(\d+[A-Za-z]?)\b/)?.[1]?.toLowerCase() ?? null;
}

async function nominatim(address: string): Promise<Geocode> {
  const want = houseNumber(address);
  if (!want) return { status: "not_found" };
  await nominatimTurn();
  const q = new URLSearchParams({ q: address, format: "json", addressdetails: "1", limit: "3", countrycodes: "us" });
  const rows = (await getJson(`${NOMINATIM()}/search?${q}`)) as Array<{
    lat: string;
    lon: string;
    display_name: string;
    address?: { house_number?: string; postcode?: string };
  }>;
  const zip = address.match(/\b(\d{5})(?:-\d{4})?\s*$/)?.[1] ?? null;
  const hit = rows.find((r) => {
    const numbers = (r.address?.house_number ?? "").toLowerCase().split(/[;,]/).map((s) => s.trim());
    if (!numbers.includes(want)) return false;
    return !zip || !r.address?.postcode || r.address.postcode.startsWith(zip);
  });
  if (!hit) return { status: "not_found" };
  return { status: "ok", point: { lat: Number(hit.lat), lon: Number(hit.lon) }, matched: hit.display_name, source: "nominatim" };
}

/**
 * Not found only when both services answered and neither placed it; if either
 * couldn't be reached, it's an error to retry later, never cached as missing.
 */
export async function lookupAddress(address: string): Promise<Geocode> {
  let censusAnswered = false;
  try {
    const c = await census(address);
    if (c.status === "ok") return c;
    censusAnswered = true;
  } catch (e) {
    console.error("[mileage] census geocoder failed", e instanceof Error ? e.message : e);
  }
  try {
    const n = await nominatim(address);
    if (n.status === "ok") return n;
    return censusAnswered ? { status: "not_found" } : { status: "error" };
  } catch (e) {
    console.error("[mileage] nominatim failed", e instanceof Error ? e.message : e);
    return { status: "error" };
  }
}

async function valhalla(a: Point, b: Point): Promise<number> {
  const body = {
    locations: [
      { lat: a.lat, lon: a.lon },
      { lat: b.lat, lon: b.lon },
    ],
    costing: "auto",
    units: "miles",
  };
  const j = (await getJson(`${VALHALLA()}/route`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })) as { trip?: { summary?: { length?: number } } };
  const miles = j.trip?.summary?.length;
  if (typeof miles !== "number" || !Number.isFinite(miles)) throw new Error("no route");
  return miles;
}

async function osrm(a: Point, b: Point): Promise<number> {
  const j = (await getJson(`${OSRM()}/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`)) as {
    code?: string;
    routes?: Array<{ distance: number }>;
  };
  const meters = j.routes?.[0]?.distance;
  if (j.code !== "Ok" || typeof meters !== "number") throw new Error(j.code ?? "no route");
  return meters / METERS_PER_MILE;
}

/** Driving miles from a to b: Valhalla, then OSRM when Valhalla is down. Null when both fail. */
export async function drivingMiles(a: Point, b: Point): Promise<Route | null> {
  try {
    return { miles: await valhalla(a, b), source: "valhalla" };
  } catch (e) {
    console.error("[mileage] valhalla failed", e instanceof Error ? e.message : e);
  }
  try {
    return { miles: await osrm(a, b), source: "osrm" };
  } catch (e) {
    console.error("[mileage] osrm failed", e instanceof Error ? e.message : e);
  }
  return null;
}

/** Cache key for a point: 5 decimal places (about a metre). */
export function pointKey(p: Point): string {
  return `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;
}
