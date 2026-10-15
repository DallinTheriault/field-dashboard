// Slice 4 (payments) scenarios against the local stack, after slice4-before.sql
// and v097. Run through slice4.sh.
import Stripe from "stripe";
import { readFileSync } from "node:fs";
import { APP, PHONE, check, launch, login } from "./browser.mjs";
import { adminCall, adminGet, session } from "./api.mjs";

const env = Object.fromEntries(readFileSync(new URL("../../../.env.local", import.meta.url), "utf8")
  .split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const owner = await session("owner@cascade.test");
const other = await session("owner@other.test");
const member = await session("member@cascade.test");
const eventually = async (fn, ms = 15_000) => {
  for (const end = Date.now() + ms; ; await new Promise((ok) => setTimeout(ok, 250))) {
    if (await fn()) return true;
    if (Date.now() > end) return false;
  }
};
const todayDenver = new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" });
const daysSince = (day) => Math.round((Date.parse(`${todayDenver}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000);
let r;

// --- Prod data after v097 ----------------------------------------------------------------
const pays = await adminGet("payments?client_id=eq.1&select=received_on,amount_cents,method,reference,invoices(invoice_number,paid_at,status)&order=id");
const spc = pays.find((p) => p.invoices.invoice_number === "SPC-2026-002");
const tps = pays.find((p) => p.invoices.invoice_number === "TPS-2026-001");
check("backfill: a hand-marked paid invoice gets one payment, dated in Mountain time, method unknown",
  pays.length === 2 && spc?.received_on === "2026-07-15" && spc.amount_cents === 172636 && spc.method === "unknown",
  JSON.stringify(spc));
check("backfill: paid_at is unchanged", spc?.invoices.paid_at === "2026-07-16T03:00:00+00:00" && spc.invoices.status === "paid", spc?.invoices.paid_at);
check("backfill: a Stripe-paid invoice's payment is card, with its Stripe id",
  tps?.method === "card" && tps.reference === "in_test_backfill" && tps.received_on === "2026-07-15", JSON.stringify(tps));
const ents = await adminGet("billing_entities?client_id=eq.1&select=id,name,invoice_prefix,active,is_default&order=id");
check("Sharpline: TPS is the default; SPC is inactive and keeps its name",
  ents.length === 2 && ents[0].name === "Sharpline Painting Co." && !ents[0].active && !ents[0].is_default &&
  ents[1].invoice_prefix === "TPS" && ents[1].active && ents[1].is_default, JSON.stringify(ents));

// --- Setup: a Cascade job with priced, finished lines --------------------------------------
const entityId = (await adminGet("billing_entities?client_id=eq.8&select=id"))[0].id;
const contact = (await owner.post("contacts", { client_id: 8, name: "Pat Payer", company: "Payer Props" })).body[0];
const job = (await owner.post("jobs", {
  client_id: 8, name: "Pat Payer", contact_id: contact.id, address: "77 Ledger Ln, Draper", status: "completed", source: "manual",
})).body[0];
let sort = 0;
const line = async (title, price) => (await owner.post("tasks", {
  client_id: 8, job_id: job.id, title, unit: "each", unit_price: price, billable: true, status: "done", sort_order: ++sort,
})).body[0];
const invoiceFor = async (tasks) => {
  const rows = tasks.map((t) => ({ description: t.title, qtyLabel: null, amount: Number(t.unit_price), task_id: t.id }));
  const sub = rows.reduce((n, x) => n + Math.round(x.amount * 100), 0);
  const res = await owner.post("rpc/invoice_create_from_job", { p: {
    client_id: 8, job_id: job.id, billing_entity_id: entityId, customer_name: "Pat Payer", customer_company: "Payer Props",
    bill_to_contact_id: contact.id, line_items: rows, subtotal_cents: sub, tax_rate_pct: 0, tax_cents: 0, total_cents: sub,
  } });
  if (res.status !== 200) throw new Error(`invoice: ${JSON.stringify(res.body)}`);
  return Number(res.body.invoice_id);
};
const invRow = async (id) =>
  (await adminGet(`invoices?id=eq.${id}&select=invoice_number,status,sent_at,paid_at,total_cents`))[0];
const payRows = async (id) => adminGet(`payments?invoice_id=eq.${id}&select=id,received_on,amount_cents,method,reference&order=id`);

const invA = await invoiceFor([await line("Furnace tune-up", 300), await line("Filter swap", 150)]); // $450, sent
const invB = await invoiceFor([await line("Thermostat", 200)]); // $200, a draft paid outside Field
const invC = await invoiceFor([await line("Duct seal", 120)]); // $120, a draft paid in part
const invD = await invoiceFor([await line("Vent cover", 40)]); // $40, stays a draft
await owner.patch(`invoices?id=eq.${invA}`, { status: "sent" });
await adminCall("PATCH", `invoices?id=eq.${invA}`, { sent_at: "2026-09-20T18:00:00Z" });

// --- Database rules, through the API ---------------------------------------------------------
const pay = (sess, invoice_id, received_on, amount_cents, method = "check", extra = {}) =>
  sess.post("payments", { client_id: 8, invoice_id, received_on, amount_cents, method, ...extra });
r = await pay(owner, invC, "2026-10-05", 5000);
let c = await invRow(invC);
check("a part payment on a draft sends it, dated by the payment; not paid yet",
  r.status === 201 && c.status === "sent" && c.sent_at === "2026-10-05T18:00:00+00:00" && c.paid_at === null, JSON.stringify(c));
r = await pay(owner, invC, "2026-10-06", 7001);
check("can't record more than the balance", r.status === 400 && /more than the \$70\.00 still due/.test(r.body?.message), r.body?.message);
const invS = await invoiceFor([await line("Stripe link job", 500)]);
await adminCall("PATCH", `invoices?id=eq.${invS}`, { stripe_invoice_id: "in_full_only", status: "sent" });
r = await pay(owner, invS, "2026-10-06", 20000);
check("a Stripe-issued invoice takes only the full amount by hand (its link is for the full amount)",
  r.status === 400 && /card link for the full amount/.test(r.body?.message), r.body?.message);
r = await pay(owner, invC, "2099-01-01", 100);
check("can't date a payment in the future", r.status === 400 && /future/.test(r.body?.message), r.body?.message);
r = await pay(owner, invC, "2026-10-06", 100, "card", { reference: "ch_fake" });
check("people can't record card payments (those come from Stripe)", r.status === 403 || r.status === 401, `status ${r.status}`);
r = await pay(member, invC, "2026-10-06", 100);
check("a member can't record payments", r.status === 403 || r.status === 401, `status ${r.status}`);
r = await pay(other, invC, "2026-10-06", 100);
check("another tenant can't record a payment on Cascade's invoice", r.status === 403 || r.status === 401, `status ${r.status}`);
r = await other.get(`payments?select=id,client_id`);
check("another tenant sees none of Cascade's payments", r.status === 200 && r.body.every((p) => p.client_id === 9), JSON.stringify(r.body).slice(0, 100));
r = await member.get(`payments?invoice_id=eq.${invC}&select=id`);
check("a member can see them", r.status === 200 && r.body.length === 1);
r = await owner.patch(`invoices?id=eq.${invD}`, { status: "paid", paid_at: "2027-01-01T00:00:00Z" });
check("nobody marks an invoice paid without a payment", r.status === 403 && /comes from payments/.test(r.body?.message), r.body?.message);
r = await owner.post("invoices", { client_id: 8, customer_name: "x", status: "paid", paid_at: "2026-10-01T00:00:00Z" });
check("…or creates one already paid", r.status === 403 && /Record a payment/.test(r.body?.message), r.body?.message);
const ownerUid = (await adminGet("client_users?client_id=eq.8&role=eq.owner&select=auth_user_id"))[0].auth_user_id;
r = await pay(owner, invC, "2026-10-06", 100, "check", { created_by: "00000000-0000-0000-0000-000000000000" });
check("a payment records who entered it, whatever the request says",
  r.status === 201 && r.body[0].created_by === ownerUid, JSON.stringify(r.body?.[0]?.created_by));
r = await adminCall("POST", "rpc/invoice_void", { p_invoice_id: invC });
check("an invoice with payments can't be voided", r.status >= 400 && /has payments recorded/.test(r.body?.message), r.body?.message);

// --- Stripe webhook ------------------------------------------------------------------------------
const invE = await invoiceFor([await line("Card job", 275)]);
await adminCall("PATCH", `invoices?id=eq.${invE}`, { stripe_invoice_id: "in_webhook_test" });
const invF = await invoiceFor([await line("Check job via Stripe", 90)]);
await adminCall("PATCH", `invoices?id=eq.${invF}`, { stripe_invoice_id: "in_oob_test", status: "sent" });
const hook = async (stripeId, amount_paid, amount_paid_off_stripe, paidAtIso) => {
  const payload = JSON.stringify({
    id: `evt_${stripeId}`, object: "event", type: "invoice.paid", created: Math.floor(Date.now() / 1000),
    data: { object: { id: stripeId, object: "invoice", amount_paid, amount_paid_off_stripe,
      status_transitions: { paid_at: Math.floor(Date.parse(paidAtIso) / 1000) } } },
  });
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: env.ESTIMATOR_STRIPE_WEBHOOK_SECRET });
  return fetch(`${APP}/api/stripe/estimator-webhook`, { method: "POST", headers: { "stripe-signature": signature, "content-type": "application/json" }, body: payload });
};
// 11 PM Mountain on Oct 12 is Oct 13 in UTC.
const h1 = await hook("in_webhook_test", 27500, 0, "2026-10-13T05:00:00Z");
const h2 = await hook("in_webhook_test", 27500, 0, "2026-10-13T05:00:00Z");
const e = await invRow(invE);
const ep = await payRows(invE);
check("a Stripe payment is recorded once, as card, dated in Mountain time",
  h1.status === 200 && h2.status === 200 && ep.length === 1 && ep[0].method === "card" && ep[0].reference === "in_webhook_test" &&
  ep[0].received_on === "2026-10-12" && ep[0].amount_cents === 27500, JSON.stringify(ep));
check("…and the Stripe-issued draft is sent and paid on that date",
  e.status === "paid" && e.paid_at === "2026-10-12T18:00:00+00:00" && e.sent_at === "2026-10-12T18:00:00+00:00", JSON.stringify(e));
await hook("in_oob_test", 9000, 9000, "2026-10-13T05:00:00Z");
check("Stripe's echo of a check marked paid out of band adds nothing", (await payRows(invF)).length === 0 && (await invRow(invF)).status === "sent");
const invH = await invoiceFor([await line("Old API version", 80)]);
await adminCall("PATCH", `invoices?id=eq.${invH}`, { stripe_invoice_id: "in_old_api", status: "sent" });
const hOld = await hook("in_old_api", 8000, undefined, "2026-10-13T18:00:00Z");
check("an event from an older Stripe API version (no off-Stripe amount) is checked with Stripe, then recorded",
  hOld.status === 200 && (await payRows(invH)).length === 1 && (await invRow(invH)).status === "paid", `status ${hOld.status}`);
r = await fetch(`${APP}/api/stripe/estimator-webhook`, { method: "POST", headers: { "stripe-signature": "t=1,v1=bad" }, body: "{}" });
check("an unsigned webhook is refused", r.status === 400);

// --- On a phone ----------------------------------------------------------------------------------
const browser = await launch();
const page = await login(browser, "owner@cascade.test", PHONE);
page.on("dialog", (d) => d.accept());
for (const path of ["/app/estimator/invoices", `/app/estimator/invoices/${invA}`, `/app/jobs/${job.id}/invoice`, "/app/estimator"]) {
  await page.goto(`${APP}${path}`);
  await page.waitForLoadState("networkidle");
}

// Nav: Invoices is a main tab, not a Business tile.
await page.goto(`${APP}/app`);
await page.waitForLoadState("networkidle");
const tabBar = page.locator("nav.md\\:hidden");
check("Invoices is in the phone's tab bar", (await tabBar.getByRole("link", { name: "Invoices" }).count()) === 1,
  (await tabBar.innerText()).replace(/\n/g, " | "));
await tabBar.getByRole("link", { name: "Invoices" }).click();
await page.waitForURL(/\/app\/estimator\/invoices/);
const unpaid = page.getByTestId("list-unpaid");
await unpaid.waitFor();
const unpaidRows = await unpaid.locator("[data-invoice]").evaluateAll((els) => els.map((el) => el.innerText.replace(/\n/g, " | ")));
check("Unpaid lists sent, not fully paid invoices, oldest first",
  unpaidRows.length === 4 && /Pat Payer/.test(unpaidRows[0]) && unpaidRows[0].includes(`${daysSince("2026-09-20")} days`),
  unpaidRows.join(" ## "));
const aRow = page.locator(`[data-invoice="${(await invRow(invA)).invoice_number}"]`);
check("an Unpaid row shows the amount owed, bill-to with company, address and days since sent",
  /\$450\.00/.test(await aRow.innerText()) && /Pat Payer \(Payer Props\)/.test(await aRow.innerText()) &&
  /77 Ledger Ln, Draper/.test(await aRow.innerText()), (await aRow.innerText()).replace(/\n/g, " | "));
const cRow = page.locator(`[data-invoice="${c.invoice_number}"]`);
check("a part-paid invoice shows its balance and the total", /\$69\.00/.test(await cRow.innerText()) && /of \$120\.00/.test(await cRow.innerText()));
const overflowList = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check("no sideways scroll on the list at 390 px", overflowList <= 0, `${overflowList}px`);
await page.screenshot({ path: "/opt/fieldstack/e2e/slice4-unpaid.png", fullPage: true });
await page.getByRole("link", { name: /^Drafts/ }).click();
await page.getByTestId("list-drafts").waitFor();
check("Drafts lists unsent drafts", (await page.getByTestId("list-drafts").locator("[data-invoice]").count()) === 2);

// Record payment on a sent invoice: part, then the rest.
await page.goto(`${APP}/app/estimator/invoices/${invA}`);
await page.waitForLoadState("networkidle");
check("there's no Mark paid button any more", (await page.getByRole("button", { name: "Mark paid" }).count()) === 0);
const panel = page.getByTestId("payments");
const record = async (day, amount, method, ref) => {
  await panel.getByRole("button", { name: "Record payment" }).click();
  await panel.getByLabel("Date received").fill(day);
  if (amount !== null) await panel.getByLabel("Amount").fill(amount);
  if (method) await panel.getByLabel("How it was paid").selectOption({ label: method });
  if (ref) await panel.getByLabel("Check / ref #").fill(ref);
  await panel.getByRole("button", { name: "Save payment" }).click();
};
await panel.getByRole("button", { name: "Record payment" }).click();
check("Record payment defaults to today and the balance due",
  (await panel.getByLabel("Date received").inputValue()) === todayDenver && (await panel.getByLabel("Amount").inputValue()) === "450.00");
const smalls = await panel.locator("button:visible, input:visible, select:visible").evaluateAll((els) =>
  els.filter((el) => el.getBoundingClientRect().height < 44).map((el) => el.getAttribute("aria-label") || el.textContent?.trim() || el.tagName));
check("payment controls are 44 px tall", smalls.length === 0, smalls.join(", "));
await panel.getByRole("button", { name: "Cancel" }).click();
await record("2026-10-10", "100", "Check", "1234");
await panel.locator("[data-payment]").first().waitFor();
let a = await invRow(invA);
check("a part payment leaves it sent, with $350 due", a.status === "sent" && /\$350\.00/.test(await panel.getByTestId("balance-due").innerText()));
await panel.getByRole("button", { name: "Record payment" }).click();
check("reopening the form offers the new balance", (await panel.getByLabel("Amount").inputValue()) === "350.00");
await panel.getByRole("button", { name: "Cancel" }).click();
await record("2026-10-12", "350", "E-check");
check("the rest marks it paid on the last payment's date", await eventually(async () => {
  a = await invRow(invA);
  return a.status === "paid" && a.paid_at === "2026-10-12T18:00:00+00:00" && a.sent_at === "2026-09-20T18:00:00+00:00";
}), JSON.stringify(a));
await page.screenshot({ path: "/opt/fieldstack/e2e/slice4-paid.png", fullPage: true });
r = await pay(owner, invA, "2026-10-13", 100);
check("a paid invoice takes no more payments", r.status === 403 && /already paid/.test(r.body?.message), r.body?.message);
r = await owner.patch(`invoices?id=eq.${invA}`, { paid_at: "2025-12-31T18:00:00Z" });
check("paid_at can't be moved by hand (it dates income)", r.status === 403 && /comes from payments/.test(r.body?.message), r.body?.message);
const voidBtn = await page.getByRole("button", { name: "Void" }).count();
check("a paid invoice has no Void button", voidBtn === 0);

// Remove the mistyped one: back to sent.
await page.getByRole("button", { name: "Remove payment of $350.00" }).click();
check("removing a payment reopens the invoice", await eventually(async () => {
  a = await invRow(invA);
  return a.status === "sent" && a.paid_at === null && (await payRows(invA)).length === 1;
}), JSON.stringify(a));

// A draft that can't go out yet can't take a payment either (it would send it).
const invU = await invoiceFor([await line("Priced part", 50)]);
await owner.post("tasks", { client_id: 8, job_id: job.id, title: "Unpriced part", unit: "each", billable: true, status: "done", sort_order: ++sort });
await page.goto(`${APP}/app/estimator/invoices/${invU}`);
await page.waitForLoadState("networkidle");
check("a draft with an unpriced line says why instead of offering Record payment",
  (await page.getByTestId("payment-blocked").innerText()).includes("Unpriced part") &&
  (await panel.getByRole("button", { name: "Record payment" }).count()) === 0);
await owner.patch(`tasks?job_id=eq.${job.id}&title=eq.Unpriced%20part`, { billable: false });

// A draft paid outside Field.
await page.goto(`${APP}/app/estimator/invoices/${invB}`);
await page.waitForLoadState("networkidle");
await record("2026-10-01", "200", "Cash");
check("a draft paid outside Field becomes sent and paid on the payment date", await eventually(async () => {
  const b = await invRow(invB);
  return b.status === "paid" && b.sent_at === "2026-10-01T18:00:00+00:00" && b.paid_at === "2026-10-01T18:00:00+00:00";
}), JSON.stringify(await invRow(invB)));
const overflowInv = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check("no sideways scroll on the invoice at 390 px", overflowInv <= 0, `${overflowInv}px`);

// The books: income lands on the payment date.
const csv = await (await page.request.get(`${APP}/api/estimator/expenses/csv?y=2026`)).text();
const bNumber = (await invRow(invB)).invoice_number;
check("the P&L export dates the draft's income by its payment", csv.split("\n").some((l) => l.includes(bNumber) && l.includes("2026-10-01")),
  csv.split("\n").filter((l) => /CAS-/.test(l)).join(" ## ").slice(0, 300));

// Letterheads: one active means no "Bill as"; two means a choice.
await page.goto(`${APP}/app/jobs/${job.id}/invoice`);
await page.waitForLoadState("networkidle");
check("with one active letterhead, Bill as is hidden", (await page.getByLabel("Bill as").count()) === 0);
const extra = (await adminCall("POST", "billing_entities", { client_id: 8, name: "Cascade Legacy", invoice_prefix: "CAL", is_default: false, active: true })).body[0];
await page.reload();
await page.waitForLoadState("networkidle");
check("with two, Bill as appears", (await page.getByLabel("Bill as").count()) === 1);
await adminCall("PATCH", `billing_entities?id=eq.${extra.id}`, { active: false });
await page.reload();
await page.waitForLoadState("networkidle");
check("marking one inactive hides it again", (await page.getByLabel("Bill as").count()) === 0);

// A Stripe-issued invoice paid by check: Stripe's copy is closed too (stripe-mock).
const invG = await invoiceFor([await line("Stripe then check", 60)]);
await adminCall("PATCH", `invoices?id=eq.${invG}`, { stripe_invoice_id: "in_1MockOutOfBand", status: "sent" });
await page.goto(`${APP}/app/estimator/invoices/${invG}`);
await page.waitForLoadState("networkidle");
await panel.getByRole("button", { name: "Record payment" }).click();
check("on a Stripe-issued invoice the amount is the full balance and locked",
  (await panel.getByLabel("Amount").inputValue()) === "60.00" && (await panel.getByLabel("Amount").getAttribute("readonly")) !== null);
await panel.getByRole("button", { name: "Cancel" }).click();
await record("2026-10-11", null, "Check", "88");
await panel.getByText("Paid in full").waitFor();
check("paying a Stripe-issued invoice another way closes it in Stripe without a warning",
  (await invRow(invG)).status === "paid" && (await panel.getByText("still open").count()) === 0);

await browser.close();
void invD;
