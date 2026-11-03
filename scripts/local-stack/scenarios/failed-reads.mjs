// One case of failed-reads.sh: with reads of <table> failing at the gateway,
// the pages that use it show an error, not an empty or half-filled page.
// Usage (gateway already failing that table): node failed-reads.mjs <table>
import { APP, PHONE, check, launch, login } from "./browser.mjs";
import { adminCall, adminGet } from "./api.mjs";

const table = process.argv[2];
const job = (await adminGet("jobs?client_id=eq.8&archived_at=is.null&select=id&order=id&limit=1"))[0].id;
// A receipt to open (a fresh stack has none): never skip its check silently.
const purchase =
  (await adminGet("purchases?client_id=eq.8&select=id&order=id.desc&limit=1"))[0]?.id ??
  (await adminCall("POST", "purchases", { client_id: 8, vendor: "Failed-reads check", purchase_date: "2026-10-31", source: "manual" })).body[0].id;
const ERROR_SCREEN = "This page didn't load";

// Pages whose server render reads the table: they show the error screen.
const PAGES = {
  expenses: ["/app/estimator/purchases", `/app/estimator/purchases/${purchase}`, "/app/estimator/expenses", `/app/jobs/${job}`],
  mileage_entries: ["/app/estimator/mileage", "/app/estimator/expenses"],
  payments: ["/app/estimator/expenses"],
  time_entries: [`/app/jobs/${job}`, "/app/estimator/insights"],
  pricing_settings: [],
  notifications: [],
};
// Exports built from the table: a 500 with a message, never a CSV missing rows.
const EXPORTS = {
  expenses: ["/api/estimator/expenses/csv"],
  mileage_entries: ["/api/estimator/expenses/csv", "/api/estimator/mileage/csv"],
  payments: ["/api/estimator/expenses/csv"],
};

const browser = await launch();
const page = await login(browser, "owner@cascade.test", PHONE);
for (const p of PAGES[table]) {
  await page.goto(`${APP}${p}`);
  await page.waitForLoadState("networkidle").catch(() => {});
  const shown = await page.getByText(ERROR_SCREEN).isVisible();
  check(`${table} reads failing: ${p} shows the error screen`, shown, shown ? "" : (await page.locator("main").innerText()).slice(0, 160));
}
for (const p of EXPORTS[table] ?? []) {
  const r = await page.request.get(`${APP}${p}`);
  const body = await r.text();
  check(`${table} reads failing: ${p} answers 500 with a message`, r.status() === 500 && body.includes("nothing was downloaded"), `${r.status()} ${body.slice(0, 80)}`);
}
if (table === "pricing_settings") {
  await page.goto(`${APP}/app/estimator/settings`);
  await page.getByText("Couldn't load this section").first().waitFor();
  check("pricing_settings reads failing: the pricing form isn't shown (it could save over the real rates)", (await page.getByText("Minimum job charge").count()) === 0);
}
if (table === "notifications") {
  await page.goto(`${APP}/app`);
  await page.getByRole("button", { name: /^Notifications/ }).first().click();
  const msg = page.getByText("Couldn't load notifications");
  await msg.waitFor({ timeout: 10_000 }).catch(() => {});
  check("notifications reads failing: the bell says so instead of \"No notifications yet\"", await msg.isVisible());
}
await browser.close();
