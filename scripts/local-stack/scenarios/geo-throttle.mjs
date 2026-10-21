// Nominatim's usage policy: an identifying User-Agent, and at most one
// request a second from the whole app. Two separate processes (two servers)
// look up addresses Census can't place, at the same moment; the requests
// Nominatim receives must still be at least a second apart.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { check } from "./browser.mjs";

const GEO = "http://127.0.0.1:12114";
const env = Object.fromEntries(readFileSync(new URL("../../../.env.local", import.meta.url), "utf8")
  .split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
await fetch(`${GEO}/__mock/reset`, { method: "POST" });
await fetch(`${GEO}/__mock/script`, { method: "POST", body: JSON.stringify({ censusMiss: ["Throttle"] }) });

const worker = (addresses) =>
  new Promise((resolve) => {
    const p = spawn("npx", ["vite-node", "--config", "scripts/local-stack/scenarios/workers/vite.config.mjs",
      "scripts/local-stack/scenarios/workers/nominatim-worker.ts", ...addresses], {
      cwd: new URL("../../../", import.meta.url).pathname,
      env: { ...process.env, ...env },
    });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => resolve({ code, out }));
  });
const t0 = Date.now();
const [a, b] = await Promise.all([
  worker(["11 Throttle Way, Lehi, UT 84043", "12 Throttle Way, Lehi, UT 84043", "13 Throttle Way, Lehi, UT 84043"]),
  worker(["21 Throttle Way, Lehi, UT 84043", "22 Throttle Way, Lehi, UT 84043", "23 Throttle Way, Lehi, UT 84043"]),
]);
check("two servers looked up three addresses each", a.code === 0 && b.code === 0 &&
  (a.out.match(/"source":"nominatim"/g) ?? []).length === 3 && (b.out.match(/"source":"nominatim"/g) ?? []).length === 3,
  (a.out + b.out).slice(0, 300));
const log = (await (await fetch(`${GEO}/__mock/requests`)).json()).filter((r) => r.service === "nominatim" && r.at >= t0);
const times = log.map((r) => r.at).sort((x, y) => x - y);
const gaps = times.slice(1).map((t, i) => t - times[i]);
check("Nominatim got all six requests", log.length === 6, `${log.length}`);
check("…never two within a second, across both servers", gaps.every((g) => g >= 1000), `gaps ${gaps.join(", ")} ms`);
check("…each with a User-Agent that names the app", log.every((r) => r.ua === "FieldApp/1.0 (+https://app.getfield.co)"), log[0]?.ua);
await fetch(`${GEO}/__mock/reset`, { method: "POST" });
