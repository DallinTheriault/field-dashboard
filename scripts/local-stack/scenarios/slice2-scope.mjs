// Slice 2 (priced tasks + scope builder) scenarios against the local stack.
//   PHASE=before node slice2-scope.mjs   before v095: an old-style task on job 1
//   node slice2-scope.mjs                after v095: the checks
import { APP, PHONE, check, launch, login } from "./browser.mjs";
import { adminCall, adminGet, session } from "./api.mjs";

const OLD_TITLE = "Old task from before v095";
const owner = await session("owner@cascade.test");

if (process.env.PHASE === "before") {
  const r = await owner.post("tasks", { client_id: 8, job_id: 1, title: OLD_TITLE, sort_order: 1 });
  console.log(r.status === 201 ? "old-style task created" : `failed: ${JSON.stringify(r.body)}`);
  process.exit(r.status === 201 ? 0 : 1);
}

const member = await session("member@cascade.test");
const other = await session("owner@other.test");
let r;

// --- Price book for the run ----------------------------------------------------------
await owner.patch("pricing_settings?client_id=eq.8", { default_hourly_rate: 85 });
const entry = async (name, unit, unit_price) =>
  (await owner.post("service_catalog", { client_id: 8, name, type: "PRICED", unit, unit_price })).body[0];
const patchEntry = await entry("Patch drywall, small", "each", 95);
await entry("Door rehang", "each", 140);
await entry("Replace outlet", "each", null);
const [otherEntry] = await adminGet("service_catalog?client_id=eq.9&select=id");
const [otherJob] = await adminGet("jobs?client_id=eq.9&select=id");

// --- Old data survives v095 ------------------------------------------------------------
const [old] = await adminGet(`tasks?title=eq.${encodeURIComponent(OLD_TITLE)}&select=qty,unit,unit_price,billable,invoice_id`);
check("task from before v095: qty 1, no price, not billable",
  old && Number(old.qty) === 1 && old.unit === null && old.unit_price === null && !old.billable && old.invoice_id === null,
  JSON.stringify(old));

// --- Database rules, through the API (on a second job, so the UI job stays clean) ------
const job2 = (await owner.post("jobs", { client_id: 8, name: "API rules job", status: "lead", source: "manual" })).body[0];
const line = (payload) => owner.post("tasks", { client_id: 8, job_id: job2.id, title: "rule probe", ...payload });

r = await line({ billable: true });
check("a billable line needs a price", r.status === 400 && /tasks_billable_priced/.test(r.body.message));
r = await line({ qty: 0, unit: "each", unit_price: 5 });
check("qty must be more than 0", r.status === 400 && /tasks_qty_check/.test(r.body.message));
r = await line({ unit: "day" });
check("unit is each, hour, sqft or lnft", r.status === 400 && /tasks_unit_check/.test(r.body.message));

// --- Tenant isolation -------------------------------------------------------------------
r = await owner.post("tasks", { client_id: 8, job_id: otherJob.id, title: "cross-tenant" });
check("can't hang a line on another tenant's job", r.status >= 400 && /tasks_job_same_tenant/.test(r.body.message), r.body?.message);
r = await line({ service_id: otherEntry.id, unit: "each", unit_price: 1 });
check("can't point a line at another tenant's price book", r.status >= 400 && /tasks_service_same_tenant/.test(r.body.message), r.body?.message);
r = await owner.post("tasks", { client_id: 9, job_id: otherJob.id, title: "into tenant 9" });
check("can't write another tenant's lines", r.status === 403, `status ${r.status}`);
r = await other.get("tasks?select=client_id");
check("other tenant reads none of Cascade's lines", r.status === 200 && r.body.every((x) => x.client_id === 9));

// --- Invoiced lock (stands in for slice 3's invoice code with the service role) ----------
const inv = async (status, n) =>
  (await adminCall("POST", "invoices", { client_id: 8, job_id: job2.id, customer_name: "Test", status, invoice_number: n })).body[0];
const sent = await inv("sent", "CAS-TEST-001");
const draft = await inv("draft", "CAS-TEST-002");

r = await line({ unit: "each", unit_price: 50, billable: true, invoice_id: draft.id });
check("the browser can't claim a line onto an invoice", r.status === 403 && /from the invoice/.test(r.body.message), r.body?.message);

const l1 = (await line({ title: "billed line", unit: "each", unit_price: 50, billable: true })).body[0];
const l2 = (await line({ title: "draft line", unit: "each", unit_price: 70, billable: true })).body[0];
r = await adminCall("PATCH", `tasks?id=eq.${l1.id}`, { invoice_id: sent.id });
check("invoice code (service role) can claim a line", r.status === 200 && r.body[0].invoice_id === sent.id);
await adminCall("PATCH", `tasks?id=eq.${l2.id}`, { invoice_id: draft.id });

r = await owner.patch(`tasks?id=eq.${l1.id}`, { unit_price: 10 });
check("a line on a sent invoice keeps its price", r.status === 403 && /CAS-TEST-001.*final/.test(r.body.message), r.body?.message);
r = await owner.patch(`tasks?id=eq.${l1.id}`, { billable: false });
check("…and can't be switched off billing", r.status === 403);
r = await owner.patch(`tasks?id=eq.${l1.id}`, { status: "done", note: "finished" });
check("…but can still be checked off and noted", r.status === 200 && r.body[0].status === "done");
r = await owner.patch(`tasks?id=eq.${l1.id}`, { invoice_id: null });
check("the browser can't release a line from its invoice", r.status === 403);
r = await owner.patch(`tasks?id=eq.${l2.id}`, { unit_price: 75 });
check("a line on a draft invoice stays editable", r.status === 200 && Number(r.body[0].unit_price) === 75);
await adminCall("PATCH", `invoices?id=eq.${sent.id}`, { status: "voided" });
r = await owner.patch(`tasks?id=eq.${l1.id}`, { unit_price: 55 });
check("voiding the invoice unlocks the price", r.status === 200 && Number(r.body[0].unit_price) === 55);

// --- Members ----------------------------------------------------------------------------
r = await member.get(`tasks?job_id=eq.${job2.id}&select=id`);
check("members can read lines", r.status === 200 && r.body.length >= 2);
r = await member.patch(`tasks?id=eq.${l2.id}`, { unit_price: 1 });
check("members can't change lines", r.status === 200 && r.body.length === 0);

// --- The scope builder on a phone (job 1) ----------------------------------------------
const browser = await launch();
const page = await login(browser, "owner@cascade.test", PHONE);
await page.goto(`${APP}/app/jobs/1`);
const scope = page.getByTestId("scope");
const picker = scope.getByLabel("Add from price book");
await picker.waitFor();
await page.waitForLoadState("networkidle");
check("old task shows as a plain line", (await scope.locator(`li[data-line="${OLD_TITLE}"]`).count()) === 1 &&
  (await scope.locator(`li[data-line="${OLD_TITLE}"]`).getByRole("button", { name: "More" }).count()) === 0);

const serverHits = [];
page.on("request", (q) => {
  const rsc = q.headers()["rsc"] === "1" || q.url().includes("_rsc=");
  if (q.isNavigationRequest() || rsc) serverHits.push(q.url());
});
const row = (title) => scope.locator(`li[data-line="${title}"]`);
const pick = async (query, name) => {
  await picker.click();
  await picker.fill(query);
  await scope.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await row(name).waitFor();
};

await pick("patch", "Patch drywall, small");
await row("Patch drywall, small").getByRole("button", { name: "More" }).click();
await row("Patch drywall, small").getByRole("button", { name: "More" }).click();
await row("Patch drywall, small").getByText("$285.00").waitFor();
check("one tap adds qty 1; the stepper updates the line total", true, "3 × $95.00 = $285.00");
await pick("door", "Door rehang");
await pick("outlet", "Replace outlet");
check("an unpriced entry shows needs a price",
  (await row("Replace outlet").innerText()).toLowerCase().includes("needs a price"));
await pick("labor", "Labor, hourly");

const custom = async (title, mode, amount) => {
  await scope.getByLabel("Custom line title").fill(title);
  if (mode) {
    await scope.getByRole("button", { name: mode === "price" ? "Price" : "Hours", exact: true }).click();
    await scope.getByLabel(mode === "price" ? "Line price" : "Line hours").fill(amount);
  }
  await scope.getByRole("button", { name: "Add", exact: true }).click();
  await row(title).waitFor();
};
await custom("Haul debris", "price", "60");
await custom("Extra labor", "hours", "1.5");
await custom("Bring ladder");
check("custom lines: price, hours at the hourly rate, and a reminder",
  (await row("Extra labor").innerText()).includes("$127.50") &&
  (await row("Bring ladder").getByRole("button", { name: "Edit price" }).count()) === 0);

await row("Replace outlet").getByRole("button", { name: "Edit price" }).click();
await row("Replace outlet").getByLabel("Price", { exact: true }).fill("45");
await row("Replace outlet").getByLabel("Price", { exact: true }).press("Enter");
await row("Replace outlet").getByText("$45.00").first().waitFor();
await row("Door rehang").getByRole("button", { name: "Mark Door rehang done" }).click();

// A save that fails shows it, and Retry recovers.
await page.route("**/rest/v1/tasks?id=*", (route) =>
  route.request().method() === "PATCH" ? route.abort() : route.continue());
await row("Haul debris").getByRole("button", { name: "More" }).click();
await row("Haul debris").getByText("Not saved").waitFor();
check("a failed save says so", true);
await page.unroute("**/rest/v1/tasks?id=*");
await row("Haul debris").getByRole("button", { name: "Retry" }).click();
await row("Haul debris").getByText("Saved").waitFor();
check("Retry saves it", true);

await page.waitForTimeout(1500);
check("no page reloads or server re-renders while building", serverHits.length === 0, serverHits.join(" "));
const barTotal = (await page.getByTestId("scope-total").innerText()).replace(/\s+/g, " ");
check("running total: $285 + $140 + $45 + $85 + $120 + $127.50", barTotal.includes("$802.50"), barTotal);

const db = await adminGet("tasks?job_id=eq.1&select=title,qty,unit_price,billable,status");
const dbTotal = db.filter((t) => t.billable).reduce((s, t) => s + Math.round(Number(t.qty) * Number(t.unit_price) * 100), 0) / 100;
check("what's saved adds up to the same total", dbTotal === 802.5, `db ${dbTotal}`);
check("done state saved", db.find((t) => t.title === "Door rehang")?.status === "done");

const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check("no sideways scroll at 390 px", overflow <= 0, `${overflow}px`);
const small = await scope.locator("button:visible, input:visible").evaluateAll((els) =>
  els.filter((el) => el.getBoundingClientRect().height < 44).map((el) => el.getAttribute("aria-label") || el.textContent?.trim() || el.tagName));
check("every control in the scope is at least 44 px tall", small.length === 0, small.join(", "));
await page.screenshot({ path: "/opt/fieldstack/e2e/slice2-scope.png", fullPage: true });

// Price book edits don't leak into the job.
await owner.patch(`service_catalog?id=eq.${patchEntry.id}`, { unit_price: 110 });
await page.reload();
await row("Patch drywall, small").getByText("$285.00").waitFor();
check("changing the price book leaves existing lines alone", true, "still 3 × $95.00");

// Members see the scope read-only.
const memberPage = await login(browser, "member@cascade.test", PHONE);
await memberPage.goto(`${APP}/app/jobs/1`);
const mScope = memberPage.getByTestId("scope");
await mScope.locator('li[data-line="Patch drywall, small"]').waitFor();
check("members see the lines but no editing controls",
  (await mScope.getByLabel("Add from price book").count()) === 0 &&
  (await mScope.getByRole("button", { name: "More" }).count()) === 0);

// The other tenant can't open Cascade's job. (The route streams behind a
// loading screen, so the not-found page arrives with HTTP 200.)
const otherPage = await login(browser, "owner@other.test", PHONE);
await otherPage.goto(`${APP}/app/jobs/1`);
await otherPage.getByText("This page could not be found").waitFor();
check("another tenant gets not-found for the job, with none of its data",
  !/Pat Rivera|Patch drywall|100 Test St/.test(await otherPage.content()));

// The old estimate builder still opens on a job with priced lines.
await page.goto(`${APP}/app/estimator/new?job=1`);
await page.getByPlaceholder("Search catalog…").waitFor();
check("estimate builder still opens", true);

await browser.close();
