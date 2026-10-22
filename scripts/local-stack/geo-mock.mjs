// Stands in for the keyless map services mileage uses (US Census geocoder,
// Nominatim, Valhalla), so scenarios are repeatable and never hit the real
// ones. Usage: node geo-mock.mjs <port>
//   GET  /census/locations/onelineaddress?address=…   Census geocoder
//   GET  /nominatim/search?q=…                          Nominatim search
//   POST /valhalla/route                                Valhalla route
//   POST /__mock/script  {"valhallaDown":true, "censusDown":true, "nominatimDown":true,
//                         "censusMiss":["742 E 620 S"], "delay":{"valhalla":7500}}
//   GET  /__mock/requests   what was asked (with when it arrived and its User-Agent)
//   POST /__mock/reset
// Points come from a hash of the address, so the same address is always the
// same place; distances are straight-line miles times 1.3.
import http from "node:http";

const port = Number(process.argv[2] ?? 12114);
const DEFAULTS = { valhallaDown: false, censusDown: false, nominatimDown: false, censusMiss: ["742 E 620 S", "377 S 650 E"], delay: {} };
let script = { ...DEFAULTS };
let log = [];

const norm = (a) => a.toLowerCase().replace(/[.,]+/g, " ").replace(/\s+/g, " ").trim();
function hash(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}
function place(address) {
  const h = hash(norm(address));
  return { lat: 40.3 + (h % 4000) / 10000, lon: -112.05 + ((h >>> 12) % 4000) / 10000 };
}
const number = (a) => a.trim().match(/^(\d+[A-Za-z]?)\b/)?.[1] ?? null;
const placeable = (a) => !!number(a) && !/various/i.test(a);
function miles(a, b) {
  const R = 3958.8;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
const send = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
/** Answers after the scripted delay for that service (a slow service). */
const later = (service, res, status, body) => {
  const ms = Number(script.delay?.[service] ?? 0);
  if (ms > 0) setTimeout(() => send(res, status, body), ms);
  else send(res, status, body);
};

http
  .createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const url = new URL(req.url, "http://x");
      const p = url.pathname;
      if (p === "/__mock/script" && req.method === "POST") {
        script = { ...script, ...JSON.parse(raw || "{}") };
        return send(res, 200, script);
      }
      if (p === "/__mock/reset") {
        script = { ...DEFAULTS };
        log = [];
        return send(res, 200, { ok: true });
      }
      if (p === "/__mock/requests") return send(res, 200, log);

      if (p === "/census/locations/onelineaddress") {
        const a = url.searchParams.get("address") ?? "";
        log.push({ service: "census", q: a, at: Date.now(), ua: req.headers["user-agent"] ?? null });
        if (script.censusDown) return later("census", res, 503, { error: "down" });
        const miss = !placeable(a) || script.censusMiss.some((m) => norm(a).includes(norm(m)));
        const pt = place(a);
        return later("census", res, 200, {
          result: { addressMatches: miss ? [] : [{ matchedAddress: a.toUpperCase(), coordinates: { x: pt.lon, y: pt.lat } }] },
        });
      }
      if (p === "/nominatim/search") {
        const a = url.searchParams.get("q") ?? "";
        log.push({ service: "nominatim", q: a, at: Date.now(), ua: req.headers["user-agent"] ?? null });
        if (script.nominatimDown) return later("nominatim", res, 503, { error: "down" });
        if (!placeable(a)) return later("nominatim", res, 200, []);
        const pt = place(a);
        const zip = a.match(/\b(\d{5})\s*$/)?.[1];
        return later("nominatim", res, 200, [
          { lat: String(pt.lat), lon: String(pt.lon), display_name: a, address: { house_number: number(a), ...(zip ? { postcode: zip } : {}) } },
        ]);
      }
      if (p === "/valhalla/route" && req.method === "POST") {
        log.push({ service: "valhalla", at: Date.now(), ua: req.headers["user-agent"] ?? null });
        if (script.valhallaDown) return later("valhalla", res, 503, { error: "down" });
        const [a, b] = JSON.parse(raw || "{}").locations ?? [];
        return later("valhalla", res, 200, { trip: { summary: { length: Math.round(miles(a, b) * 1.3 * 1000) / 1000 } } });
      }
      send(res, 404, { error: "mock: no such route" });
    });
  })
  .listen(port, "127.0.0.1", () => console.log(`geo-mock on ${port}`));
