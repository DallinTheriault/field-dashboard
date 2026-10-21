// Job billing badge (v099): the state is worked out from lines, extras,
// invoices and payments; owners can mark an old job paid outside Field.
// Run on a stack with every migration (job-billing.sh rebuilds it).
import { APP, PHONE, check, launch, login } from "./browser.mjs";
import { adminCall, adminGet, session } from "./api.mjs";

const owner = await session("owner@cascade.test");
const member = await session("member@cascade.test");
const other = await session("owner@other.test");
const entityId = (await adminGet("billing_entities?client_id=eq.8&select=id"))[0].id;
let r;

const state = async (jobId) => (await adminGet(`job_billing?job_id=eq.${jobId}&select=state`))[0]?.state ?? null;
const job = async (name, status = "in_progress") =>
  (await owner.post("jobs", { client_id: 8, name, status, source: "manual", address: `${name} Rd` })).body[0];
let sort = 0;
const line = async (jobId, title, extra = {}) =>
  (await owner.post("tasks", {
    client_id: 8, job_id: jobId, title, unit: "each", unit_price: 100, billable: true, status: "done", sort_order: ++sort, ...extra,
  })).body[0];
const invoiceFor = async (jobId, tasks) => {
  const rows = tasks.map((t) => ({ description: t.title, qtyLabel: null, amount: Number(t.unit_price), task_id: t.id }));
  const sub = rows.reduce((n, x) => n + Math.round(x.amount * 100), 0);
  const res = await owner.post("rpc/invoice_create_from_job", { p: {
    client_id: 8, job_id: jobId, billing_entity_id: entityId, customer_name: "Pat", line_items: rows,
    subtotal_cents: sub, tax_rate_pct: 0, tax_cents: 0, total_cents: sub,
  } });
  if (res.status !== 200) throw new Error(`invoice: ${JSON.stringify(res.body)}`);
  return Number(res.body.invoice_id);
};
const send = (id) => owner.patch(`invoices?id=eq.${id}`, { status: "sent" });
const pay = (invoice_id, amount_cents) =>
  owner.post("payments", { client_id: 8, invoice_id, received_on: "2026-10-10", amount_cents, method: "check" });

// --- States, through the database ----------------------------------------------------------------
const a = await job("Annie Nothing");
check("a job with nothing billable has no badge", (await state(a.id)) === null);
await line(a.id, "Open work", { status: "open" });
check("…nor one whose billable work isn't finished", (await state(a.id)) === null);

const b = await job("Bea Ready");
const b1 = await line(b.id, "Patch");
check("finished billable line, not invoiced: Ready to invoice", (await state(b.id)) === "ready");
const bInv = await invoiceFor(b.id, [b1]);
check("…still ready while it's only on an unsent draft", (await state(b.id)) === "ready");
await send(bInv);
check("sent, nothing paid: Invoiced", (await state(b.id)) === "invoiced");
await pay(bInv, 4000);
check("some paid: Part paid", (await state(b.id)) === "part_paid");
await pay(bInv, 6000);
check("all paid: Paid", (await state(b.id)) === "paid");
const b2 = await line(b.id, "Second patch", { status: "open" });
check("nothing owed is Paid, even with billable work still to finish", (await state(b.id)) === "paid");
await owner.patch(`tasks?id=eq.${b2.id}`, { status: "done" });
check("…and once that work is finished: Ready to invoice", (await state(b.id)) === "ready");
await owner.patch(`tasks?id=eq.${b2.id}`, { billable: false });
check("not billable after all: back to Paid", (await state(b.id)) === "paid");

const g = await job("Gus Unchecked");
const g1 = await line(g.id, "Fence stain", { status: "open" });
check("an unchecked billable line on a job still in progress: no badge", (await state(g.id)) === null);
await owner.patch(`jobs?id=eq.${g.id}`, { status: "completed" });
check("once the job is completed, its unchecked billable lines count as finished: Ready to invoice", (await state(g.id)) === "ready");
const gInv = await invoiceFor(g.id, [g1]);
await send(gInv);
check("…and invoicing them clears it: Invoiced", (await state(g.id)) === "invoiced");
await pay(gInv, 10000);
check("…then Paid", (await state(g.id)) === "paid");

const h = await job("Hal Paidish");
const h1 = await line(h.id, "Deposit work");
const hInv = await invoiceFor(h.id, [h1]);
await send(hInv);
await pay(hInv, 10000);
await line(h.id, "Rest of the job", { status: "open" });
check("paid in full with more work still open: Paid", (await state(h.id)) === "paid");

const c = await job("Cal Void");
const c1 = await line(c.id, "Gutter");
const cInv = await invoiceFor(c.id, [c1]);
await send(cInv);
await adminCall("POST", "rpc/invoice_void", { p_invoice_id: cInv });
check("a voided invoice doesn't count: its lines are ready again", (await state(c.id)) === "ready");

const d = await job("Dot Done", "completed");
check("completed with nothing sent: Ready to invoice", (await state(d.id)) === "ready");
const e = await job("Eve Extra");
r = await owner.post("expenses", { client_id: 8, job_id: e.id, assignment: "job_extra", description: "Paint", amount: 42, qty: 1, unit_price: 42, expense_date: "2026-10-01", category: "Materials & supplies", customer_notified: false });
if (r.status !== 201) throw new Error(`extra: ${JSON.stringify(r.body)}`);
check("an extra not invoiced: Ready to invoice", (await state(e.id)) === "ready");
const f = await job("Finn Unpriced");
await line(f.id, "Mystery fix", { unit_price: null });
check("a finished billable line with no price yet is still ready to invoice", (await state(f.id)) === "ready");

r = await other.get(`job_billing?job_id=eq.${b.id}&select=state`);
check("another business can't see this business's billing", r.status === 200 && r.body.length === 0);
r = await fetch((await import("node:fs")).readFileSync(new URL("../../../.env.local", import.meta.url), "utf8")
  .match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1] + "/rest/v1/job_billing?select=state", {
  headers: { apikey: (await import("node:fs")).readFileSync(new URL("../../../.env.local", import.meta.url), "utf8").match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1] },
});
check("signed out, the view is closed", r.status === 401 || r.status === 403 || (r.status === 200 && (await r.json()).length === 0), `status ${r.status}`);

// --- Paid outside Field: who, when, and no income ----------------------------------------------------
const old = await job("Olga Oldjob", "completed");
await line(old.id, "Old repaint");
const paymentsBefore = (await adminGet("payments?client_id=eq.8&select=id")).length;
r = await member.patch(`jobs?id=eq.${old.id}`, { paid_outside_at: new Date().toISOString() });
check("a member can't mark a job paid outside Field", r.status === 403 && (await state(old.id)) === "ready", `status ${r.status}`);
const memberId = (await adminGet("client_users?client_id=eq.8&role=eq.member&select=id"))[0].id;
await adminCall("PATCH", `client_users?id=eq.${memberId}`, { role: "manager" });
const manager = await session("member@cascade.test");
r = await manager.patch(`jobs?id=eq.${old.id}`, { paid_outside_at: new Date().toISOString() });
check("a manager can't either: owner only", r.status === 403 && /Only an owner/.test(r.body.message), r.body?.message);
r = await manager.patch(`jobs?id=eq.${old.id}`, { name: "Olga Oldjob" });
check("…while managers still edit jobs as before", r.status === 200 && r.body.length === 1);
await adminCall("PATCH", `client_users?id=eq.${memberId}`, { role: "member" });
r = await owner.patch(`jobs?id=eq.${old.id}`, { paid_outside_at: "2020-01-01T00:00:00Z", paid_outside_note: "Paid by check", paid_outside_by: "00000000-0000-0000-0000-000000000000" });
const [oldRow] = await adminGet(`jobs?id=eq.${old.id}&select=paid_outside_at,paid_outside_note,paid_outside_by`);
const ownerId = (await adminGet("client_users?client_id=eq.8&role=eq.owner&select=auth_user_id"))[0].auth_user_id;
check("the owner marks it; the time and who are the server's, not the caller's",
  r.status === 200 && oldRow.paid_outside_note === "Paid by check" && oldRow.paid_outside_by === ownerId &&
  new Date(oldRow.paid_outside_at) > new Date("2026-01-01"), JSON.stringify(oldRow));
check("…its badge is Paid", (await state(old.id)) === "paid");
check("…and it records no payment, so no income", (await adminGet("payments?client_id=eq.8&select=id")).length === paymentsBefore);
await line(old.id, "Later touch-up");
check("finished lines added later don't bring it back to Ready", (await state(old.id)) === "paid");
const oldInv = await invoiceFor(old.id, [(await adminGet(`tasks?job_id=eq.${old.id}&title=eq.Later%20touch-up&select=id,title,unit_price`))[0]]);
await send(oldInv);
check("but an invoice Field sends and isn't paid still shows: Invoiced", (await state(old.id)) === "invoiced");
await pay(oldInv, 10000);
check("…and Paid once it is", (await state(old.id)) === "paid");

r = await owner.patch(`jobs?id=eq.${b.id}`, { paid_outside_at: null });
const owes = await job("Ollie Owes", "completed");
const o1 = await line(owes.id, "Fence");
const owesInv = await invoiceFor(owes.id, [o1]);
await send(owesInv);
r = await owner.patch(`jobs?id=eq.${owes.id}`, { paid_outside_at: new Date().toISOString() });
check("refused while a sent invoice has money owed: record that payment instead",
  r.status === 400 && /money owed/.test(r.body.message) && (await state(owes.id)) === "invoiced", r.body?.message);
r = await owner.post("jobs", { client_id: 8, name: "Sneaky insert", status: "completed", source: "manual", paid_outside_at: new Date().toISOString() });
check("an owner can create a job already marked (server stamps it)", r.status === 201 && (await state(r.body[0].id)) === "paid");
r = await manager.post("jobs", { client_id: 8, name: "Sneaky manager", status: "completed", source: "manual", paid_outside_at: new Date().toISOString() });
check("…a non-owner can't", r.status === 403 || r.status === 401, `status ${r.status}`);

// --- On a phone: the job page --------------------------------------------------------------------------
const browser = await launch();
const page = await login(browser, "owner@cascade.test", PHONE);
const ui = await job("Uma Undo", "completed");
await line(ui.id, "Porch rail");
await page.goto(`${APP}/app/jobs/${ui.id}`);
await page.waitForLoadState("networkidle");
const header = page.locator("main");
check("the job page shows Ready to invoice next to the status",
  (await header.locator('[data-billing="ready"]').count()) === 1 && (await header.getByText("Ready to invoice").first().isVisible()));
const statuses = await page.evaluate(() => [...document.querySelectorAll("select option")].map((o) => o.textContent?.toLowerCase() ?? ""));
check("the status list has no Paid: status stays about the work", !statuses.some((s) => s.trim() === "paid"));
await page.getByRole("button", { name: "Job options" }).click();
await page.getByRole("menuitem", { name: "Mark paid outside Field" }).click();
const dialog = page.getByRole("dialog", { name: "Mark paid outside Field" });
check("the dialog says it adds nothing to income", /Nothing is\s+added to income/.test(await dialog.innerText()));
await dialog.getByLabel("Note").fill("Cash, June 2025");
await dialog.getByRole("button", { name: "Mark paid" }).click();
await page.locator('[data-billing="paid"]').first().waitFor();
check("marking it shows Paid and the note", /Cash, June 2025/.test(await page.getByTestId("paid-outside").innerText()));
await page.screenshot({ path: "/opt/fieldstack/e2e/billing-job-paid.png" });
await page.getByTestId("paid-outside").getByRole("button", { name: "Undo" }).click();
await page.locator('[data-billing="ready"]').first().waitFor();
check("Undo puts it back to Ready to invoice", (await state(ui.id)) === "ready" &&
  (await adminGet(`jobs?id=eq.${ui.id}&select=paid_outside_note`))[0].paid_outside_note === null);
await page.getByRole("button", { name: "Job options" }).click();
await page.getByRole("menuitem", { name: "Mark paid outside Field" }).click();
await page.getByRole("dialog", { name: "Mark paid outside Field" }).getByRole("button", { name: "Mark paid" }).click();
await page.locator('[data-billing="paid"]').first().waitFor();
await page.getByRole("button", { name: "Job options" }).click();
check("once marked, the menu offers Undo instead", (await page.getByRole("menuitem", { name: "Undo paid outside Field" }).count()) === 1 &&
  (await page.getByRole("menuitem", { name: "Mark paid outside Field" }).count()) === 0);
await page.keyboard.press("Escape");
await page.goto(`${APP}/app/jobs/${owes.id}`);
await page.waitForLoadState("networkidle");
await page.getByRole("button", { name: "Job options" }).click();
check("no Mark paid outside Field while an invoice has money owed", (await page.getByRole("menuitem", { name: "Mark paid outside Field" }).count()) === 0);
await page.keyboard.press("Escape");
await page.goto(`${APP}/app/jobs/${a.id}`);
await page.waitForLoadState("networkidle");
await page.getByRole("button", { name: "Job options" }).click();
check("…nor on a job with nothing to bill", (await page.getByRole("menuitem", { name: "Mark paid outside Field" }).count()) === 0);
await page.keyboard.press("Escape");

// --- Home ------------------------------------------------------------------------------------------------
await page.goto(`${APP}/app`);
await page.waitForLoadState("networkidle");
const readyRows = await page.getByTestId("ready-to-invoice").locator("[data-row]").evaluateAll((els) => els.map((x) => x.getAttribute("data-row")));
check("Home's Ready to invoice matches the badges", ["Cal Void", "Dot Done", "Eve Extra", "Finn Unpriced"].every((n) => readyRows.includes(n)) &&
  !readyRows.includes("Bea Ready") && !readyRows.includes("Uma Undo") && !readyRows.includes("Olga Oldjob") && !readyRows.includes("Ollie Owes") && !readyRows.includes("Annie Nothing"), readyRows.join(", "));
check("Home says when a finished line still needs a price",
  /1 needs a price/.test(await page.getByTestId("ready-to-invoice").locator('[data-row="Finn Unpriced"]').innerText()));

// --- Jobs list: phone and desktop, and the filter ---------------------------------------------------
await page.goto(`${APP}/app/jobs`);
await page.waitForLoadState("networkidle");
const card = (name) => page.locator("a", { hasText: name }).first();
check("phone list shows the badge on each card",
  (await card("Dot Done").locator('[data-billing="ready"]').count()) === 1 && (await card("Uma Undo").locator('[data-billing="paid"]').count()) === 1 &&
  (await card("Ollie Owes").locator('[data-billing="invoiced"]').count()) === 1 &&
  (await card("Annie Nothing").locator("[data-billing]").count()) === 0);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check("no sideways scroll on the jobs list at 390 px", overflow <= 0, `${overflow}px`);
await page.screenshot({ path: "/opt/fieldstack/e2e/billing-jobs-phone.png" });
await page.getByRole("navigation", { name: "Billing filter" }).getByRole("link", { name: "Unpaid" }).click();
await page.waitForURL(/billing=unpaid/);
const unpaidNames = await page.locator(".md\\:hidden a .text-sm.font-medium").allInnerTexts();
check("Unpaid lists ready, invoiced and part-paid jobs only",
  unpaidNames.includes("Dot Done") && unpaidNames.includes("Ollie Owes") && !unpaidNames.includes("Uma Undo") && !unpaidNames.includes("Bea Ready") &&
  !unpaidNames.includes("Hal Paidish") && unpaidNames.includes("Gus Unchecked") === false &&
  !unpaidNames.includes("Olga Oldjob") && !unpaidNames.includes("Annie Nothing"), unpaidNames.join(", "));
await page.getByRole("navigation", { name: "Billing filter" }).getByRole("link", { name: "Paid", exact: true }).click();
await page.waitForURL(/billing=paid/);
const paidNames = await page.locator(".md\\:hidden a .text-sm.font-medium").allInnerTexts();
check("Paid lists paid jobs only", paidNames.includes("Uma Undo") && paidNames.includes("Olga Oldjob") && paidNames.includes("Bea Ready") &&
  paidNames.includes("Hal Paidish") &&
  !paidNames.includes("Dot Done") && !paidNames.includes("Annie Nothing"), paidNames.join(", "));

const desk = await login(browser, "owner@cascade.test", { width: 1280, height: 900 });
await desk.goto(`${APP}/app/jobs`);
await desk.waitForLoadState("networkidle");
const deskRow = desk.locator("tr", { hasText: "Ollie Owes" });
check("desktop table shows the badge in the Status column", (await deskRow.locator('[data-billing="invoiced"]').count()) === 1);
await desk.screenshot({ path: "/opt/fieldstack/e2e/billing-jobs-desktop.png" });

// --- Pickers -------------------------------------------------------------------------------------------
// The Expenses page's "Log a purchase" job picker (mileage no longer has one).
await desk.goto(`${APP}/app/estimator/purchases`);
await desk.waitForLoadState("networkidle");
await desk.getByRole("button", { name: /Log a purchase/ }).click();
await desk.locator("select option").first().waitFor({ state: "attached" });
const options = await desk.evaluate(() => [...document.querySelectorAll("select option")].map((o) => o.textContent ?? ""));
check("job pickers show the billing state", options.some((o) => /Dot Done.*ready to invoice$/.test(o)) && options.some((o) => /Uma Undo.*· paid$/.test(o)),
  options.filter((o) => /Dot Done|Uma Undo/.test(o)).join(" | "));

// --- Members see no money ------------------------------------------------------------------------------
const mp = await login(browser, "member@cascade.test", PHONE);
await mp.goto(`${APP}/app/jobs`);
await mp.waitForLoadState("networkidle");
check("members see no billing badges or filter", (await mp.locator("[data-billing]").count()) === 0 &&
  (await mp.getByRole("navigation", { name: "Billing filter" }).count()) === 0);
await mp.goto(`${APP}/app/jobs/${ui.id}`);
await mp.waitForLoadState("networkidle");
await mp.getByRole("button", { name: "Job options" }).click();
check("…and no Mark paid outside Field or Undo", (await mp.locator("[data-billing]").count()) === 0 &&
  (await mp.getByRole("menuitem", { name: /paid outside Field/ }).count()) === 0 &&
  (await mp.getByTestId("paid-outside").getByRole("button", { name: "Undo" }).count()) === 0);
await browser.close();
