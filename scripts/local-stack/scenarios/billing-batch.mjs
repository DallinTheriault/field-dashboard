// v103 billing from the job: invoice from the job page, minimum and hourly
// invoices, hours claimed and covered, expenses edited and deleted, plain job
// numbers, and the shell cleanup. Cascade (client 8) on a fresh stack.
import { APP, PHONE, check, launch, login } from "./browser.mjs";
import { adminCall, adminGet, session } from "./api.mjs";

const owner = await session("owner@cascade.test");
const usd = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
const eventually = async (fn, ms = 15_000) => {
  for (const end = Date.now() + ms; ; await new Promise((ok) => setTimeout(ok, 250))) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) return null;
  }
};
const inv = async (id) => (await adminGet(`invoices?id=eq.${id}&select=*`))[0];
const hours = async (jobId) => adminGet(`time_entries?job_id=eq.${jobId}&select=id,hours,invoice_id,covered_at&order=id`);
const billing = async (jobId) => (await adminGet(`job_billing?job_id=eq.${jobId}&select=state,ready_count`))[0];

await owner.patch("pricing_settings?client_id=eq.8", {
  default_hourly_rate: 110, skilled_hourly_rate: 125, minimum_job_charge: 150, material_markup_pct: 0,
});

// --- Plain job numbers ---------------------------------------------------------------------------------
const [counter0] = await adminGet("job_counters?client_id=eq.8&select=last_job_seq");
const mkJob = async (name, status = "completed") =>
  (await owner.post("jobs", { client_id: 8, name, status, source: "manual", address: `${name} St, Provo, UT 84601` })).body[0];
const ronny = await mkJob("Ronny Test");
const hourly = await mkJob("Hal Hourly");
check("a new job takes the business's next number: Job N, then N+1",
  ronny.job_number === `Job ${counter0.last_job_seq + 1}` && hourly.job_number === `Job ${counter0.last_job_seq + 2}` &&
  ronny.job_seq === counter0.last_job_seq + 1, `${ronny.job_number}, ${hourly.job_number}`);
const [seed] = await adminGet("jobs?client_id=eq.8&order=created_at&limit=1&select=job_number,job_seq");
check("jobs from before are numbered from 1 in the order they were made", seed.job_number === "Job 1" && seed.job_seq === 1);
let r = await owner.patch(`jobs?id=eq.${ronny.id}`, { name: "Ronny Renamed" });
check("a renamed job keeps its number", r.body?.[0]?.job_number === ronny.job_number);

const pricedJob = await mkJob("Pat Priced");
const minJob = await mkJob("Mia Minimum");

// Ronny: half an hour, a kit included in the price, no work lines (the case Dallin hit).
await owner.post("time_entries", { client_id: 8, job_id: ronny.id, entry_date: "2026-10-19", hours: 0.5 });
const kit = (await owner.post("expenses", {
  client_id: 8, job_id: ronny.id, description: "Toilet repair kit", amount: 17.48, qty: 1, unit_price: 17.48,
  assignment: "job_in_bid", category: "Materials & supplies", expense_date: "2026-10-19",
})).body[0];
const cash = (await owner.post("expenses", {
  client_id: 8, job_id: ronny.id, description: "Cash parts", amount: 5, qty: 1, unit_price: 5,
  assignment: "job_in_bid", category: "Materials & supplies", expense_date: "2026-10-19",
})).body[0];

const browser = await launch();
const page = await login(browser, "owner@cascade.test", PHONE);
await page.addInitScript(() => {
  window.__shared = [];
  navigator.canShare = () => true;
  navigator.share = async (data) => {
    window.__shared.push({ text: data.text, files: (data.files ?? []).map((f) => ({ name: f.name })) });
  };
});
page.on("dialog", (d) => d.accept());
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
for (const path of ["/app/estimator/invoices", `/app/jobs/${ronny.id}/invoice`, `/app/jobs/${ronny.id}`]) {
  await page.goto(`${APP}${path}`);
  await page.waitForLoadState("networkidle");
}
const send = async () => {
  await page.getByRole("button", { name: "Share invoice" }).click();
  await page.getByText("Shared. Did it go out?").waitFor();
  await page.getByRole("button", { name: "Mark as sent" }).click();
  await page.getByText("Share PDF again").waitFor();
};

// --- The job page: invoice from the job, work vs expense --------------------------------------------
await page.goto(`${APP}/app/jobs/${ronny.id}`);
await page.waitForLoadState("networkidle");
check("the job page shows its plain number", (await page.getByText(ronny.job_number, { exact: true }).count()) === 1);
check("Ready to invoice opens the invoice builder, and there's a Create invoice button",
  (await page.getByRole("link", { name: "Ready to invoice: create the invoice" }).getAttribute("href")) === `/app/jobs/${ronny.id}/invoice` &&
  (await page.getByTestId("create-invoice").getAttribute("href")) === `/app/jobs/${ronny.id}/invoice`);
const woe = page.getByTestId("work-or-expense");
check("Add work and Log expense sit side by side, each saying what it's for",
  /Add work\s*What you're billing for/.test(await woe.innerText()) && /Log expense\s*Money you spent/.test(await woe.innerText()));
await woe.getByRole("button", { name: /^Add work/ }).click();
check("Add work puts the cursor in the work line box", await page.evaluate(() => document.activeElement?.id === "add-work"));
await woe.getByRole("button", { name: /^Log expense/ }).click();
check("Log expense puts the cursor in the expense box", await page.evaluate(() => document.activeElement?.id === "log-expense"));
check("receipt lines say Included in my price", (await page.getByText("included", { exact: true }).count()) >= 2);

// Edit and delete a logged expense.
await page.getByRole("button", { name: "Reassign Toilet repair kit" }).click();
check("the reassign choices use the new words",
  (await page.getByRole("button", { name: "Assign to Included in my price" }).count()) === 1 &&
  (await page.getByRole("button", { name: "Assign to Bill to customer" }).count()) === 1);
await page.getByRole("button", { name: "Edit Toilet repair kit" }).click();
const ed = page.getByTestId("edit-expense");
await ed.getByLabel("Price each").fill("18");
await ed.getByRole("button", { name: "Save" }).click();
check("an expense can be edited", !!(await eventually(async () =>
  Number((await adminGet(`expenses?id=eq.${kit.id}&select=amount`))[0].amount) === 18)));
await page.waitForLoadState("networkidle");
await page.getByRole("button", { name: "Reassign Cash parts" }).click();
await page.getByRole("button", { name: "Delete Cash parts" }).click();
check("…and deleted", !!(await eventually(async () => (await adminGet(`expenses?id=eq.${cash.id}&select=id`)).length === 0)));
await owner.patch(`expenses?id=eq.${kit.id}`, { amount: 17.48, unit_price: 17.48 });

// --- Minimum invoice: Ronny ---------------------------------------------------------------------------
await page.goto(`${APP}/app/jobs/${ronny.id}/invoice`);
await page.waitForLoadState("networkidle");
const work = page.getByTestId("builder-work");
check("no work lines: the builder says so and lets you type what you did",
  /No work lines on the job/.test(await work.innerText()) && (await work.getByLabel("What you did").count()) === 1);
await work.getByLabel("What you did").fill("Replaced toilet fill valve");
await work.getByRole("button", { name: "Add line" }).click();
const hrs = page.getByTestId("builder-hours");
check("logged hours bill at the general rate: 0.5 hr = $55.00, ticked",
  (await hrs.getByLabel("Bill logged hours").isChecked()) && (await hrs.innerText()).includes("$55.00"));
check("the kit is offered unticked (it's included in the price)",
  !(await page.getByLabel("Bill Toilet repair kit to customer").isChecked()) &&
  (await page.getByTestId("builder-parts").innerText()).includes("Included in my price"));
const suggest = page.getByTestId("suggest-minimum");
check("under the minimum, the builder suggests billing as minimum",
  (await suggest.innerText()).includes("This comes to $55.00 before tax, under your $150.00 minimum."));
await suggest.getByRole("button", { name: "Bill as minimum" }).click();
const preview = page.getByTestId("invoice-preview");
const rows = await preview.locator("li[data-row]").evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, " ")));
check("Bill as minimum: each line and part at $0.00, then the minimum trip charge",
  rows.join(" | ") === "Replaced toilet fill valve $0.00 | Toilet repair kit $0.00 | Minimum trip charge $150.00" &&
  (await page.getByTestId("preview-subtotal").innerText()) === "$150.00", rows.join(" | "));
await page.getByRole("button", { name: "Create draft" }).click();
await page.waitForURL(/\/app\/estimator\/invoices\/\d+$/);
const minInv = Number(page.url().split("/").pop());
let i1 = await inv(minInv);
check("the draft is the minimum invoice", i1.total_cents === 15000 &&
  JSON.stringify(i1.line_items.map((x) => [x.description, x.amount])) ===
    JSON.stringify([["Replaced toilet fill valve", 0], ["Toilet repair kit", 0], ["Minimum trip charge", 150]]));
const typed = (await adminGet(`tasks?job_id=eq.${ronny.id}&select=id,title,status,unit_price,billable,invoice_id`))[0];
check("the typed line became a done work line on the job, claimed by the draft",
  typed?.title === "Replaced toilet fill valve" && typed.status === "done" && Number(typed.unit_price) === 0 && typed.billable && typed.invoice_id === minInv);
check("the minimum line claims the hours", (await hours(ronny.id)).every((h) => h.invoice_id === minInv && h.covered_at === null));
check("the kit stays a job cost, included in the price, not billed",
  (await adminGet(`expenses?id=eq.${kit.id}&select=assignment,invoiced_on`))[0].assignment === "job_in_bid");
await page.waitForLoadState("networkidle");
await send();
i1 = await inv(minInv);
check("a minimum invoice with $0.00 lines goes out", i1.status === "sent" && i1.line_items.filter((x) => x.amount === 0).length === 2);
r = await owner.del(`time_entries?job_id=eq.${ronny.id}`);
check("hours on an invoice that went out can't be deleted", r.status >= 400 && /went out/.test(r.body?.message), r.body?.message);
await page.goto(`${APP}/app/jobs/${ronny.id}`);
await page.waitForLoadState("networkidle");
check("the hours show where they went, with no delete",
  (await page.getByTestId("hours-billing").first().innerText()).includes(`billed on ${i1.invoice_number}`) &&
  (await page.getByRole("button", { name: "Delete entry" }).count()) === 0);
check("the job is invoiced", (await billing(ronny.id)).state === "invoiced");

// --- Hourly invoice: Hal ------------------------------------------------------------------------------
const [h1] = (await owner.post("time_entries", { client_id: 8, job_id: hourly.id, entry_date: "2026-10-20", hours: 2 })).body;
const [h2] = (await owner.post("time_entries", { client_id: 8, job_id: hourly.id, entry_date: "2026-10-21", hours: 1 })).body;
const billIt = (await owner.post("expenses", {
  client_id: 8, job_id: hourly.id, description: "Supply line", amount: 40, qty: 1, unit_price: 40,
  assignment: "job_extra", category: "Materials & supplies", expense_date: "2026-10-20",
})).body[0];
const inc = (await owner.post("expenses", {
  client_id: 8, job_id: hourly.id, description: "Wax ring", amount: 10, qty: 1, unit_price: 10,
  assignment: "job_in_bid", category: "Materials & supplies", expense_date: "2026-10-20",
})).body[0];
await page.goto(`${APP}/app/jobs/${hourly.id}/invoice`);
await page.waitForLoadState("networkidle");
check("3 hr at the general rate: $330.00", (await page.getByTestId("builder-hours").innerText()).includes("$330.00"));
await page.getByRole("radio", { name: /^Skilled/ }).click();
check("switch to skilled: $375.00", (await page.getByTestId("builder-hours").innerText()).includes("$375.00"));
check("bill-to-customer lines start ticked, included ones unticked",
  (await page.getByLabel("Bill Supply line to customer").isChecked()) && !(await page.getByLabel("Bill Wax ring to customer").isChecked()));
await page.getByLabel("Bill Wax ring to customer").check();
check("over the minimum: no suggestion", (await page.getByTestId("suggest-minimum").count()) === 0 &&
  (await page.getByTestId("preview-subtotal").innerText()) === "$425.00");
await page.getByRole("button", { name: "Create draft" }).click();
await page.waitForURL(/\/app\/estimator\/invoices\/\d+$/);
const hourInv = Number(page.url().split("/").pop());
let i2 = await inv(hourInv);
const labor = i2.line_items.find((x) => x.kind === "labor");
check("one labor line from the logged hours, at the skilled rate, plus the two materials at cost",
  labor?.description === "Skilled labor" && labor.qtyLabel === "3 hr × $125.00/hr" && labor.amount === 375 &&
  JSON.stringify(labor.time_entry_ids) === JSON.stringify([h1.id, h2.id]) && i2.total_cents === 42500, JSON.stringify(i2.line_items));
check("ticking an included line moved it to Bill to customer, on this draft",
  (await adminGet(`expenses?id=eq.${inc.id}&select=assignment,invoiced_on`))[0].invoiced_on === hourInv &&
  (await adminGet(`expenses?id=eq.${inc.id}&select=assignment`))[0].assignment === "job_extra");
check("the draft claims the hours", (await hours(hourly.id)).every((h) => h.invoice_id === hourInv));

// Hours deleted while it's a draft: the labor line follows.
await page.goto(`${APP}/app/jobs/${hourly.id}`);
await page.waitForLoadState("networkidle");
check("hours on a draft say so and can still be deleted",
  (await page.getByTestId("hours-billing").first().innerText()).startsWith("on draft") && (await page.getByRole("button", { name: "Delete entry" }).count()) === 2);
r = await owner.del(`time_entries?id=eq.${h2.id}`);
check("an hour on a draft can be deleted", r.status === 200 && r.body?.length === 1, JSON.stringify(r.body).slice(0, 160));
i2 = await inv(hourInv);
const labor2 = i2.line_items.find((x) => x.kind === "labor");
check("deleting an hour re-prices the labor line on the draft: 2 hr = $250.00",
  labor2?.qtyLabel === "2 hr × $125.00/hr" && labor2.amount === 250 && JSON.stringify(labor2.time_entry_ids) === JSON.stringify([h1.id]) &&
  i2.total_cents === 30000, JSON.stringify(labor2));

// Editing the draft keeps what each line claims.
await page.goto(`${APP}/app/estimator/invoices/${hourInv}`);
await page.waitForLoadState("networkidle");
await page.getByLabel(/^Amount for Additional materials.*Wax ring/).fill("12.00");
await page.getByRole("button", { name: "Save changes" }).click();
check("saving draft edits keeps the hours and extras claimed", !!(await eventually(async () => {
  const x = await inv(hourInv);
  const l = x.line_items.find((y) => y.kind === "labor");
  return x.total_cents === 30200 && l?.rate === 125 && JSON.stringify(l.time_entry_ids) === JSON.stringify([h1.id]);
})));
await page.reload();
await page.waitForLoadState("networkidle");
await send();
r = await owner.patch(`expenses?id=eq.${billIt.id}`, { amount: 1 });
check("an expense on an invoice that went out can't change", r.status >= 400 && /went out/.test(r.body?.message), r.body?.message);
r = await owner.del(`expenses?id=eq.${billIt.id}`);
check("…or be deleted", r.status >= 400 && /went out/.test(r.body?.message), r.body?.message);
r = await adminCall("POST", "rpc/invoice_void", { p_invoice_id: hourInv });
check("voiding releases the hours", r.status < 300 && (await hours(hourly.id)).every((h) => h.invoice_id === null && h.covered_at === null));

// --- Priced work: hours unticked, covered at send, the job reaches Paid ----------------------------------
await owner.post("tasks", { client_id: 8, job_id: pricedJob.id, title: "Rebuild shower valve", status: "done", qty: 1, unit: "each", unit_price: 400, billable: true, sort_order: 1 });
await owner.post("time_entries", { client_id: 8, job_id: pricedJob.id, entry_date: "2026-10-20", hours: 2 });
await page.goto(`${APP}/app/jobs/${pricedJob.id}/invoice`);
await page.waitForLoadState("networkidle");
check("priced work lines: hours start unticked, with the note",
  !(await page.getByLabel("Bill logged hours").isChecked()) && (await page.getByTestId("hours-covered-note").count()) === 1);
await page.getByRole("button", { name: "Create draft" }).click();
await page.waitForURL(/\/app\/estimator\/invoices\/\d+$/);
const pricedInv = Number(page.url().split("/").pop());
check("before it's sent, the unbilled hours keep the job ready", (await billing(pricedJob.id)).state === "ready");
await page.waitForLoadState("networkidle");
await send();
check("sending covers the hours left unticked", (await hours(pricedJob.id)).every((h) => h.invoice_id === pricedInv && h.covered_at !== null));
await owner.post("payments", { client_id: 8, invoice_id: pricedInv, received_on: "2026-10-22", amount_cents: 40000, method: "check" });
check("paid in full, the job reaches Paid", (await billing(pricedJob.id))?.state === "paid", JSON.stringify(await billing(pricedJob.id)));
await owner.post("time_entries", { client_id: 8, job_id: pricedJob.id, entry_date: "2026-10-23", hours: 1 });
check("new hours on the completed job make it ready to invoice again", (await billing(pricedJob.id)).state === "ready");

// --- Add minimum trip charge on a draft ----------------------------------------------------------------
await owner.post("tasks", { client_id: 8, job_id: minJob.id, title: "Swap faucet cartridge", status: "done", qty: 1, unit: "each", unit_price: 60, billable: true, sort_order: 1 });
await page.goto(`${APP}/app/jobs/${minJob.id}/invoice`);
await page.waitForLoadState("networkidle");
await page.getByRole("button", { name: "Create draft" }).click();
await page.waitForURL(/\/app\/estimator\/invoices\/\d+$/);
const mInv = Number(page.url().split("/").pop());
await page.waitForLoadState("networkidle");
const warn = page.getByTestId("min-charge");
check("a draft under the minimum says so, before tax", (await warn.innerText()).includes("$90.00 under your minimum job charge (before tax)."));
await warn.getByRole("button", { name: "Add minimum trip charge" }).click();
const m = await eventually(async () => {
  const x = await inv(mInv);
  return x.total_cents === 15000 ? x : null;
});
check("one tap: the other lines go to $0.00 and the minimum trip charge is added",
  !!m && JSON.stringify(m.line_items.map((x) => [x.description, x.amount])) === JSON.stringify([["Swap faucet cartridge", 0], ["Minimum trip charge", 150]]) &&
  m.line_items[0].task_id !== undefined, JSON.stringify(m?.line_items));
await page.reload();
await page.waitForLoadState("networkidle");
check("…and the warning goes away", (await page.getByTestId("min-charge").count()) === 0);

// --- Shell -----------------------------------------------------------------------------------------------
const desk = await login(browser, "owner@cascade.test", { width: 1280, height: 900 });
await desk.goto(`${APP}/app`);
await desk.waitForLoadState("networkidle");
const body = await desk.locator("body").innerText();
check("no search box and no version label", (await desk.getByPlaceholder(/Search/).count()) === 0 &&
  (await desk.getByRole("button", { name: "Search" }).count()) === 0 && !/v0\.\d+\.\d+/.test(body));
check("no errors on any page", errors.length === 0, errors.join("; "));
await browser.close();
