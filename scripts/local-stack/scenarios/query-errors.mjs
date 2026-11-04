// No query fails: open every app page (and the CSV exports) as the owner and
// as a member, and require every Supabase request each one makes, server- or
// browser-side, to succeed. Catches a schema change that breaks a query, like
// v096 dropping the foreign key the Expenses item list embedded through.
// Signed out, each page goes to login without running a query.
// Usage (gateway logging, see query-errors.sh): node query-errors.mjs <gatewayLog>
import { readFileSync, statSync } from "node:fs";
import { APP, PHONE, check, launch, login } from "./browser.mjs";
import { adminGet } from "./api.mjs";

const LOG = process.argv[2];
const first = async (path) => (await adminGet(`${path}&limit=1`))[0]?.id;
const job = await first("jobs?client_id=eq.8&archived_at=is.null&select=id&order=id");
const contact = await first("contacts?client_id=eq.8&select=id&order=id");
const invoice = await first("invoices?client_id=eq.8&select=id&order=id");
const estimate = await first("estimates?client_id=eq.8&select=id&order=id");
const purchase = await first("purchases?client_id=eq.8&select=id&order=id.desc");
const PAGES = [
  "/app", "/app/jobs", "/app/calendar", "/app/contacts", "/app/contacts/new", "/app/estimator", "/app/estimator/new",
  "/app/estimator/invoices", "/app/estimator/expenses", "/app/estimator/insights", "/app/estimator/mileage",
  "/app/estimator/mileage/catch-up", "/app/estimator/purchases", "/app/estimator/settings", "/app/settings", "/app/team",
  ...(job ? [`/app/jobs/${job}`, `/app/jobs/${job}/edit`, `/app/jobs/${job}/invoice`] : []),
  ...(contact ? [`/app/contacts/${contact}`, `/app/contacts/${contact}/edit`] : []),
  ...(invoice ? [`/app/estimator/invoices/${invoice}`] : []),
  ...(estimate ? [`/app/estimator/${estimate}`, `/app/estimator/${estimate}/edit`] : []),
  ...(purchase ? [`/app/estimator/purchases/${purchase}`] : []),
];
const EXPORTS = ["/api/estimator/expenses/csv", "/api/estimator/mileage/csv"];
const failedSince = (offset) =>
  readFileSync(LOG, "utf8").slice(offset).split("\n").filter((l) => /^\[GW\] .* [45]\d\d$/.test(l)).map((l) => l.split(" ").slice(4).join(" "));

// Signed out: the middleware sends every app page to login before it renders,
// so not one query runs (they used to, and failed, as signed out).
for (const p of PAGES) {
  const offset = statSync(LOG).size;
  const r = await fetch(`${APP}${p}`, { redirect: "manual" });
  await new Promise((done) => setTimeout(done, 200));
  const queries = readFileSync(LOG, "utf8").slice(offset).split("\n").filter((l) => l.startsWith("[GW]") && l.includes("/rest/v1/"));
  const to = r.headers.get("location") ?? "";
  check(`signed out ${p}: sent to login, no queries`, r.status >= 300 && r.status < 400 && new URL(to, APP).pathname === "/login" && queries.length === 0,
    `${r.status} ${to} ${queries.length} queries`);
}

const browser = await launch();
for (const email of ["owner@cascade.test", "member@cascade.test"]) {
  const page = await login(browser, email, PHONE);
  const who = email.split("@")[0];
  for (const p of PAGES) {
    const offset = statSync(LOG).size;
    await page.goto(`${APP}${p}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(300);
    const failed = failedSince(offset);
    check(`${who} ${p}: every query succeeds`, failed.length === 0, failed.join(" | ").slice(0, 300));
  }
  for (const p of EXPORTS) {
    const offset = statSync(LOG).size;
    const r = await page.request.get(`${APP}${p}`);
    const failed = failedSince(offset);
    check(`${who} ${p}: every query succeeds (${r.status()})`, failed.length === 0 && r.status() < 500, failed.join(" | ").slice(0, 300));
  }
  await page.context().close();
}
await browser.close();
