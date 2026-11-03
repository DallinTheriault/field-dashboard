// Assigning a receipt's items from the receipt's own page, at phone width:
// "Set all items to…", then exceptions one by one; billed items show their
// share of the receipt's tax; an item on a sent invoice stays as it is; one
// on a draft comes off it and the draft follows. Stock as Tools or
// Consumables files the item under that tax category on the Money page and in
// the CSV, and the totals don't move. Also: the Expenses item list loads again
// (an embed through invoiced_on broke it after v096).
// Needs the app on :3000 against the local stack.
import { APP, PHONE, check, launch, login } from "./browser.mjs";
import { adminCall, adminGet, session } from "./api.mjs";

const owner = await session("owner@cascade.test");
const entityId = (await adminGet("billing_entities?client_id=eq.8&select=id"))[0].id;
const [jobA, jobB] = await adminGet("jobs?client_id=eq.8&archived_at=is.null&status=neq.cancelled&select=id,name&order=id&limit=2");

// A receipt shaped like the one that couldn't be assigned: 9 unassigned items,
// subtotal $540.07, tax $40.24, total $580.31.
const amounts = [119.94, 79, 19.88, 249, 18.78, 5.14, 18.69, 2.67, 26.97];
const names = ["Copper pipe 10 ft", "Ball valve 3/4 in", "PVC cement", "Water heater element kit", "Teflon tape 3-pack", "Pipe wrench 14 in", "SharkBite coupling", "Wire nuts", "Work gloves"];
// A vendor name of its own, so this run's rows in the CSV are told apart from earlier runs'.
const VENDOR = `Home Depot ${Date.now() % 1_000_000}`;
const pid = (await adminCall("POST", "purchases", { client_id: 8, vendor: VENDOR, purchase_date: "2026-10-31", source: "scan", subtotal: 540.07, tax: 40.24, total: 580.31 })).body[0].id;
const itemRows = (await adminCall("POST", "expenses", amounts.map((a, i) => ({
  client_id: 8, purchase_id: pid, expense_date: "2026-10-31", category: "Materials & supplies", description: names[i],
  qty: 1, unit_price: a, amount: a, assignment: "unassigned",
})))).body;
const idOf = Object.fromEntries(itemRows.map((r) => [r.description, r.id]));
const db = async () => Object.fromEntries((await adminGet(`expenses?purchase_id=eq.${pid}&select=description,assignment,job_id,stock_category,category,invoiced_on`)).map((r) => [r.description, r]));

const browser = await launch();
const page = await login(browser, "owner@cascade.test", PHONE);
// The year's P&L as the Money page and the CSV for taxes show it.
const money = async () => {
  await page.goto(`${APP}/app/estimator/expenses?y=2026`);
  await page.getByText("Where it went").waitFor();
  const text = await page.locator("main").innerText();
  const csv = await (await page.request.get(`${APP}/api/estimator/expenses/csv?y=2026`)).text();
  const rows = csv.split("\r\n").map((l) => l.split(","));
  const expenseSum = rows.filter((r) => r[1] === "expense").reduce((t, r) => t + Number(r.at(-1)), 0);
  return { expenses: /Expenses\s+(\$[\d,]+\.\d\d)/i.exec(text)?.[1], text, csv, expenseSum: Math.round(expenseSum * 100) / 100 };
};
const before = await money();
const url = `${APP}/app/estimator/purchases/${pid}`;
const row = (name) => page.locator(`li[data-item="${name}"]`);
// Saved: the item's editor has closed and its row shows the new setting.
const saved = (name, text) =>
  page.waitForFunction(([n, t]) => {
    const li = document.querySelector(`li[data-item="${n}"]`);
    return !!li && !li.querySelector('[role="group"]') && li.querySelector("button").textContent.includes(t);
  }, [name, text]);

await page.goto(url);
check("receipt page lists its 9 items", (await page.locator("li[data-item]").count()) === 9);
check("every item starts unassigned", (await page.locator("li[data-item]", { hasText: "Unassigned" }).count()) === 9);

// 1. Set all items to "Bill to customer" on job A.
await page.getByRole("button", { name: "Set all items to…" }).click();
await page.getByRole("button", { name: /Bill to customer/ }).first().click();
await page.getByLabel("Job").selectOption(String(jobA.id));
await page.getByRole("button", { name: "Apply to all 9 items" }).click();
await page.waitForFunction(() => document.querySelectorAll("li[data-item]").length === 9 && ![...document.querySelectorAll("li[data-item]")].some((li) => li.textContent.includes("Unassigned")));
let d = await db();
check("set all: all 9 items billed to job A", Object.values(d).every((r) => r.assignment === "job_extra" && r.job_id === jobA.id), JSON.stringify(Object.values(d).map((r) => r.assignment)));
const totals = await page.getByLabel("Totals by setting").innerText();
check("totals: $540.07 billed, $580.31 with the receipt's tax", totals.includes("$540.07") && totals.includes("bills $580.31 with tax"), totals);
check("an item shows what it bills with its share of tax", (await row("Water heater element kit").innerText()).includes("bills $267.55"), await row("Water heater element kit").innerText());

// 2. Exceptions: gloves to stock, tape included in the price on job A.
await row("Work gloves").getByRole("button").first().click();
await row("Work gloves").getByRole("button", { name: /Stock \/ company/ }).click();
check("stock needs Tools or Consumables before it saves", await row("Work gloves").getByRole("button", { name: "Save" }).isDisabled());
await row("Work gloves").getByRole("button", { name: /^Consumables/ }).click();
await row("Work gloves").getByRole("button", { name: "Save" }).click();
await saved("Work gloves", "Stock · Consumables");
await row("Pipe wrench 14 in").getByRole("button").first().click();
await row("Pipe wrench 14 in").getByRole("button", { name: /Stock \/ company/ }).click();
await row("Pipe wrench 14 in").getByRole("button", { name: /^Tools/ }).click();
await row("Pipe wrench 14 in").getByRole("button", { name: "Save" }).click();
await saved("Pipe wrench 14 in", "Stock · Tools");
await row("Teflon tape 3-pack").getByRole("button").first().click();
await row("Teflon tape 3-pack").getByRole("button", { name: /Included in my price/ }).click();
check("an item's job starts on the one just used", (await row("Teflon tape 3-pack").getByLabel("Job").inputValue()) === String(jobA.id));
await row("Teflon tape 3-pack").getByRole("button", { name: "Save" }).click();
await saved("Teflon tape 3-pack", "Included in my price");
d = await db();
check("gloves: stock, Consumables, taxed as Materials & supplies", d["Work gloves"].assignment === "stock" && d["Work gloves"].stock_category === "Consumables" && d["Work gloves"].category === "Materials & supplies" && d["Work gloves"].job_id === null, JSON.stringify(d["Work gloves"]));
check("wrench: stock, Tools, taxed as Tools & equipment", d["Pipe wrench 14 in"].stock_category === "Tools" && d["Pipe wrench 14 in"].category === "Tools & equipment", JSON.stringify(d["Pipe wrench 14 in"]));
check("tape: included in my price on job A", d["Teflon tape 3-pack"].assignment === "job_in_bid" && d["Teflon tape 3-pack"].job_id === jobA.id);
check("the other 6 stay billed to job A", names.filter((n) => !["Work gloves", "Teflon tape 3-pack", "Pipe wrench 14 in"].includes(n)).every((n) => d[n].assignment === "job_extra" && d[n].job_id === jobA.id));
const after = await money();
check("Money page: total expenses don't change", !!before.expenses && after.expenses === before.expenses, `${before.expenses} → ${after.expenses}`);
check("CSV: the expense rows add up the same", after.expenseSum === before.expenseSum, `${before.expenseSum} → ${after.expenseSum}`);
check("Money page: Where it went has a Tools & equipment line", /Tools & equipment\s+\$[\d,]+\.\d\d/.test(after.text));
const line = (name) => after.csv.split("\r\n").find((l) => l.includes(`${name} @ ${VENDOR},`)) ?? "";
check("CSV: the wrench's row says Tools & equipment", line("Pipe wrench 14 in").split(",")[2] === "Tools & equipment", line("Pipe wrench 14 in"));
check("CSV: the gloves' row says Materials & supplies", line("Work gloves").split(",")[2] === "Materials & supplies", line("Work gloves"));
await page.goto(url);
await page.reload();
check("after a reload the page shows the saved settings", (await row("Work gloves").innerText()).includes("Stock · Consumables") && (await row("Copper pipe 10 ft").innerText()).includes("Bill to customer"));

// Leaving stock: the wrench goes back to the receipt's tax category.
await row("Pipe wrench 14 in").getByRole("button").first().click();
await row("Pipe wrench 14 in").getByRole("button", { name: /Included in my price/ }).click();
await row("Pipe wrench 14 in").getByRole("button", { name: "Save" }).click();
await saved("Pipe wrench 14 in", "Included in my price");
d = await db();
check("off stock, the wrench is taxed as Materials & supplies again", d["Pipe wrench 14 in"].assignment === "job_in_bid" && d["Pipe wrench 14 in"].category === "Materials & supplies", JSON.stringify(d["Pipe wrench 14 in"]));
// Back to Tools, so the next stock item starts there.
await row("Pipe wrench 14 in").getByRole("button").first().click();
await row("Pipe wrench 14 in").getByRole("button", { name: /Stock \/ company/ }).click();
await row("Pipe wrench 14 in").getByRole("button", { name: /^Tools/ }).click();
await row("Pipe wrench 14 in").getByRole("button", { name: "Save" }).click();
await saved("Pipe wrench 14 in", "Stock · Tools");

// 3. A sent invoice locks its items; a draft gives its item up and follows.
const inv = async (id, desc, amount) => (await owner.post("rpc/invoice_create_from_job", { p: {
  client_id: 8, job_id: jobA.id, billing_entity_id: entityId, customer_name: "Pat",
  line_items: [{ description: `Additional materials: ${desc}`, qtyLabel: null, amount, extra_expense_id: id }],
  subtotal_cents: Math.round(amount * 100), tax_rate_pct: 0, tax_cents: 0, total_cents: Math.round(amount * 100),
} })).body.invoice_id;
const sentId = Number(await inv(idOf["Ball valve 3/4 in"], "Ball valve 3/4 in", 84.89));
await owner.patch(`invoices?id=eq.${sentId}`, { status: "sent" });
const draftId = Number(await inv(idOf["PVC cement"], "PVC cement", 21.36));
await page.reload();
check("an item on a sent invoice shows it's locked", (await row("Ball valve 3/4 in").innerText()).includes("On invoice"));
check("an item on a draft says so", (await row("PVC cement").innerText()).includes("On draft"));
await row("PVC cement").getByRole("button").first().click();
await row("PVC cement").getByRole("button", { name: /Stock \/ company/ }).click();
check("an item's stock category starts on the one just used", (await row("PVC cement").getByRole("button", { name: /^Tools/ }).getAttribute("aria-pressed")) === "true");
await row("PVC cement").getByRole("button", { name: "Save" }).click();
await saved("PVC cement", "Stock · Tools");
d = await db();
const draft = (await adminGet(`invoices?id=eq.${draftId}&select=line_items`))[0];
check("the draft's item came off it", d["PVC cement"].assignment === "stock" && d["PVC cement"].invoiced_on === null, JSON.stringify(d["PVC cement"]));
check("…and the draft no longer bills it", !JSON.stringify(draft.line_items).includes("PVC cement"), JSON.stringify(draft.line_items).slice(0, 200));
await page.getByRole("button", { name: "Set all items to…" }).click();
check("set all says the sent invoice's item stays as it is", await page.getByText("1 item is on an invoice that went out and stays as it is.").isVisible());
await page.getByRole("button", { name: /Stock \/ company/ }).first().click();
await page.getByRole("button", { name: /^Consumables/ }).first().click();
await page.getByRole("button", { name: /Apply to all 8 items/ }).click();
await page.waitForFunction(() => [...document.querySelectorAll("li[data-item]")].filter((li) => li.textContent.includes("Stock · Consumables")).length === 8);
d = await db();
check("set all leaves the sent invoice's item as it was", d["Ball valve 3/4 in"].assignment === "job_extra" && d["Ball valve 3/4 in"].invoiced_on === sentId);
check("…and sets the other 8", names.filter((n) => n !== "Ball valve 3/4 in").every((n) => d[n].assignment === "stock" && d[n].stock_category === "Consumables" && d[n].category === "Materials & supplies"));
await row("Ball valve 3/4 in").getByRole("button").first().click();
check("tapping the locked item explains why it can't change", (await row("Ball valve 3/4 in").innerText()).includes("which went out"));

// 4. The Expenses item list loads and its items open on tap.
await page.goto(`${APP}/app/estimator/purchases`);
const list = page.locator("section", { has: page.getByRole("heading", { name: "Items" }) });
check("Expenses: the item list isn't empty", !(await list.innerText()).includes("Nothing yet"));
await list.locator("li", { hasText: "Work gloves" }).first().getByRole("button").first().click();
check("Expenses: tapping an item opens its assignment", await list.getByLabel("Assignment").first().isVisible());
const opts = await list.getByLabel("Stock category").first().locator("option").allInnerTexts();
check("Expenses: stock offers Tools and Consumables", opts.includes("Tools") && opts.includes("Consumables"), opts.join(", "));

await browser.close();
