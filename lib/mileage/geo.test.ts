import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkServices, drivingMiles, GAP_MS, localTurn, lookupAddress, type Turn } from "./geo";

const go: Turn = async () => true;
const never: Turn = async () => false;
const CENSUS_HIT = { result: { addressMatches: [{ matchedAddress: "1 A ST", coordinates: { x: -111.8, y: 40.4 } }] } };
const CENSUS_MISS = { result: { addressMatches: [] } };

/** Answers by service; records what was asked. */
function stubFetch(answers: Partial<Record<"census" | "nominatim" | "valhalla", unknown | Error>>) {
  const asked: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    const service = url.includes("census") ? "census" : url.includes("nominatim") ? "nominatim" : "valhalla";
    asked.push(service);
    const a = answers[service];
    if (a instanceof Error || a === undefined) return new Response("down", { status: 503 });
    return new Response(JSON.stringify(a), { status: 200 });
  });
  return asked;
}

beforeEach(() => {
  vi.stubEnv("GEO_CENSUS_URL", "http://mock/census");
  vi.stubEnv("GEO_NOMINATIM_URL", "http://mock/nominatim");
  vi.stubEnv("ROUTE_VALHALLA_URL", "http://mock/valhalla");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("localTurn", () => {
  it("spaces each service at least a second apart, separately", async () => {
    vi.useFakeTimers();
    const turn = localTurn(Date.now() + 60_000);
    expect(await turn("valhalla")).toBe(true);
    const second = turn("valhalla");
    let done = false;
    void second.then(() => (done = true));
    expect(await turn("census")).toBe(true); // another service doesn't wait
    await vi.advanceTimersByTimeAsync(GAP_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await second).toBe(true);
  });
  it("says no, and takes no slot, when the slot would come after the deadline", async () => {
    vi.useFakeTimers();
    const turn = localTurn(Date.now() + 500);
    expect(await turn("nominatim")).toBe(true);
    expect(await turn("nominatim")).toBe(false); // next slot is 1.1 s away; deadline 0.5 s
    const later = localTurn(Date.now() + 60_000);
    const t0 = Date.now();
    const p = later("nominatim");
    await vi.advanceTimersByTimeAsync(GAP_MS);
    expect(await p).toBe(true);
    expect(Date.now() - t0).toBe(GAP_MS); // one gap after the first, not two
  });
});

describe("lookupAddress", () => {
  it("asks Nominatim only when Census can't place it", async () => {
    const asked = stubFetch({ census: CENSUS_MISS, nominatim: [] });
    expect((await lookupAddress("12 A St, Lehi, UT 84043", go)).status).toBe("not_found");
    expect(asked).toEqual(["census", "nominatim"]);
  });
  it("GEO_NOMINATIM_URL=off: Census only", async () => {
    vi.stubEnv("GEO_NOMINATIM_URL", " OFF ");
    let asked = stubFetch({ census: CENSUS_MISS });
    expect((await lookupAddress("12 A St, Lehi, UT 84043", go)).status).toBe("not_found");
    expect(asked).toEqual(["census"]);
    asked = stubFetch({ census: CENSUS_HIT });
    expect(await lookupAddress("1 A St, Lehi, UT 84043", go)).toMatchObject({ status: "ok", source: "census" });
    asked = stubFetch({});
    expect((await lookupAddress("12 A St, Lehi, UT 84043", go)).status).toBe("error"); // Census down: retry, don't cache
    expect(asked).toEqual(["census"]);
  });
  it("sends nothing and says later when no turn comes", async () => {
    const asked = stubFetch({ census: CENSUS_HIT });
    expect((await lookupAddress("1 A St, Lehi, UT 84043", never)).status).toBe("later");
    expect(asked).toEqual([]);
  });
});

describe("drivingMiles", () => {
  const a = { lat: 40.4, lon: -111.8 };
  const b = { lat: 40.5, lon: -111.9 };
  it("is Valhalla only: when it fails, nothing else is asked", async () => {
    const asked = stubFetch({});
    expect(await drivingMiles(a, b, go)).toBe("failed");
    expect(asked).toEqual(["valhalla"]);
  });
  it("returns Valhalla's miles", async () => {
    stubFetch({ valhalla: { trip: { summary: { length: 12.34 } } } });
    expect(await drivingMiles(a, b, go)).toEqual({ miles: 12.34, source: "valhalla" });
  });
  it("sends nothing and says later when no turn comes", async () => {
    const asked = stubFetch({ valhalla: { trip: { summary: { length: 1 } } } });
    expect(await drivingMiles(a, b, never)).toBe("later");
    expect(asked).toEqual([]);
  });
});

describe("checkServices", () => {
  it("asks the three services, and reports Nominatim as off when it is", async () => {
    stubFetch({ census: CENSUS_HIT, valhalla: { trip: { summary: { length: 2.5 } } } });
    vi.stubEnv("GEO_NOMINATIM_URL", "off");
    const out = await checkServices("1 A St, Lehi, UT 84043", null, go);
    expect(out.map((c) => [c.service, c.state])).toEqual([["census", "ok"], ["nominatim", "off"], ["valhalla", "ok"]]);
  });
  it("says busy, without asking, when no turn comes", async () => {
    const asked = stubFetch({ census: CENSUS_HIT });
    const out = await checkServices("1 A St, Lehi, UT 84043", null, never);
    expect(out.map((c) => c.state)).toEqual(["busy", "busy", "failed"]);
    expect(asked).toEqual([]);
  });
});
