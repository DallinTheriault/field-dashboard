/**
 * Addresses to points, and driving miles between points. Keyless public
 * services only:
 *   geocoding  US Census geocoder; when it has no match, OpenStreetMap's
 *              Nominatim, but only on an exact house-number match (never a
 *              street or a town centre: an address that won't place is
 *              flagged, not guessed)
 *   routing    Valhalla (FOSSGIS) only; when it fails the day says so and
 *              takes typed miles
 *
 * Their terms allow at most one request a second from the whole app, so every
 * request first waits its turn (lib/mileage/throttle.ts shares the turns
 * across servers). Callers cache every answer (lib/mileage/sync.ts), so each
 * address and each pair of points is looked up once. Server only.
 *
 * GEO_NOMINATIM_URL=off turns Nominatim off (its policy: an app must stop
 * when asked, without a software update): addresses use Census only.
 */

export type Point = { lat: number; lon: number };

export type Geocode =
  | { status: "ok"; point: Point; matched: string; source: "census" | "nominatim" }
  | { status: "not_found" }
  /** The services couldn't be reached: try again later, don't cache. */
  | { status: "error" }
  /** No turn came before the caller's deadline: left for the next batch. */
  | { status: "later" };

export type Route = { miles: number; source: "valhalla" };

export type GeoService = "census" | "nominatim" | "valhalla";

/** Identifies the app to every service (Nominatim's and FOSSGIS's terms require it). */
export const USER_AGENT = "FieldApp/1.0 (+https://app.getfield.co)";
const UA = USER_AGENT;
/** No request runs longer than this, so a batch ends at most this long after its deadline. */
export const TIMEOUT_MS = 8000;

// Overridable for the local stack (scripts/local-stack/geo-mock.mjs).
const CENSUS = () => process.env.GEO_CENSUS_URL ?? "https://geocoding.geo.census.gov/geocoder";
const NOMINATIM = () => process.env.GEO_NOMINATIM_URL ?? "https://nominatim.openstreetmap.org";
const VALHALLA = () => process.env.ROUTE_VALHALLA_URL ?? "https://valhalla1.openstreetmap.de";

export function nominatimOff(): boolean {
  return NOMINATIM().trim().toLowerCase() === "off";
}

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

/**
 * At most one request a second to each service. A turn waits for the
 * service's next slot and says whether to go: false when the slot wouldn't
 * come before the caller's deadline (none is taken then, and nothing is sent).
 * Callers pass turns shared by every server (lib/mileage/throttle.ts); this
 * in-process spacing is the fallback when there are none.
 */
export const GAP_MS = 1100;
export type Turn = (service: GeoService) => Promise<boolean>;
const localNext: Record<GeoService, number> = { census: 0, nominatim: 0, valhalla: 0 };
export function localTurn(deadline: number): Turn {
  return async (service) => {
    const now = Date.now();
    const wait = Math.max(0, localNext[service] - now);
    if (now >= deadline || now + wait > deadline) return false;
    localNext[service] = Math.max(now, localNext[service]) + GAP_MS;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    return true;
  };
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
 * Not found only when every service asked answered and none placed it; if one
 * couldn't be reached, it's an error to retry later, never cached as missing.
 */
export async function lookupAddress(address: string, turn: Turn): Promise<Geocode> {
  let censusAnswered = false;
  if (!(await turn("census"))) return { status: "later" };
  try {
    const c = await census(address);
    if (c.status === "ok") return c;
    censusAnswered = true;
  } catch (e) {
    console.error("[mileage] census geocoder failed", e instanceof Error ? e.message : e);
  }
  if (nominatimOff() || !houseNumber(address)) return censusAnswered ? { status: "not_found" } : { status: "error" };
  if (!(await turn("nominatim"))) return { status: "later" };
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

/** Driving miles from a to b. "failed" when Valhalla can't answer; "later" when no turn came in time. */
export async function drivingMiles(a: Point, b: Point, turn: Turn): Promise<Route | "failed" | "later"> {
  if (!(await turn("valhalla"))) return "later";
  try {
    return { miles: await valhalla(a, b), source: "valhalla" };
  } catch (e) {
    console.error("[mileage] valhalla failed", e instanceof Error ? e.message : e);
    return "failed";
  }
}

/** Cache key for a point: 5 decimal places (about a metre). */
export function pointKey(p: Point): string {
  return `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;
}

export type ServiceCheck = { service: GeoService; state: "ok" | "failed" | "busy" | "off"; ms: number; detail: string };

/**
 * Asks each service once, to show the app can reach them: both geocoders
 * look up `address`, Valhalla drives from it to `to`.
 */
export async function checkServices(address: string, to: Point | null, turn: Turn): Promise<ServiceCheck[]> {
  const out: ServiceCheck[] = [];
  const time = async (service: GeoService, fn: () => Promise<string>) => {
    if (!(await turn(service))) {
      out.push({ service, state: "busy", ms: 0, detail: "busy, try again in a minute" });
      return;
    }
    const start = Date.now();
    try {
      const detail = await fn();
      out.push({ service, state: "ok", ms: Date.now() - start, detail });
    } catch (e) {
      out.push({ service, state: "failed", ms: Date.now() - start, detail: e instanceof Error ? e.message : String(e) });
    }
  };
  const found: { point: Point | null } = { point: null };
  await time("census", async () => {
    const c = await census(address);
    if (c.status === "ok") found.point = c.point;
    return c.status === "ok" ? `found: ${c.matched}` : "answered: no match";
  });
  if (nominatimOff()) {
    out.push({ service: "nominatim", state: "off", ms: 0, detail: "turned off; addresses use the Census geocoder only" });
  } else {
    await time("nominatim", async () => {
      const n = await nominatim(address);
      if (n.status === "ok") found.point ??= n.point;
      return n.status === "ok" ? `found: ${n.matched}` : "answered: no exact house-number match";
    });
  }
  const a = found.point;
  const b = to ?? (a ? { lat: a.lat + 0.02, lon: a.lon + 0.02 } : null);
  if (!a || !b) {
    out.push({ service: "valhalla", state: "failed", ms: 0, detail: "no point to route from" });
    return out;
  }
  await time("valhalla", async () => `${(await valhalla(a, b)).toFixed(2)} mi`);
  return out;
}
