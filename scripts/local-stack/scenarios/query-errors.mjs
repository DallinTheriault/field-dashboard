// No query fails: open every app page (and the CSV exports) as the owner and
// as a member, and require every Supabase request each one makes, server- or
// browser-side, to succeed. Catches a schema change that breaks a query, like
// v096 dropping the foreign key the Expenses item list embedded through.
// Every select the pages send is also held to the embed rule: across a
// composite same-tenant foreign key, the embed names the constraint.
// Signed out, each page goes to login without running a query.
// The records the detail pages need (a job, contact, estimate, invoice,
// receipt) are made when the stack has none, so no page is skipped.
// Usage (gateway logging, see query-errors.sh): node query-errors.mjs <gatewayLog>
import { readFileSync, statSync } from "node:fs";
import { APP, PHONE, check, launch, login } from "./browser.mjs";
import { adminCall, adminGet, session } from "./api.mjs";
import { loadForeignKeys, unnamedCompositeEmbeds } from "./embed-rules.mjs";

const LOG = process.argv[2];
const owner = await session("owner@cascade.test");
const first = async (path) => (await adminGet(`${path}&limit=1`))[0]?.id;
const made = (r, what) => {
  if (r.status >= 300 || !r.body) throw new Error(`couldn't make ${what}: ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
  return Array.isArray(r.body) ? r.body[0].id ?? r.body[0] : r.body;
};
const job = (await first("jobs?client_id=eq.8&archived_at=is.null&select=id&order=id")) ??
  made(await owner.post("jobs", { client_id: 8, name: "Query check job", status: "completed", source: "manual" }), "a job");
const contact = (await first("contacts?client_id=eq.8&select=id&order=id")) ??
  made(await owner.post("contacts", { client_id: 8, name: "Query Check" }), "a contact");
const estimate = (await first("estimates?client_id=eq.8&select=id&order=id")) ??
  made(await adminCall("POST", "estimates", { client_id: 8, job_id: job, status: "draft" }), "an estimate");
const entity = await first("billing_entities?client_id=eq.8&active=is.true&select=id&order=id");
const invoice = (await first("invoices?client_id=eq.8&select=id&order=id")) ??
  made(await owner.post("rpc/invoice_create_from_job", { p: {
    client_id: 8, job_id: job, billing_entity_id: entity, customer_name: "Query Check",
    line_items: [{ description: "Query check", qtyLabel: null, amount: 10 }], subtotal_cents: 1000, tax_rate_pct: 0, tax_cents: 0, total_cents: 1000,
  } }), "an invoice").invoice_id;
const purchase = (await first("purchases?client_id=eq.8&select=id&order=id.desc")) ??
  made(await adminCall("POST", "purchases", { client_id: 8, vendor: "Query check", purchase_date: "2026-10-31", source: "manual" }), "a receipt");
check("the detail pages have their records (made when missing)", [job, contact, estimate, invoice, purchase].every(Number.isInteger),
  JSON.stringify({ job, contact, estimate, invoice, purchase }));
const PAGES = [
  "/app", "/app/jobs", "/app/calendar", "/app/contacts", "/app/contacts/new", "/app/estimator", "/app/estimator/new",
  "/app/estimator/invoices", "/app/estimator/expenses", "/app/estimator/insights", "/app/estimator/mileage",
  "/app/estimator/mileage/catch-up", "/app/estimator/purchases", "/app/estimator/settings", "/app/settings", "/app/team",
  `/app/jobs/${job}`, `/app/jobs/${job}/edit`, `/app/jobs/${job}/invoice`,
  `/app/contacts/${contact}`, `/app/contacts/${contact}/edit`,
  `/app/estimator/invoices/${invoice}`,
  `/app/estimator/${estimate}`, `/app/estimator/${estimate}/edit`,
  `/app/estimator/purchases/${purchase}`,
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

// Every select the pages sent: embeds across a composite same-tenant key name it.
const fks = loadForeignKeys();
const selects = new Map();
for (const line of readFileSync(LOG, "utf8").split("\n")) {
  const m = line.match(/^\[GW\] .* (?:GET|HEAD|POST|PATCH|DELETE) \/rest\/v1\/(\w+)\?(\S*) \d{3}$/);
  if (!m || m[1] === "rpc") continue;
  const sel = new URLSearchParams(m[2]).get("select");
  if (sel && sel.includes("(")) selects.set(`${m[1]}?${sel}`, [m[1], sel]);
}
const unnamed = [...selects.values()].flatMap(([table, sel]) => unnamedCompositeEmbeds(table, sel, fks).map((v) => `${v.path} (use !${v.constraint})`));
check(`every select the pages sent names its composite-key embeds (${selects.size} distinct selects with embeds)`,
  selects.size > 0 && unnamed.length === 0, [...new Set(unnamed)].join("; ").slice(0, 400));
