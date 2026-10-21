// Mileage v101: one round trip per day on site, from the hours logged (or the
// days entered), from the base in effect that day, at the IRS rate on that
// date. Edited and hand-added trips are never recalculated. Map services are
// geo-mock.mjs. Run on a stack with every migration (mileage.sh rebuilds it).
import { readFileSync } from "node:fs";
import { APP, PHONE, check, launch, login } from "./browser.mjs";
import { adminGet, session } from "./api.mjs";

const GEO = "http://127.0.0.1:12114";
const geo = {
  reset: () => fetch(`${GEO}/__mock/reset`, { method: "POST" }),
  script: (s) => fetch(`${GEO}/__mock/script`, { method: "POST", body: JSON.stringify(s) }),
  requests: async () => (await fetch(`${GEO}/__mock/requests`)).json(),
};
const env = Object.fromEntries(readFileSync(new URL("../../../.env.local", import.meta.url), "utf8")
  .split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
check("setup: map services point at the mock", env.GEO_CENSUS_URL?.includes("12114") && env.ROUTE_VALHALLA_URL?.includes("12114"));

const BASE_A = "742 E 620 S, American Fork, UT 84003"; // Census can't place it; OpenStreetMap can
const BASE_A2 = "750 E 620 S, American Fork, UT 84003";
const BASE_B = "2376 W 12920 S, Riverton, UT 84065";
const usd = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
const r1 = (n) => Math.round((n + 1e-9) * 10) / 10;
const owner = await session("owner@cascade.test");
await geo.reset();

const mk = async (name, address, start = null, end = null, status = "in_progress") =>
  (await owner.post("jobs", { client_id: 8, name, status, source: "manual", address, start_datetime: start, end_datetime: end })).body[0];
const hours = (jobId, day, h = 2) => owner.post("time_entries", { client_id: 8, job_id: jobId, entry_date: day, hours: h });
const dayTrips = (d) => adminGet(`mileage_entries?client_id=eq.8&trip_date=eq.${d}&kind=neq.manual&select=*`);
const allTrips = () => adminGet("mileage_entries?client_id=eq.8&kind=neq.removed&order=trip_date,id&select=*");
const routeMiles = async () => {
  const rows = await adminGet("route_cache?client_id=eq.8&select=*");
  return (a, b) => {
    const hit = rows.find((r) => (r.from_point === a && r.to_point === b) || (r.from_point === b && r.to_point === a));
    return hit ? Number(hit.miles) : null;
  };
};
const pointOf = async (address) => {
  const key = address.toLowerCase().replace(/[.,]+/g, " ").replace(/\s+/g, " ").trim();
  const g = (await adminGet(`geocode_cache?client_id=eq.8&address_key=eq.${encodeURIComponent(key)}&select=*`))[0];
  return g ? { key: `${Number(g.lat).toFixed(5)},${Number(g.lon).toFixed(5)}`, source: g.source, status: g.status } : null;
};
async function until(fn, ms = 30_000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > end) return v;
    await new Promise((r) => setTimeout(r, 500));
  }
}

const browser = await launch();
const page = await login(browser, "owner@cascade.test", PHONE);
page.on("dialog", (d) => d.accept());
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
/** The Mileage page, once its own catch-up sync has finished. */
async function mileagePage() {
  await page.goto(`${APP}/app/estimator/mileage?y=2026`);
  await page.waitForLoadState("networkidle");
  await page.getByText("Working out miles…").waitFor({ state: "detached", timeout: 30_000 }).catch(() => {});
  await page.waitForLoadState("networkidle");
}

// --- Bases ---------------------------------------------------------------------------------------------
await mileagePage();
check("the old settings are gone: no per-year rate or single base field",
  (await page.getByText("Mileage settings").count()) === 0 && (await page.getByText(/rate not set/i).count()) === 0);
check("the 2026 IRS rates are filled in, with their sources",
  (await page.getByTestId("rates").getByText("From Jan 1, 2026: $0.725 a mile").count()) === 1 &&
  (await page.getByTestId("rates").getByText("From Jul 1, 2026: $0.76 a mile").count()) === 1 &&
  (await page.getByTestId("rates").getByText(/IR-2026-29/).count()) === 1);
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
const baseRows = await adminGet("mileage_bases?client_id=eq.8&order=effective_from&select=*");
check("two bases, each from its date", baseRows.length === 2 && baseRows[0].effective_from === "2026-01-01" && baseRows[1].effective_from === "2026-09-27");

// --- Hours make the trip ---------------------------------------------------------------------------------
const j1 = await mk("Ann Auto", "100 Oak St, American Fork, UT 84003", "2026-07-08T09:00:00-06:00");
await page.goto(`${APP}/app/jobs/${j1.id}`);
await page.waitForLoadState("networkidle");
const actuals = page.locator(".panel", { hasText: "Actuals" }).first();
await actuals.locator('input[type="date"]').fill("2026-07-08");
await actuals.getByPlaceholder("0.0").fill("3");
await actuals.getByRole("button", { name: "Log time" }).click();
let t = await until(async () => (await dayTrips("2026-07-08")).find((x) => x.miles_status === "ok"));
check("logging hours makes the day's round trip on its own", !!t && t.kind === "auto" && t.start_address === BASE_A &&
  t.stops?.[0]?.job_id === j1.id && t.purpose.includes("Ann Auto"), JSON.stringify(t ?? {}).slice(0, 200));
check("…with no trip prompt after logging hours", (await page.getByText(/Log a trip for/).count()) === 0 &&
  (await page.getByText(/Save as this property/).count()) === 0);
const a = await pointOf(BASE_A);
const p1 = await pointOf("100 Oak St, American Fork, UT 84003");
let leg = await routeMiles();
check("…miles are the driving distance there and back", t && Number(t.miles) === r1(2 * leg(a.key, p1.key)), `${t?.miles} vs ${leg(a.key, p1.key)}`);
check("an address Census can't place is found by an exact house-number match", a.source === "nominatim" && p1.source === "census");

await hours(j1.id, "2026-07-08", 1);
await mileagePage();
check("more hours the same day: still one trip", (await dayTrips("2026-07-08")).length === 1);

// --- Two jobs, one day: one loop in start-time order ---------------------------------------------------
const j2 = await mk("Bo Late", "200 Elm St, Riverton, UT 84065", "2026-10-01T13:00:00-06:00");
const j3 = await mk("Cy Early", "300 Pine St, Herriman, UT 84096", "2026-10-01T08:00:00-06:00");
await hours(j2.id, "2026-10-01");
await hours(j3.id, "2026-10-01");
await hours(j3.id, "2026-09-26");
await mileagePage();
const loop = (await dayTrips("2026-10-01"))[0];
const before = (await dayTrips("2026-09-26"))[0];
check("two jobs on one day are one loop: base, the 8:00 job, the 1:00 job, back", loop && loop.stops.map((s) => s.job_id).join() === `${j3.id},${j2.id}` &&
  loop.destination === "300 Pine St, Herriman, UT 84096 → 200 Elm St, Riverton, UT 84065");
const [b, p2, p3] = [await pointOf(BASE_B), await pointOf("200 Elm St, Riverton, UT 84065"), await pointOf("300 Pine St, Herriman, UT 84096")];
leg = await routeMiles();
check("…miles add every leg of the loop", Number(loop?.miles) === r1(leg(b.key, p3.key) + leg(p3.key, p2.key) + leg(p2.key, b.key)), `${loop?.miles}`);
check("the base switches on Sep 27: Sep 26 from American Fork, Oct 1 from Riverton", before?.start_address === BASE_A && loop?.start_address === BASE_B);

// --- Hand-added trip, rates, totals ----------------------------------------------------------------------
await page.getByRole("button", { name: /Add a trip by hand/ }).click();
await page.getByLabel("Date", { exact: true }).first().fill("2026-06-15");
await page.getByLabel("Destination", { exact: true }).first().fill("Sherwin-Williams, Lehi");
await page.getByLabel("Purpose", { exact: true }).first().fill("Paint run");
await page.getByLabel("Miles", { exact: true }).first().fill("10");
await page.getByRole("button", { name: "Add trip" }).click();
const manual = await until(async () => (await adminGet("mileage_entries?client_id=eq.8&kind=eq.manual&select=*"))[0]);
check("a trip added by hand starts from the base that day", manual?.start_address === BASE_A && Number(manual?.miles) === 10);
await mileagePage();
const live = await allTrips();
const deduction = live.reduce((s, x) => s + (x.miles === null ? 0 : Number(x.miles) * (x.trip_date < "2026-07-01" ? 0.725 : 0.76)), 0);
const milesTotal = r1(live.reduce((s, x) => s + Number(x.miles ?? 0), 0));
check("the year: total miles and the deduction at the rate on each trip's date",
  (await page.getByTestId("year-miles").textContent()).replace(/,/g, "") === String(milesTotal) &&
  (await page.getByTestId("year-deduction").textContent()) === usd(Math.round(deduction * 100) / 100),
  `${await page.getByTestId("year-miles").textContent()} / ${await page.getByTestId("year-deduction").textContent()} vs ${milesTotal} / ${deduction}`);
check("…June at 72.5¢, by month", (await page.locator('[data-month="6"] td').nth(2).textContent()) === usd(7.25) &&
  (await page.locator('[data-month="10"]').count()) === 1 && (await page.locator('[data-month="7"]').count()) === 1);

// --- Edited trips stay; a base change recalculates automatic ones only --------------------------------
const julyRow = page.getByTestId("trips").locator('li[data-date="2026-07-08"]');
await julyRow.getByRole("button", { name: "Edit" }).click();
await julyRow.getByLabel("Start", { exact: true }).fill("W-2 job, 50 Center St, Lehi, UT 84043");
await julyRow.getByLabel("Miles", { exact: true }).fill("31.4");
await julyRow.getByRole("button", { name: "Save trip" }).click();
t = await until(async () => (await dayTrips("2026-07-08")).find((x) => x.kind === "edited"));
check("editing a trip (straight from the W-2 job) keeps what you typed", t && Number(t.miles) === 31.4 && t.start_address.startsWith("W-2 job"));
const sept = (await dayTrips("2026-09-26"))[0];
await mileagePage();
const baseA = page.getByTestId("bases").locator(`li[data-base="${baseRows[0].id}"]`);
await baseA.getByRole("button", { name: "Edit base" }).click();
await page.getByTestId("bases").getByLabel("Base address").fill(BASE_A2);
await page.getByTestId("bases").getByRole("button", { name: "Save base" }).click();
const sept2 = await until(async () => (await dayTrips("2026-09-26")).find((x) => x.start_address === BASE_A2));
const july2 = (await dayTrips("2026-07-08"))[0];
const manual2 = (await adminGet(`mileage_entries?id=eq.${manual.id}&select=*`))[0];
check("changing a base recalculates the automatic trips it covers", sept2 && sept2.calculated_at > sept.calculated_at, sept2?.start_address);
check("…and never touches edited or hand-added trips", july2.kind === "edited" && Number(july2.miles) === 31.4 &&
  manual2.start_address === BASE_A && Number(manual2.miles) === 10);

// --- Remove and put back ------------------------------------------------------------------------------
await mileagePage();
await page.getByTestId("trips").locator('li[data-date="2026-10-01"]').getByRole("button", { name: "Delete trip" }).click();
await until(async () => (await dayTrips("2026-10-01"))[0]?.kind === "removed");
await hours(j2.id, "2026-10-01", 1);
await mileagePage();
check("a removed automatic trip isn't made again, even with more hours that day", (await dayTrips("2026-10-01"))[0]?.kind === "removed");
await page.locator("summary", { hasText: /removed trip/ }).click();
await page.locator('li[data-date="2026-10-01"]').getByRole("button", { name: "Put back automatic trip" }).click();
check("Put back makes it automatic again", !!(await until(async () => (await dayTrips("2026-10-01"))[0]?.kind === "auto" && (await dayTrips("2026-10-01"))[0]?.miles !== null)));

// --- When the map services fail -----------------------------------------------------------------------
await geo.script({ valhallaDown: true });
const j4 = await mk("Dee Detour", "400 Birch St, Sandy, UT 84093");
await hours(j4.id, "2026-10-05");
await mileagePage();
const p4 = await pointOf("400 Birch St, Sandy, UT 84093");
const osrmRows = await adminGet(`route_cache?client_id=eq.8&source=eq.osrm&select=*`);
check("Valhalla down: OSRM works it out", (await dayTrips("2026-10-05"))[0]?.miles_status === "ok" &&
  osrmRows.some((r) => r.from_point === p4.key || r.to_point === p4.key));
await owner.patch(`jobs?id=eq.${j4.id}`, { address: "410 Birch St, Sandy, UT 84093" });
await mileagePage();
const moved = (await dayTrips("2026-10-05"))[0];
check("changing a job's address recalculates its automatic trip", moved?.destination === "410 Birch St, Sandy, UT 84093" &&
  moved?.miles_status === "ok");
await geo.script({ valhallaDown: true, osrmDown: true });
const j5 = await mk("Eve Offline", "500 Cedar St, Draper, UT 84020");
await hours(j5.id, "2026-10-06");
await mileagePage();
const needs = page.getByTestId("needs-miles");
check("both down: the trip says so, and offers to type the miles",
  (await dayTrips("2026-10-06"))[0]?.miles_status === "route_failed" &&
  (await needs.locator('li[data-date="2026-10-06"]').getByText("Couldn't calculate miles, try again later.").count()) === 1 &&
  (await needs.locator('li[data-date="2026-10-06"]').getByLabel("Type the miles").count()) === 1);
await geo.script({ valhallaDown: false, osrmDown: false });
await needs.getByRole("button", { name: "Try again" }).click();
check("…and Try again works it out once they're back", !!(await until(async () => (await dayTrips("2026-10-06"))[0]?.miles_status === "ok")));

const j6 = await mk("Fay Various", "Pre-Field work, Various Properties");
await hours(j6.id, "2026-10-07");
await mileagePage();
const various = page.getByTestId("needs-miles").locator('li[data-date="2026-10-07"]');
check("an address that won't place is flagged, never guessed", (await dayTrips("2026-10-07"))[0]?.miles_status === "no_address" &&
  (await various.getByText(/Couldn't find this address on the map: Pre-Field work, Various Properties/).count()) === 1);
await various.getByLabel("Type the miles").fill("12");
await various.getByRole("button", { name: "Save miles" }).click();
check("…typing the miles saves them, and they stay", !!(await until(async () => {
  const x = (await dayTrips("2026-10-07"))[0];
  return x?.kind === "edited" && Number(x.miles) === 12;
})));

// --- Completing a job with no hours asks which days ---------------------------------------------------
const j7 = await mk("Gil Twoday", "600 Maple St, Riverton, UT 84065", "2026-10-16T09:00:00-06:00", "2026-10-17T17:00:00-06:00");
await page.goto(`${APP}/app/jobs/${j7.id}`);
await page.getByRole("button", { name: "Change status" }).click();
await page.getByRole("button", { name: "Completed", exact: true }).click();
const dialog = page.getByRole("dialog", { name: "Which days were you there?" });
await dialog.waitFor({ timeout: 20_000 }).catch(() => {});
check("completing a job with no hours asks \"Which days were you there?\", every scheduled day ticked",
  (await dialog.count()) === 1 && (await dialog.getByLabel("2026-10-16").isChecked()) && (await dialog.getByLabel("2026-10-17").isChecked()));
await dialog.getByLabel("2026-10-17").uncheck();
await dialog.getByRole("button", { name: "Save days" }).click();
await dialog.waitFor({ state: "detached" });
const days7 = await adminGet(`job_site_days?job_id=eq.${j7.id}&select=day`);
check("…untick the days you weren't there: the rest become trips", days7.map((d) => d.day).join() === "2026-10-16" &&
  !!(await until(async () => (await dayTrips("2026-10-16"))[0]?.stops?.[0]?.job_id === j7.id)) && (await dayTrips("2026-10-17")).length === 0);
await page.goto(`${APP}/app/jobs/${j1.id}`);
await page.getByRole("button", { name: "Change status" }).click();
await page.getByRole("button", { name: "Completed", exact: true }).click();
await page.waitForURL(/days=ask/);
await page.waitForLoadState("networkidle");
check("no question when hours are logged", (await page.getByRole("dialog", { name: "Which days were you there?" }).count()) === 0);

// --- Catch-up ---------------------------------------------------------------------------------------------
const j8 = await mk("Hal Gap", "700 Spruce St, Bluffdale, UT 84065", "2026-08-20T09:00:00-06:00", null, "completed");
const j9 = await mk("Ida Never", "800 Walnut St, Lehi, UT 84043", "2026-09-02T09:00:00-06:00", null, "completed");
await mileagePage();
check("the Mileage page points to the catch-up", (await page.getByTestId("catch-up-link").count()) === 1);
await page.goto(`${APP}/app/estimator/mileage/catch-up?y=2026`);
const list = page.getByTestId("catch-up");
check("catch-up lists every 2026 job with no days on site, and none that have them",
  (await list.locator(`li[data-job="${j8.id}"]`).count()) === 1 && (await list.locator(`li[data-job="${j9.id}"]`).count()) === 1 &&
  (await list.locator(`li[data-job="${j1.id}"]`).count()) === 0 && (await list.locator(`li[data-job="${j7.id}"]`).count()) === 0);
await list.locator(`li[data-job="${j8.id}"]`).getByRole("button", { name: "Save days" }).click();
await list.locator(`li[data-job="${j8.id}"]`).waitFor({ state: "detached" });
await list.locator(`li[data-job="${j9.id}"]`).getByRole("button", { name: "I wasn't on site" }).click();
await list.locator(`li[data-job="${j9.id}"]`).waitFor({ state: "detached" });
check("saving the days makes the trips; \"wasn't on site\" makes none", !!(await until(async () => (await dayTrips("2026-08-20")).length === 1)) &&
  (await dayTrips("2026-09-02")).length === 0);

// --- Exports and the Money page ----------------------------------------------------------------------
await mileagePage();
const finalTrips = await allTrips();
const finalDeduction = Math.round(finalTrips.reduce((s, x) => s + (x.miles === null ? 0 : Number(x.miles) * (x.trip_date < "2026-07-01" ? 0.725 : 0.76)), 0) * 100) / 100;
const csv = await (await page.request.get(`${APP}/api/estimator/mileage/csv?y=2026`)).text();
const lines = csv.split("\r\n");
check("mileage CSV: date, start, destination, purpose, miles, one row a trip", lines[0] === "date,start,destination,purpose,miles" &&
  lines.filter((l) => /^2026-/.test(l)).length === finalTrips.length && csv.includes("TOTAL MILES") && csv.includes(finalDeduction.toFixed(2)));
check("…purpose carries the job number and name", lines.some((l) => l.startsWith("2026-10-01") && l.includes("Cy Early") && l.includes("Bo Late")));
await page.goto(`${APP}/app/estimator/expenses?y=2026`);
check("the Money page's Standard mileage is the new trips' deduction", (await page.getByTestId("standard-mileage").textContent()) === usd(finalDeduction));
const pnl = await (await page.request.get(`${APP}/api/estimator/expenses/csv?y=2026`)).text();
check("the expenses CSV's mileage block is the new trips, outside net profit", pnl.includes("MILEAGE") &&
  pnl.includes("date,start,destination,purpose,miles") && pnl.includes(finalDeduction.toFixed(2)) && pnl.indexOf("NET PROFIT") < pnl.indexOf("MILEAGE"));

// --- Each property shows its miles, with a link to check it --------------------------------------------
await page.goto(`${APP}/app/jobs/${j2.id}`);
const pm = page.getByTestId("property-miles");
await pm.waitFor({ timeout: 20_000 }).catch(() => {});
const href = await pm.getByRole("link", { name: "Check in Google Maps" }).getAttribute("href").catch(() => null);
check("a job's property shows its miles from the base, with a Google Maps link", (await pm.getByText(/mi from your base, one way/).count()) === 1 &&
  !!href && new URL(href).searchParams.get("origin") === BASE_B && new URL(href).searchParams.get("travelmode") === "driving");

// --- Never billed -------------------------------------------------------------------------------------
for (const [label, path] of [["the invoice builder", `/app/jobs/${j3.id}/invoice`], ["the estimate builder", `/app/estimator/new?job=${j3.id}`]]) {
  await page.goto(`${APP}${path}`);
  await page.waitForLoadState("networkidle");
  const main = (await page.locator("main").count()) ? page.locator("main") : page.locator("body");
  const text = await main.innerText();
  check(`mileage never shows up on ${label}`, !/mileage|\bmiles?\b|\btravel\b/i.test(text), text.match(/.{0,40}(mileage|miles?|travel).{0,40}/i)?.[0]);
}

// --- Members --------------------------------------------------------------------------------------------
const mp = await login(browser, "member@cascade.test", PHONE);
await mp.goto(`${APP}/app/estimator/mileage`);
// The page streams (it has a loading screen), so the redirect lands in the browser.
await mp.waitForURL((u) => !u.pathname.includes("/mileage"), { timeout: 15_000 }).catch(() => {});
check("members can't open Mileage", !mp.url().includes("/mileage") &&
  (await mp.getByTestId("year-miles").count()) === 0, mp.url());
check("no errors on any page", errors.length === 0, errors.join("; "));
await browser.close();
