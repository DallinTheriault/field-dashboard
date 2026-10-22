// v102: the first catch-up, with every map service at one request a second.
// Each request the page makes ends well inside the server's 60 s limit, the
// trips are worked out in batches until none are left, and each service's
// requests stay at least a second apart. Then the edges: a slow Valhalla, one
// that hangs past the 8 s timeout, a queue jammed by another server, and
// GEO_NOMINATIM_URL=off. Runs after mileage.mjs on the same stack; starts by
// clearing Cascade's mileage.
import { readFileSync, writeFileSync } from "node:fs";
import { APP, PHONE, check, launch, login } from "./browser.mjs";
import { adminCall, adminGet, session } from "./api.mjs";

const GEO = "http://127.0.0.1:12114";
const mock = {
  reset: () => fetch(`${GEO}/__mock/reset`, { method: "POST" }),
  script: (s) => fetch(`${GEO}/__mock/script`, { method: "POST", body: JSON.stringify(s) }),
  requests: async (since = 0) => (await (await fetch(`${GEO}/__mock/requests`)).json()).filter((r) => r.at >= since),
};
const LIMIT_MS = 60_000;
// A batch: 25 s of lookups, the last request's 8 s timeout, and the page work around it.
const BATCH_BOUND_MS = 40_000;
const BASE_A = "742 E 620 S, American Fork, UT 84003"; // Census can't place it; Nominatim can
const BASE_B = "2376 W 12920 S, Riverton, UT 84065";

const owner = await session("owner@cascade.test");
for (const t of ["mileage_entries", "job_site_days", "time_entries", "mileage_bases", "geocode_cache", "route_cache"]) {
  await adminCall("DELETE", `${t}?client_id=eq.8`);
}
const freeSlots = () => adminCall("PATCH", "geo_throttle?service=in.(census,nominatim,valhalla)", { next_at: new Date().toISOString() });
await freeSlots();
await mock.reset();

const mk = async (name, address, start) =>
  (await owner.post("jobs", { client_id: 8, name, status: "in_progress", source: "manual", address, start_datetime: start ?? null })).body[0];
const hours = (jobId, day) => owner.post("time_entries", { client_id: 8, job_id: jobId, entry_date: day, hours: 2 });
const trips = async (from, to) =>
  adminGet(`mileage_entries?client_id=eq.8&kind=eq.auto&trip_date=gte.${from}&trip_date=lte.${to}&order=trip_date&select=*`);
async function until(fn, ms) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > end) return v;
    await new Promise((r) => setTimeout(r, 1000));
  }
}
const gaps = (log, service) => {
  const t = log.filter((r) => r.service === service).map((r) => r.at).sort((x, y) => x - y);
  return t.slice(1).map((x, i) => x - t[i]);
};

const browser = await launch();
const page = await login(browser, "owner@cascade.test", PHONE);
page.on("dialog", (d) => d.accept());
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
// Every server action the page sends, and how long the server took to answer it.
let actions = [];
const started = new Map();
page.on("request", (r) => {
  if (r.method() === "POST" && r.headers()["next-action"]) started.set(r, Date.now());
});
const finished = (r) => {
  const t = started.get(r);
  if (t === undefined) return;
  started.delete(r);
  actions.push(Date.now() - t);
};
page.on("requestfinished", finished);
page.on("requestfailed", finished);
const slowest = () => Math.max(0, ...actions);
/**
 * Until the page's batches are done: nothing in flight and no progress line.
 * (A batch writes its trips before its request returns, so the database can
 * be done first.)
 */
async function settled(ms = 90_000) {
  const end = Date.now() + ms;
  for (let quiet = 0; quiet < 4 && Date.now() < end; ) {
    quiet = started.size === 0 && (await page.getByTestId("miles-working").count()) === 0 ? quiet + 1 : 0;
    await new Promise((r) => setTimeout(r, 500));
  }
}
// Not "networkidle": a batch can keep a request open for half a minute.
const open = async () => {
  await page.goto(`${APP}/app/estimator/mileage?y=2026`);
  await page.waitForLoadState("load");
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
};

// --- The first catch-up: 13 days at 7 addresses, as on Sharpline, then two bases ------------------------
const addrs = [
  "101 Main St, Lehi, UT 84043", "202 State St, Orem, UT 84057", "303 Center St, Provo, UT 84601",
  "404 Canyon Rd, Alpine, UT 84004", "505 Grove Dr, Pleasant Grove, UT 84062", "606 Pioneer Ln, Highland, UT 84003",
  "707 Mill Rd, Saratoga Springs, UT 84045",
];
const jobs = [];
for (const [i, a] of addrs.entries()) jobs.push(await mk(`Catch-up ${i + 1}`, a, `2026-07-01T${String(8 + i).padStart(2, "0")}:00:00-06:00`));
const visits = [
  ["2026-07-07", 0], ["2026-07-08", 0], ["2026-07-09", 1], ["2026-07-10", 1], ["2026-07-11", 2], ["2026-07-21", 2],
  ["2026-07-21", 3], ["2026-07-22", 3], ["2026-07-23", 4], ["2026-07-24", 4], ["2026-07-30", 5], ["2026-10-14", 6],
  ["2026-10-16", 6], ["2026-10-19", 5],
];
for (const [day, j] of visits) await hours(jobs[j].id, day);

await open();
check("before any base: 13 days, each waiting for a base", (await trips("2026-01-01", "2026-12-31")).filter((t) => t.miles_status === "no_base").length === 13);
actions = [];
let t0 = Date.now();
const bases = page.getByTestId("bases");
await bases.getByLabel("Base address").fill(BASE_A);
await bases.getByLabel("Starts on").fill("2026-01-01");
await bases.getByRole("button", { name: "Save base" }).click();
await bases.getByText(BASE_A).waitFor();
await bases.getByRole("button", { name: "Add a base" }).click();
await bases.getByLabel("Base address").fill(BASE_B);
await bases.getByLabel("Starts on").fill("2026-09-27");
await bases.getByRole("button", { name: "Save base" }).click();
await bases.getByText(BASE_B).waitFor();
const all = await until(async () => {
  const t = await trips("2026-01-01", "2026-12-31");
  return t.length === 13 && t.every((x) => x.miles_status === "ok") ? t : null;
}, 180_000);
const firstMs = Date.now() - t0;
await settled();
let log = await mock.requests(t0);
check("all 13 days get their miles without leaving the page", !!all && all.every((x) => Number(x.miles) > 0),
  `${firstMs} ms; ${(await trips("2026-01-01", "2026-12-31")).map((x) => x.miles_status).join(",")}`);
check("…July from the American Fork base, October from Riverton", !!all &&
  all.filter((x) => x.trip_date < "2026-09-27").every((x) => x.start_address === BASE_A) &&
  all.filter((x) => x.trip_date >= "2026-09-27").every((x) => x.start_address === BASE_B));
check("…the two-job day is one loop", !!all && all.find((x) => x.trip_date === "2026-07-21")?.stops?.length === 2);
check("…in batches, none near the 60 s limit", actions.length >= 3 && slowest() < BATCH_BOUND_MS,
  `${actions.length} requests, slowest ${slowest()} ms: ${actions.join(", ")}`);
for (const service of ["census", "nominatim", "valhalla"]) {
  const g = gaps(log, service);
  check(`…${service} never asked twice within a second`, g.every((x) => x >= 1000),
    `${log.filter((r) => r.service === service).length} requests; smallest gap ${g.length ? Math.min(...g) : "-"} ms`);
}
console.log(`INFO  first catch-up: ${firstMs} ms, ${actions.length} server requests (slowest ${slowest()} ms), ` +
  `census ${log.filter((r) => r.service === "census").length}, nominatim ${log.filter((r) => r.service === "nominatim").length}, ` +
  `valhalla ${log.filter((r) => r.service === "valhalla").length}`);

// --- A slow Valhalla (7.5 s an answer): more batches, each still bounded --------------------------------
await mock.script({ delay: { valhalla: 7500 } });
const slow = ["11 Oak St", "12 Oak St", "13 Oak St", "14 Oak St", "15 Oak St", "16 Oak St"];
for (const [i, a] of slow.entries()) await hours((await mk(`Slow ${i + 1}`, `${a}, Lehi, UT 84043`)).id, `2026-08-0${i + 3}`);
actions = [];
t0 = Date.now();
await open();
const slowDone = await until(async () => {
  const t = await trips("2026-08-03", "2026-08-08");
  return t.length === 6 && t.every((x) => x.miles_status === "ok");
}, 240_000);
await settled();
check("slow Valhalla: all six days still get miles, over several batches", !!slowDone && actions.length >= 2,
  `${Date.now() - t0} ms, ${actions.length} requests`);
check("…and no request near the limit", slowest() < BATCH_BOUND_MS, `slowest ${slowest()} ms: ${actions.join(", ")}`);

// --- Valhalla hangs (20 s, past the 8 s timeout): the days fail, the requests don't --------------------
await mock.script({ delay: { valhalla: 20_000 } });
const hang = ["21 Elm St", "22 Elm St", "23 Elm St", "24 Elm St"];
for (const [i, a] of hang.entries()) await hours((await mk(`Hang ${i + 1}`, `${a}, Orem, UT 84057`)).id, `2026-08-1${i}`);
actions = [];
t0 = Date.now();
await open();
const hung = await until(async () => {
  const t = await trips("2026-08-10", "2026-08-13");
  return t.length === 4 && t.every((x) => x.miles_status === "route_failed");
}, 240_000);
await settled();
check("hanging Valhalla: each day says it couldn't calculate miles", !!hung, `${Date.now() - t0} ms`);
check("…and every request still ends well inside the limit", slowest() < BATCH_BOUND_MS && slowest() < LIMIT_MS,
  `slowest ${slowest()} ms: ${actions.join(", ")}`);
await mock.script({ delay: {} });
await open();
await page.getByTestId("needs-miles").getByRole("button", { name: "Try again" }).click();
check("…Try again works them out once it answers", !!(await until(async () => {
  const t = await trips("2026-08-10", "2026-08-13");
  return t.every((x) => x.miles_status === "ok");
}, 60_000)));

// --- Another server has Valhalla's queue full: stop, say so, don't wait ---------------------------------
await adminCall("PATCH", "geo_throttle?service=eq.valhalla", { next_at: new Date(Date.now() + 120_000).toISOString() });
await hours((await mk("Queued", "31 Pine St, Provo, UT 84601")).id, "2026-08-17");
actions = [];
await open();
const banner = page.getByTestId("miles-stalled");
await banner.waitFor({ timeout: 90_000 }).catch(() => {});
check("queue jammed: the page stops and says the services are busy",
  (await banner.count()) === 1 && (await banner.innerText()).includes("1 trip still needs miles") &&
  (await trips("2026-08-17", "2026-08-17"))[0]?.miles_status === "pending", await banner.innerText().catch(() => "(no banner)"));
check("…without waiting on the queue", slowest() < BATCH_BOUND_MS, `slowest ${slowest()} ms`);
await freeSlots();
await banner.getByRole("button", { name: "Try again" }).click();
check("…Try again finishes it once the queue clears", !!(await until(async () =>
  (await trips("2026-08-17", "2026-08-17"))[0]?.miles_status === "ok", 60_000)));

// --- GEO_NOMINATIM_URL=off: Census only, and Check map services says so --------------------------------
const ENV = new URL("../../../.env.local", import.meta.url);
const envText = readFileSync(ENV, "utf8");
const reloaded = async () => {
  await new Promise((r) => setTimeout(r, 3000));
  await until(async () => (await fetch(`${APP}/login`).catch(() => null))?.status === 200, 60_000);
};
try {
  writeFileSync(ENV, envText.replace(/^GEO_NOMINATIM_URL=.*$/m, "GEO_NOMINATIM_URL=off"));
  await reloaded();
  await mock.reset();
  t0 = Date.now();
  await hours((await mk("Off", "377 S 650 E, Lindon, UT 84042")).id, "2026-08-20"); // Census can't place it
  await open();
  const off = await until(async () => {
    const t = (await trips("2026-08-20", "2026-08-20"))[0];
    return t && t.miles_status !== "pending" ? t : null;
  }, 60_000);
  check("Nominatim off: an address Census can't place is flagged, and Nominatim is never asked",
    off?.miles_status === "no_address" && (await mock.requests(t0)).every((r) => r.service !== "nominatim"),
    `${off?.miles_status} ${off?.miles_note}`);
  const svc = page.getByTestId("service-check");
  await svc.getByRole("button", { name: "Check map services" }).click();
  await svc.locator('li[data-service="valhalla"]').waitFor({ timeout: 30_000 });
  check("…and Check map services says it isn't using it", (await svc.locator('li[data-service="nominatim"][data-state="off"]').count()) === 1 &&
    (await svc.locator('li[data-service="nominatim"]').innerText()).includes("Not using OpenStreetMap (Nominatim)"),
    await svc.innerText());
} finally {
  writeFileSync(ENV, envText);
  await reloaded();
}
check("no errors on the page", errors.length === 0, errors.join("; "));
await browser.close();
