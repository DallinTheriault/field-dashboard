// Slice 3 (invoice from the job) scenarios against the local stack.
//   PHASE=before node slice3-invoice.mjs   before v096: a "needs a price" line, the slice-2 way
//   node slice3-invoice.mjs                after v096: the checks
import { readFileSync } from "node:fs";
import { APP, PHONE, check, launch, login } from "./browser.mjs";
import { adminCall, adminGet, session } from "./api.mjs";

const owner = await session("owner@cascade.test");
const OLD = "Unpriced from slice 2";

if (process.env.PHASE === "before") {
  // Slice 2 stored a line picked from an unpriced entry as non-billable.
  const r = await owner.post("tasks", { client_id: 8, job_id: 1, title: OLD, unit: "each", sort_order: 1 });
  console.log(r.status === 201 ? "slice-2 needs-a-price line created" : `failed: ${JSON.stringify(r.body)}`);
  process.exit(r.status === 201 ? 0 : 1);
}

const other = await session("owner@other.test");
let r;
// Server actions finish after the click returns; poll the database instead of guessing.
const eventually = async (fn, ms = 15_000) => {
  for (const end = Date.now() + ms; ; await new Promise((ok) => setTimeout(ok, 250))) {
    if (await fn()) return true;
    if (Date.now() > end) return false;
  }
};

// --- v096 keeps slice 2's meaning ------------------------------------------------------
const [old] = await adminGet(`tasks?title=eq.${encodeURIComponent(OLD)}&select=billable,unit_price`);
check("a slice-2 'needs a price' line is now billable with no price", old?.billable === true && old.unit_price === null, JSON.stringify(old));
await owner.patch(`tasks?title=eq.${encodeURIComponent(OLD)}`, { billable: false });

// --- Setup: price book, a property manager, a work order -------------------------------
await owner.patch("pricing_settings?client_id=eq.8", { default_hourly_rate: 85, material_markup_pct: 0.2 });
const entry = async (name, unit, unit_price) =>
  (await owner.post("service_catalog", { client_id: 8, name, type: "PRICED", unit, unit_price })).body[0];
const patchEntry = await entry("Patch drywall, small", "each", 95);
const doorEntry = await entry("Door rehang", "each", 140);
const outletEntry = await entry("Replace outlet", "each", null);

const pm = (await owner.post("contacts", {
  client_id: 8, name: "Jordan Manager", email: "jordan@pm.test", company: "Vista Test Realty", is_property_manager: true,
})).body[0];
const prop = (await adminCall("POST", "properties", { client_id: 8, contact_id: pm.id, address: "200 Rental Way", unit: "4B" })).body[0];
const job = (await owner.post("jobs", {
  client_id: 8, name: "Jordan Manager", contact_id: pm.id, property_id: prop.id, address: "200 Rental Way, Unit 4B", status: "scheduled", source: "manual",
})).body[0];
const line = async (title, p) =>
  (await owner.post("tasks", { client_id: 8, job_id: job.id, title, sort_order: p.sort, ...p.fields })).body[0];
const patchLine = await line("Patch drywall, small", { sort: 1, fields: { service_id: patchEntry.id, unit: "each", unit_price: 95, billable: true, status: "done" } });
const doorLine = await line("Door rehang", { sort: 2, fields: { service_id: doorEntry.id, unit: "each", unit_price: 140, billable: true, status: "done" } });
const laborLine = await line("Labor, hourly", { sort: 3, fields: { qty: 1.5, unit: "hour", unit_price: 85, billable: true } });
const outletLine = await line("Replace outlet", { sort: 4, fields: { service_id: outletEntry.id, unit: "each", billable: true } });

// An extra at cost, with a receipt photo.
const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
const env = Object.fromEntries(readFileSync(new URL("../../../.env.local", import.meta.url), "utf8")
  .split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/receipts/8/wax-ring.jpg`, {
  method: "POST",
  headers: { authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "image/jpeg", "x-upsert": "true" },
  body: jpeg,
});
const extra = (await owner.post("expenses", {
  client_id: 8, job_id: job.id, expense_date: "2026-10-14", category: "Materials & supplies", description: "Wax ring kit",
  amount: 24.5, qty: 1, unit_price: 24.5, assignment: "job_extra", customer_notified: false, receipt_path: "8/wax-ring.jpg",
})).body?.[0];
check("setup: a work order for a property manager with lines and an extra", !!(job && patchLine && doorLine && laborLine && outletLine && extra), extra ? "" : JSON.stringify(extra));

// --- Database rules ------------------------------------------------------------------------
r = await owner.post("rpc/invoice_create_from_job", { p: {
  client_id: 8, job_id: job.id, billing_entity_id: (await adminGet("billing_entities?client_id=eq.8&select=id"))[0].id,
  customer_name: "x", line_items: [{ description: "Replace outlet", amount: 0, task_id: outletLine.id }], subtotal_cents: 0, tax_cents: 0, total_cents: 0,
} });
check("a draft can't claim a line with no price", r.status >= 400 && /changed or went on another invoice/.test(r.body?.message), r.body?.message);
r = await other.post("rpc/invoice_create_from_job", { p: { client_id: 8, job_id: job.id, billing_entity_id: 1, customer_name: "x", line_items: [] } });
check("another tenant can't invoice Cascade's job", r.status === 400 && /Job not found/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await other.post("rpc/invoice_void", { p_invoice_id: 1 });
check("the browser can't call invoice_void", r.status === 401 || r.status === 403 || r.status === 404, `status ${r.status}`);

// --- Scenario 1 on a phone: work order billed to the manager -------------------------------
const browser = await launch();
const page = await login(browser, "owner@cascade.test", PHONE);
await page.addInitScript(() => {
  window.__shared = [];
  navigator.canShare = () => true;
  navigator.share = async (data) => {
    window.__shared.push({ text: data.text, files: (data.files ?? []).map((f) => ({ name: f.name, type: f.type, size: f.size })) });
  };
});
page.on("dialog", (d) => d.accept());
// next dev compiles a route on first visit and can force a full reload of the
// page you're on while it does; visit the routes once so a mid-flow
// navigation never triggers that (a production build has no such step).
for (const path of ["/app/estimator/invoices", `/app/jobs/${job.id}/invoice`]) {
  await page.goto(`${APP}${path}`);
  await page.waitForLoadState("networkidle");
}

await page.goto(`${APP}/app/jobs/${job.id}`);
await page.waitForLoadState("networkidle");
await page.getByRole("button", { name: "Job options" }).click();
await page.getByRole("menuitem", { name: "Create invoice" }).click();
const preview = page.getByTestId("invoice-preview");
await preview.waitFor();
const previewText = await preview.innerText();
check("create screen previews done lines and the extra, notes the open and unpriced ones",
  /Patch drywall/.test(previewText) && /Door rehang/.test(previewText) && /Wax ring kit/.test(previewText) &&
  !/Labor, hourly\s/.test(previewText.split("\n").slice(0, 6).join("\n")) && /1 line isn't done yet/.test(previewText) && /Replace outlet/.test(previewText),
  previewText.replace(/\n/g, " | ").slice(0, 200));
await page.waitForLoadState("networkidle"); // a tap before hydration does nothing
await page.getByRole("button", { name: "Create draft" }).click();
await page.waitForURL(/\/app\/estimator\/invoices\/\d+$/);
const inv1 = Number(page.url().split("/").pop());
await page.getByTestId("draft-total").waitFor();

let inv = (await adminGet(`invoices?id=eq.${inv1}&select=invoice_number,status,customer_name,customer_company,bill_to_contact_id,total_cents,line_items`))[0];
check("draft bills the manager, with the company", inv.customer_name === "Jordan Manager" && inv.customer_company === "Vista Test Realty" && inv.bill_to_contact_id === pm.id);
check("draft holds the two done lines and the extra at cost: $95 + $140 + $24.50",
  inv.total_cents === 25950 && inv.line_items.length === 3, `${inv.total_cents} cents, ${inv.line_items.length} rows`);
let claimed = await adminGet(`tasks?job_id=eq.${job.id}&select=title,invoice_id&order=sort_order`);
check("the draft claims exactly those lines", claimed.filter((t) => t.invoice_id === inv1).map((t) => t.title).join(",") === "Patch drywall, small,Door rehang");
check("the extra is stamped with the draft", (await adminGet(`expenses?id=eq.${extra.id}&select=invoiced_on`))[0].invoiced_on === inv1);
const jl = page.getByTestId("job-lines");
check("the open line is listed to add on purpose", (await jl.locator('[data-available="Labor, hourly"]').count()) === 1);
check("the unpriced line blocks sending", (await jl.getByTestId("needs-price").innerText()).includes("Replace outlet") &&
  (await page.getByRole("button", { name: "Share invoice" }).isDisabled()));

r = await owner.patch(`invoices?id=eq.${inv1}`, { status: "sent" });
check("the database refuses to send it past an unpriced line", r.status >= 400 && /Still needs a price: "Replace outlet"/.test(r.body?.message), r.body?.message);

// Mark the outlet not billable on the job; attach the receipt to the extra.
await page.goto(`${APP}/app/jobs/${job.id}`);
await page.waitForLoadState("networkidle");
const outletRow = page.locator('li[data-line="Replace outlet"]');
await outletRow.getByRole("button", { name: /^Replace outlet/ }).click();
await outletRow.getByLabel("Bill this line").uncheck();
await outletRow.getByText("not billed").waitFor();
await page.getByRole("button", { name: "Reassign Wax ring kit" }).click();
await page.getByLabel("Attach receipt when sharing the invoice").check();
check("lines marked not billable and the receipt set to go along", await eventually(async () =>
  (await adminGet(`tasks?id=eq.${outletLine.id}&select=billable`))[0].billable === false &&
  (await adminGet(`expenses?id=eq.${extra.id}&select=attach_receipt`))[0].attach_receipt === true));

await page.goto(`${APP}/app/estimator/invoices/${inv1}`);
await page.waitForLoadState("networkidle");
const send = page.getByTestId("send-panel");
await send.waitFor();
check("nothing blocks sending now; the receipt photo will go along",
  !(await page.getByRole("button", { name: "Share invoice" }).isDisabled()) && (await send.innerText()).includes("1 receipt photo"));
check("card link is off by default for the manager", !(await send.getByLabel("Add card payment link").isChecked()));
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check("no sideways scroll at 390 px on the draft", overflow <= 0, `${overflow}px`);
const small = await page.locator('[data-testid="send-panel"] button:visible, [data-testid="job-lines"] button:visible').evaluateAll((els) =>
  els.filter((el) => el.getBoundingClientRect().height < 44).map((el) => el.textContent?.trim()));
check("send and job-line controls are 44 px tall", small.length === 0, small.join(", "));
await page.screenshot({ path: "/opt/fieldstack/e2e/slice3-draft.png", fullPage: true });

await page.getByRole("button", { name: "Share invoice" }).click();
await send.getByText("Shared. Did it go out?").waitFor();
const shared = await page.evaluate(() => window.__shared);
inv = (await adminGet(`invoices?id=eq.${inv1}&select=invoice_number,status,total_cents`))[0];
check("the share sheet gets the PDF and the receipt photo, and no card link",
  shared.length === 1 && shared[0].files.length === 2 && shared[0].files[0].type === "application/pdf" &&
  shared[0].files[0].size > 1000 && shared[0].files[1].name.includes("receipt") && !/Pay by card/.test(shared[0].text) &&
  shared[0].text.includes("$259.50"), JSON.stringify(shared[0]).slice(0, 220));
check("sharing alone doesn't send it", inv.status === "draft");
await send.getByRole("button", { name: "Mark as sent" }).click();
await page.getByText("Share PDF again").waitFor();
inv = (await adminGet(`invoices?id=eq.${inv1}&select=invoice_number,status,sent_at`))[0];
check("Mark as sent sends it", inv.status === "sent" && !!inv.sent_at);
check("the manager's card-link choice is remembered (off)", (await adminGet(`contacts?id=eq.${pm.id}&select=card_link_default`))[0].card_link_default === false);
r = await owner.patch(`tasks?id=eq.${patchLine.id}`, { unit_price: 10 });
check("its lines are final", r.status === 403);
r = await owner.del(`invoices?id=eq.${inv1}`);
check("a sent invoice can't be deleted", r.status === 403 && /void it instead/.test(r.body?.message), r.body?.message);

// --- Scenario 3: no double billing; void releases ------------------------------------------
await owner.patch(`tasks?id=eq.${laborLine.id}`, { status: "done" });
await page.goto(`${APP}/app/jobs/${job.id}/invoice`);
await page.waitForLoadState("networkidle"); // a tap before hydration does nothing
await page.getByRole("button", { name: "Create draft" }).click();
await page.waitForURL(/\/app\/estimator\/invoices\/\d+$/);
const inv2 = Number(page.url().split("/").pop());
const inv2Row = (await adminGet(`invoices?id=eq.${inv2}&select=total_cents,line_items`))[0];
check("a second invoice takes only what the first didn't: the hours, $127.50",
  inv2Row.total_cents === 12750 && inv2Row.line_items.map((x) => x.description).join() === "Labor, hourly");

await page.goto(`${APP}/app/estimator/invoices/${inv1}`);
await page.waitForLoadState("networkidle");
await page.getByRole("button", { name: "Void" }).click();
await page.getByRole("button", { name: "Void" }).waitFor({ state: "detached" });
claimed = await adminGet(`tasks?job_id=eq.${job.id}&select=title,invoice_id&order=sort_order`);
check("voiding releases its lines and extra",
  (await adminGet(`invoices?id=eq.${inv1}&select=status`))[0].status === "voided" &&
  claimed.filter((t) => t.invoice_id === inv1).length === 0 &&
  (await adminGet(`expenses?id=eq.${extra.id}&select=invoiced_on`))[0].invoiced_on === null);

await page.goto(`${APP}/app/estimator/invoices/${inv2}`);
await page.waitForLoadState("networkidle");
const jl2 = page.getByTestId("job-lines");
await jl2.locator('[data-available="Patch drywall, small"]').getByRole("button", { name: /^Add/ }).click();
await jl2.locator('[data-available="Patch drywall, small"]').waitFor({ state: "detached" });
await jl2.locator('[data-available^="Additional materials"]').getByRole("button", { name: /^Add/ }).click();
await jl2.locator('[data-available^="Additional materials"]').waitFor({ state: "detached" });
const inv2After = (await adminGet(`invoices?id=eq.${inv2}&select=total_cents`))[0];
check("released lines can go on the next invoice", inv2After.total_cents === 12750 + 9500 + 2450, `${inv2After.total_cents}`);

check("lines added from the job show in the editor without a reload",
  await page.getByRole("button", { name: "Remove Patch drywall, small" }).isVisible() &&
  await page.getByRole("button", { name: /^Remove Additional materials/ }).isVisible());

// Removing a row on the draft releases it; deleting the draft releases the rest.
await page.getByRole("button", { name: "Remove Patch drywall, small" }).click();
await page.getByRole("button", { name: "Save changes" }).click();
check("removing a row from a draft releases that line", await eventually(async () =>
  (await adminGet(`tasks?id=eq.${patchLine.id}&select=invoice_id`))[0].invoice_id === null));
await page.getByRole("button", { name: "Delete draft" }).click();
await page.waitForURL(/\/app\/estimator\/invoices$/, { timeout: 20000 }).catch(async (e) => {
  console.log("DEBUG url", page.url(), (await page.locator("body").innerText()).slice(0, 600).replace(/\n/g, " | "));
  throw e;
});
check("deleting a draft releases everything on it",
  (await adminGet(`tasks?job_id=eq.${job.id}&invoice_id=not.is.null&select=id`)).length === 0 &&
  (await adminGet(`expenses?id=eq.${extra.id}&select=invoiced_on`))[0].invoiced_on === null);

// --- Scenario 4: price-book edits don't leak into invoices -----------------------------------
await owner.patch(`service_catalog?id=eq.${patchEntry.id}`, { unit_price: 120 });
const voided = (await adminGet(`invoices?id=eq.${inv1}&select=line_items`))[0];
check("an invoice keeps the price it was made with", voided.line_items.find((x) => x.description === "Patch drywall, small").amount === 95);

// --- Card link (scenario 2's Stripe step, against stripe-mock) -------------------------------
const direct = (await owner.post("contacts", { client_id: 8, name: "Casey Homeowner" })).body[0];
const job3 = (await owner.post("jobs", { client_id: 8, name: "Casey Homeowner", contact_id: direct.id, status: "scheduled", source: "manual" })).body[0];
await owner.post("tasks", { client_id: 8, job_id: job3.id, title: "Door rehang", unit: "each", unit_price: 140, billable: true, status: "done", sort_order: 1 });
await page.goto(`${APP}/app/jobs/${job3.id}/invoice`);
await page.waitForLoadState("networkidle"); // a tap before hydration does nothing
await page.getByRole("button", { name: "Create draft" }).click();
await page.waitForURL(/\/app\/estimator\/invoices\/\d+$/);
const inv3 = Number(page.url().split("/").pop());
const send3 = page.getByTestId("send-panel");
await send3.getByLabel("Add card payment link").check();
await send3.getByPlaceholder("name@example.com").fill("casey@home.test");
await page.getByRole("button", { name: "Share invoice" }).click();
await send3.getByText("Shared. Did it go out?").waitFor();
const shared3 = (await page.evaluate(() => window.__shared)).at(-1);
const inv3Row = (await adminGet(`invoices?id=eq.${inv3}&select=stripe_invoice_id,stripe_hosted_invoice_url,customer_email,status`))[0];
check("card link: issued through Stripe, link in the share text",
  !!inv3Row.stripe_invoice_id && /Pay by card: http/.test(shared3.text) && inv3Row.customer_email === "casey@home.test", shared3.text);
check("the typed email is saved to the contact", (await adminGet(`contacts?id=eq.${direct.id}&select=email`))[0].email === "casey@home.test");
r = await owner.patch(`tasks?job_id=eq.${job3.id}`, { unit_price: 1 });
check("a Stripe-issued invoice's lines are final even before marking sent", r.status === 403);
await send3.getByRole("button", { name: "Mark as sent" }).click();
await page.getByText("Share PDF again").waitFor();
check("the homeowner's card-link choice is remembered (on)", (await adminGet(`contacts?id=eq.${direct.id}&select=card_link_default`))[0].card_link_default === true);

// --- Drafts follow their lines; what went out stays put (database, through the API) -----
const entityId = (await adminGet("billing_entities?client_id=eq.8&select=id"))[0].id;
const job4 = (await owner.post("jobs", { client_id: 8, name: "Rules job", contact_id: direct.id, status: "scheduled", source: "manual" })).body[0];
const mk = async (title, price, sort) =>
  (await owner.post("tasks", { client_id: 8, job_id: job4.id, title, unit: "each", unit_price: price, billable: true, status: "done", sort_order: sort })).body[0];
const [ta, tb, tc] = [await mk("Line A", 100, 1), await mk("Line B", 50, 2), await mk("Line C", 25, 3)];
const mkExtra = async (description, amount) => (await owner.post("expenses", {
  client_id: 8, job_id: job4.id, expense_date: "2026-10-14", category: "Materials & supplies", description,
  amount, qty: 1, unit_price: amount, assignment: "job_extra", customer_notified: false,
})).body[0];
const [extra4, extra5] = [await mkExtra("Caulk", 10), await mkExtra("Tape", 5)];
const rowOf = (t) => ({ description: t.title, qtyLabel: null, amount: Number(t.unit_price), task_id: t.id });
const xRow = (x) => ({ description: `Additional materials: ${x.description}`, qtyLabel: null, amount: Number(x.amount), extra_expense_id: x.id });
const draft4 = async (rows) => {
  const sub = rows.reduce((n, x) => n + Math.round(x.amount * 100), 0);
  return owner.post("rpc/invoice_create_from_job", { p: {
    client_id: 8, job_id: job4.id, billing_entity_id: entityId, customer_name: "Casey Homeowner",
    line_items: rows, subtotal_cents: sub, tax_rate_pct: 0, tax_cents: 0, total_cents: sub,
  } });
};
r = await draft4([rowOf(ta), rowOf(ta)]);
check("the same line can't be on a draft twice", r.status === 400 && /twice/.test(r.body?.message), r.body?.message);
r = await draft4([rowOf(ta), rowOf(tb), rowOf(tc), xRow(extra4), xRow(extra5)]);
const d4 = Number(r.body?.invoice_id);
const inv4 = async () => (await adminGet(`invoices?id=eq.${d4}&select=status,total_cents,line_items`))[0];
check("rules draft: three lines and two extras, $190", (await inv4()).total_cents === 19000, JSON.stringify(r.body));

r = await owner.del(`tasks?id=eq.${tc.id}`);
let i4 = await inv4();
check("deleting a line on a draft takes it off the draft and the total",
  r.status === 200 && i4.total_cents === 16500 && !i4.line_items.some((x) => x.task_id === tc.id), `${r.status} ${i4.total_cents}`);
await owner.patch(`tasks?id=eq.${tb.id}`, { billable: false });
i4 = await inv4();
check("marking a line not billable releases it and takes it off the draft",
  (await adminGet(`tasks?id=eq.${tb.id}&select=invoice_id`))[0].invoice_id === null && i4.total_cents === 11500);
await owner.patch(`expenses?id=eq.${extra4.id}`, { assignment: "job_in_bid" });
i4 = await inv4();
check("moving an extra out of extras releases it and takes it off the draft",
  (await adminGet(`expenses?id=eq.${extra4.id}&select=invoiced_on`))[0].invoiced_on === null && i4.total_cents === 10500);

// Backstop: rows that bill a line the draft doesn't hold never go out.
await adminCall("PATCH", `invoices?id=eq.${d4}`, { line_items: [...i4.line_items, rowOf(tb)] });
r = await owner.patch(`invoices?id=eq.${d4}`, { status: "sent" });
check("a draft whose rows don't match its claims can't be sent", r.status === 400 && /no longer match/.test(r.body?.message), r.body?.message);
await adminCall("PATCH", `invoices?id=eq.${d4}`, { line_items: i4.line_items });

r = await other.post("rpc/invoice_set_draft", { p: { invoice_id: d4, line_items: [], subtotal_cents: 0, tax_cents: 0, total_cents: 0 } });
check("another tenant can't edit a Cascade draft", r.status === 400 && /not found/i.test(r.body?.message), `${r.status} ${r.body?.message}`);

r = await owner.patch(`invoices?id=eq.${d4}`, { status: "sent" });
check("rules draft sends", r.status === 200);
r = await owner.patch(`invoices?id=eq.${d4}`, { status: "draft" });
check("a sent invoice can't go back to draft", r.status === 403, r.body?.message);
r = await owner.patch(`invoices?id=eq.${d4}`, { total_cents: 1 });
check("a sent invoice's total can't change", r.status === 403, r.body?.message);
r = await owner.patch(`invoices?id=eq.${d4}`, { status: "voided" });
check("the browser can't mark an invoice void (skipping Stripe and the release)", r.status === 403, r.body?.message);
r = await owner.patch(`invoices?id=eq.${inv1}`, { status: "paid" });
check("a void stays void", r.status === 403 && /is void/.test(r.body?.message), r.body?.message);
r = await owner.patch(`expenses?id=eq.${extra5.id}`, { invoiced_on: null });
check("an extra on an invoice that went out can't be released",
  r.status === 403 && (await adminGet(`expenses?id=eq.${extra5.id}&select=invoiced_on`))[0].invoiced_on === d4, `${r.status} ${r.body?.message}`);

// The void action runs as server code; it checks the caller can write the invoice's tenant.
const memberUid = (await adminGet("client_users?client_id=eq.8&role=eq.member&select=auth_user_id"))[0].auth_user_id;
await adminCall("POST", "client_users", { auth_user_id: memberUid, client_id: 9, role: "owner" });
const member = await session("member@cascade.test");
const [w8, w9] = [await member.post("rpc/user_can_write_client", { target_client_id: 8 }), await member.post("rpc/user_can_write_client", { target_client_id: 9 })];
check("a Cascade member who owns another tenant fails the void's write check for Cascade", w8.body === false && w9.body === true, `${w8.body} ${w9.body}`);

// --- Isolation and old invoices ----------------------------------------------------------
r = await other.get(`invoices?select=id,client_id`);
check("another tenant sees none of Cascade's invoices", r.status === 200 && r.body.every((x) => x.client_id === 9));
const pdf = await page.request.get(`${APP}/api/estimator/invoices/${inv1}/pdf`);
check("a voided invoice's PDF still downloads", pdf.status() === 200 && pdf.headers()["content-type"] === "application/pdf");
await page.goto(`${APP}/app/estimator/invoices?tab=voided`);
await page.waitForLoadState("networkidle");
check("the invoice list shows the void as Void, not Draft", (await page.getByText("Void", { exact: true }).count()) >= 1);

await browser.close();
