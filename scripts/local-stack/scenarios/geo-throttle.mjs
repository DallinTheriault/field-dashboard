// The map services' terms: an identifying User-Agent, and at most one request
// a second to each from the whole app. Two separate processes (two servers)
// place addresses and route to them at the same moment; what each service
// receives must still be at least a second apart. A worker with a time budget
// never waits past it for a turn, and GEO_NOMINATIM_URL=off means Census only.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { check } from "./browser.mjs";
import { adminCall } from "./api.mjs";

const GEO = "http://127.0.0.1:12114";
const UA = "FieldApp/1.0 (+https://app.getfield.co)";
const env = Object.fromEntries(readFileSync(new URL("../../../.env.local", import.meta.url), "utf8")
  .split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const mock = {
  reset: () => fetch(`${GEO}/__mock/reset`, { method: "POST" }),
  script: (s) => fetch(`${GEO}/__mock/script`, { method: "POST", body: JSON.stringify(s) }),
  requests: async (since) => (await (await fetch(`${GEO}/__mock/requests`)).json()).filter((r) => r.at >= since),
};
const slots = (body) => adminCall("PATCH", "geo_throttle?service=in.(census,nominatim,valhalla)", body);

const worker = (budget, addresses, extraEnv = {}) =>
  new Promise((resolve) => {
    const p = spawn("npx", ["vite-node", "--config", "scripts/local-stack/scenarios/workers/vite.config.mjs",
      "scripts/local-stack/scenarios/workers/geo-worker.ts", String(budget), ...addresses], {
      cwd: new URL("../../../", import.meta.url).pathname,
      env: { ...process.env, ...env, ...extraEnv },
    });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => {
      const rows = out.split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l));
      resolve({ code, out, rows, elapsed: rows.find((r) => "elapsed" in r)?.elapsed });
    });
  });
const gaps = (log, service) => {
  const t = log.filter((r) => r.service === service).map((r) => r.at).sort((x, y) => x - y);
  return t.slice(1).map((x, i) => x - t[i]);
};

// --- Two servers at once: each service at most one request a second ----------------------------------
await mock.reset();
await mock.script({ censusMiss: ["Throttle"] });
await slots({ next_at: new Date().toISOString() });
let t0 = Date.now();
const [a, b] = await Promise.all([
  worker(60_000, ["11 Throttle Way, Lehi, UT 84043", "12 Throttle Way, Lehi, UT 84043", "13 Throttle Way, Lehi, UT 84043"]),
  worker(60_000, ["21 Throttle Way, Lehi, UT 84043", "22 Throttle Way, Lehi, UT 84043", "23 Throttle Way, Lehi, UT 84043"]),
]);
const placed = [...a.rows, ...b.rows].filter((r) => r.address);
check("two servers placed and routed three addresses each", a.code === 0 && b.code === 0 && placed.length === 6 &&
  placed.every((r) => r.source === "nominatim" && r.route === "valhalla"), (a.out + b.out).slice(0, 400));
let log = await mock.requests(t0);
for (const service of ["census", "nominatim", "valhalla"]) {
  const g = gaps(log, service);
  check(`${service}: six requests, never two within a second, across both servers`,
    g.length === 5 && g.every((x) => x >= 1000), `gaps ${g.join(", ")} ms`);
}
check("every request carries a User-Agent that names the app", log.length === 18 && log.every((r) => r.ua === UA),
  `${log.length} requests; ${[...new Set(log.map((r) => r.ua))].join(" | ")}`);
check("no request to any other service (the OSRM backup is gone)", log.every((r) => ["census", "nominatim", "valhalla"].includes(r.service)));

// --- A jammed queue: give up at the deadline, take no slot, send nothing --------------------------------
await mock.reset();
const jammed = new Date(Date.now() + 90_000).toISOString();
await adminCall("PATCH", "geo_throttle?service=eq.valhalla", { next_at: jammed });
t0 = Date.now();
const c = await worker(5_000, ["31 Oak St, Lehi, UT 84043"]);
const row = c.rows.find((r) => r.address);
log = await mock.requests(t0);
check("with Valhalla's next slot 90 s away, a 5 s budget doesn't wait for it", row?.status === "ok" && row?.route === "later" &&
  c.elapsed < 5_000, `${JSON.stringify(row)} in ${c.elapsed} ms`);
check("…sends Valhalla nothing", log.filter((r) => r.service === "valhalla").length === 0);
const after = (await adminCall("GET", "geo_throttle?service=eq.valhalla&select=next_at")).body?.[0]?.next_at;
check("…and takes no slot", after && Math.abs(new Date(after).getTime() - new Date(jammed).getTime()) < 5, `${after} vs ${jammed}`);
await slots({ next_at: new Date().toISOString() });

// --- GEO_NOMINATIM_URL=off: Census only ---------------------------------------------------------------
await mock.reset();
await mock.script({ censusMiss: ["Throttle"] });
t0 = Date.now();
const d = await worker(30_000, ["41 Throttle Way, Lehi, UT 84043", "100 Oak St, American Fork, UT 84003"], { GEO_NOMINATIM_URL: "off" });
log = await mock.requests(t0);
const [miss, hit] = d.rows.filter((r) => r.address);
check("Nominatim off: an address Census can't place is not found, and Nominatim gets nothing",
  miss?.status === "not_found" && hit?.status === "ok" && hit?.source === "census" && log.every((r) => r.service !== "nominatim"),
  JSON.stringify(d.rows));
await mock.script({ censusDown: true });
const e = await worker(30_000, ["42 Throttle Way, Lehi, UT 84043"], { GEO_NOMINATIM_URL: "off" });
check("…and with Census down too, it's an error to retry, not 'not found'", e.rows.find((r) => r.address)?.status === "error",
  JSON.stringify(e.rows));
await mock.reset();
