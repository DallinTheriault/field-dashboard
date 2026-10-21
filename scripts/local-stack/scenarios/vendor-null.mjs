// v100 lets purchases.vendor be empty (a receipt not read yet, or a failed
// scan). Every page and export that shows a vendor must handle that: no
// "null", no "undefined", no crash. Run on a stack with v100 applied.
import { APP, PHONE, check, launch, login } from "./browser.mjs";
import { adminCall, session } from "./api.mjs";

const owner = await session("owner@cascade.test");
await adminCall("PATCH", "Clients?id=eq.8", { feature_receipt_ai_enabled: true });
const job = (await owner.post("jobs", { client_id: 8, name: "Nell Novendor", status: "in_progress", source: "manual", address: "1 Blank St" })).body[0];
const purchase = async (fields) =>
  (await adminCall("POST", "purchases", { client_id: 8, vendor: null, purchase_date: "2026-10-20", source: "scan", receipt_paths: [], ...fields })).body[0];
// The real cases: no items yet, read waiting, failed, still reading, from a job.
const waiting = await purchase({ scan_status: "needs_entry", scan_requested_at: new Date().toISOString(), scan_error: "x" });
const ready = await purchase({ scan_status: "ready", scan_requested_at: new Date().toISOString(),
  scan_result: { vendor: null, date: null, subtotal: null, tax: null, total: null, items: [] } });
const reading = await purchase({ scan_status: "queued", scan_requested_at: new Date().toISOString(), scan_job_id: job.id });
// Defensive: items on a purchase with no vendor (the app never saves one, but
// the database now allows it).
const withItems = await purchase({ source: "manual", total: 12.5 });
const added = await adminCall("POST", "expenses", [
  { client_id: 8, purchase_id: withItems.id, expense_date: "2026-10-20", category: "Materials & supplies", description: "Caulk", amount: 7.5, qty: 1, unit_price: 7.5, assignment: "job_in_bid", job_id: job.id, stock_category: null, customer_notified: false },
  { client_id: 8, purchase_id: withItems.id, expense_date: "2026-10-20", category: "Materials & supplies", description: "Rags", amount: 5, qty: 1, unit_price: 5, assignment: "stock", job_id: null, stock_category: "Supplies", customer_notified: false },
]);
check("setup: four purchases with no vendor, one with items", [waiting, ready, reading, withItems].every((p) => p?.id && p.vendor === null) &&
  added.status === 201 && added.body.length === 2, JSON.stringify(added.body).slice(0, 200));

const browser = await launch();
const page = await login(browser, "owner@cascade.test", PHONE);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const BAD = /\bnull\b|\bundefined\b|Application error|Something went wrong|Unhandled Runtime Error/;
async function clean(label, path) {
  errors.length = 0;
  const res = await page.goto(`${APP}${path}`);
  await page.waitForLoadState("networkidle");
  const text = await page.locator("body").innerText();
  const hit = text.match(BAD);
  check(label, res.status() === 200 && !hit && errors.length === 0, hit ? `found "${hit[0]}"` : errors.join("; ") || `HTTP ${res.status()}`);
  return text;
}

const exp = await clean("Expenses page (items, stock, Receipts to check, Receipts list)", "/app/estimator/purchases");
check("…unread receipts show as \"Receipt\"", (exp.match(/\bReceipt\b/g) ?? []).length >= 4);
await page.getByRole("button", { name: "Grid view" }).click();
check("…grid view too", !(await page.locator("body").innerText()).match(BAD) && errors.length === 0);
for (const [label, p] of [["needs entry", waiting], ["check this", ready], ["with items", withItems]]) {
  await clean(`purchase page, ${label}`, `/app/estimator/purchases/${p.id}`);
}
await clean("Money page (P&L / taxes)", "/app/estimator/expenses");
await clean("job page (expenses and receipts from this job)", `/app/jobs/${job.id}`);
await clean("Home (receipts to check)", "/app");

const csv = await page.request.get(`${APP}/api/estimator/expenses/csv?y=2026`);
const body = await csv.text();
const lines = body.split("\n").filter((l) => /Caulk|Rags/.test(l));
check("expenses CSV: the rows are there, with no vendor text", csv.status() === 200 && lines.length === 2 && !BAD.test(body) && !lines.some((l) => l.includes("@")),
  lines.join(" | "));

// The check screen with an empty read: blank vendor field, not "null".
await page.goto(`${APP}/app/estimator/purchases/${ready.id}`);
await page.getByTestId("scan-panel").getByRole("button", { name: "Check" }).click();
check("check screen on an empty read: vendor field blank", (await page.getByLabel("Vendor", { exact: true }).inputValue()) === "");
await browser.close();
