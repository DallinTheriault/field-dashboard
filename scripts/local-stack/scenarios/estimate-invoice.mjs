// v105: an accepted estimate bills through the job's invoice. The case from
// prod (Job 14): an estimate made with "New estimate" from the job's menu and
// accepted, then logged hours and bill-to-customer receipt items. "Create
// invoice" must give a draft with both, claimed so the estimate can't be
// billed twice, and the estimate must price at the rates in Business ›
// Pricing. Cascade (client 8), phone width.
import { APP, PHONE, check, launch, login } from "./browser.mjs";
import { adminCall, adminGet, session } from "./api.mjs";

const owner = await session("owner@cascade.test");
const RUN = Date.now().toString(36);
const inv = async (id) => (await adminGet(`invoices?id=eq.${id}&select=*`))[0];
const billing = async (jobId) => (await adminGet(`job_billing?job_id=eq.${jobId}&select=state,ready_count`))[0];
const eventually = async (fn, ms = 15_000) => {
  for (const end = Date.now() + ms; ; await new Promise((ok) => setTimeout(ok, 250))) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) return null;
  }
};

// Field's rates, as Business › Pricing sets them.
await owner.patch("pricing_settings?client_id=eq.8", {
  default_hourly_rate: 110, skilled_hourly_rate: 125, minimum_job_charge: 150, material_markup_pct: 0,
});

const job = (await owner.post("jobs", {
  client_id: 8, name: `Touch Up ${RUN}`, status: "in_progress", source: "manual", address: "14 Paint St, Provo, UT 84601",
})).body[0];

const browser = await launch();
const page = await login(browser, "owner@cascade.test", PHONE);

// 1. The estimate, from the job's menu, priced at Field's rates -------------------------------------------
await page.goto(`${APP}/app/jobs/${job.id}`);
await page.waitForLoadState("networkidle");
await page.getByRole("button", { name: "Job options" }).click();
await page.getByRole("menuitem", { name: "New estimate" }).click();
await page.getByPlaceholder("Search catalog…").waitFor();
await page.waitForLoadState("networkidle");
await page.getByRole("button", { name: "Service (hours)" }).click();
await page.getByPlaceholder("Describe the work…").fill("Light prep and Touch Up Paint");
await page.locator('input[placeholder="0"]').last().fill("2");
check("the builder doesn't ask for pay, hours or margin", (await page.getByTestId("estimate-needs-rate").count()) === 0);
await Promise.all([
  page.waitForURL(/\/app\/estimator\/\d+$/),
  page.getByRole("button", { name: "Save estimate" }).click(),
]);
const estimateId = Number(page.url().split("/").pop());
const [est] = await adminGet(`estimates?id=eq.${estimateId}&select=job_id,computed_price,resolved_loaded_rate,resolved_margin_pct,resolved_rounding_increment`);
check("2 hr of work prices at the $110 general rate: $220.00 (not ~$116/hr)",
  est.job_id === job.id && Number(est.computed_price) === 220 && Number(est.resolved_loaded_rate) === 110 &&
  Number(est.resolved_margin_pct) === 0 && Number(est.resolved_rounding_increment) === 0, JSON.stringify(est));
await page.waitForLoadState("networkidle");
await page.getByRole("button", { name: "Accepted" }).click();
await eventually(async () => (await adminGet(`estimates?id=eq.${estimateId}&select=status`))[0].status === "accepted");
await page.reload();
await page.waitForLoadState("networkidle");
check("an accepted estimate offers no Reprice (the customer agreed to its price)",
  (await page.getByRole("button", { name: "Reprice at current settings" }).count()) === 0 &&
  (await page.getByRole("link", { name: "New version" }).count()) === 1);

// 2. Work done: hours logged, receipt items billed to the customer, job completed ------------------------
await owner.post("time_entries", { client_id: 8, job_id: job.id, entry_date: "2026-11-02", hours: 4 });
await owner.post("time_entries", { client_id: 8, job_id: job.id, entry_date: "2026-11-03", hours: 2 });
const receipt = (await owner.post("purchases", {
  client_id: 8, vendor: `Paint Store ${RUN}`, purchase_date: "2026-11-02", source: "manual", subtotal: 100, tax: 7.25, total: 107.25,
})).body[0];
const item = async (description, amount) => (await owner.post("expenses", {
  client_id: 8, job_id: job.id, purchase_id: receipt.id, assignment: "job_extra", description, amount, qty: 1, unit_price: amount,
  category: "Materials & supplies", expense_date: "2026-11-02",
})).body[0];
const extras = [await item("Paint, 1 gal", 60), await item("Caulk", 40)];
await owner.patch(`jobs?id=eq.${job.id}`, { status: "completed" });
const ready = await billing(job.id);
check("Ready to invoice counts the accepted estimate with the extras and hours",
  ready.state === "ready" && ready.ready_count === 2 + 2 + 1, JSON.stringify(ready));

// 3. "Create invoice" on the estimate opens the job's invoice builder --------------------------------------
await page.goto(`${APP}/app/estimator/${estimateId}`);
await page.waitForLoadState("networkidle");
check("the estimate's Create invoice goes to the job's invoice builder",
  (await page.getByTestId("estimate-create-invoice").getAttribute("href")) === `/app/jobs/${job.id}/invoice`);
await page.getByTestId("estimate-create-invoice").click();
await page.waitForURL(`${APP}/app/jobs/${job.id}/invoice`);
const preview = page.getByTestId("invoice-preview");
await preview.waitFor();
await page.waitForLoadState("networkidle");
const previewText = await preview.innerText();
check("the builder lists the estimate's line as work, per estimate",
  /Light prep and Touch Up Paint/.test(await page.getByTestId("builder-estimate").innerText()) &&
  /per estimate/.test(previewText), previewText.replace(/\n/g, " | ").slice(0, 240));
check("…with the bill-to-customer extras in the same draft",
  /Paint, 1 gal/.test(previewText) && /Caulk/.test(previewText));
check("logged hours start unticked, with a note that the estimate covers labor",
  !(await page.getByRole("checkbox", { name: "Bill logged hours" }).isChecked()) &&
  /accepted estimate covers labor/.test(await page.getByTestId("hours-covered-note").innerText()));
// $220 + extras at cost with their share of the receipt's tax: 100 × 1.0725.
check("before tax: $220.00 + $107.25 = $327.25", (await page.getByTestId("preview-subtotal").innerText()) === "$327.25",
  await page.getByTestId("preview-subtotal").innerText());
await page.getByRole("button", { name: "Create draft" }).click();
await page.waitForURL(/\/app\/estimator\/invoices\/\d+$/);
const draftId = Number(page.url().split("/").pop());
let d = await inv(draftId);
const estRows = d.line_items.filter((r) => r.estimate_id === estimateId);
const extraRows = d.line_items.filter((r) => Number.isInteger(r.extra_expense_id));
check("the draft contains the estimate and the extras, and claims the estimate",
  d.estimate_id === estimateId && estRows.length === 1 && estRows[0].amount === 220 && estRows[0].qtyLabel === "per estimate" &&
  extraRows.length === 2 && d.subtotal_cents === 32725, JSON.stringify(d.line_items).slice(0, 300));
const claimed = await adminGet(`expenses?id=in.(${extras.map((e) => e.id).join(",")})&select=invoiced_on`);
check("…and claims the extras", claimed.every((e) => e.invoiced_on === draftId));

// 4. Never billed twice ------------------------------------------------------------------------------------
await page.goto(`${APP}/app/jobs/${job.id}/invoice`);
await page.getByTestId("invoice-preview").waitFor();
check("a second builder doesn't offer the estimate again, and says where it is",
  (await page.getByTestId("builder-estimate").count()) === 0 &&
  (await page.getByTestId("estimate-claimed").innerText()).includes(d.invoice_number));
let r = await owner.post("rpc/invoice_create_from_job", { p: {
  client_id: 8, job_id: job.id, billing_entity_id: d.billing_entity_id, customer_name: "x",
  line_items: [{ description: "Light prep and Touch Up Paint", qtyLabel: "per estimate", amount: 220, estimate_id: estimateId }],
  subtotal_cents: 22000, tax_rate_pct: 0, tax_cents: 0, total_cents: 22000,
} });
check("the database refuses a second draft with the same estimate", r.status >= 400 && /already on invoice/.test(JSON.stringify(r.body)),
  JSON.stringify(r.body).slice(0, 160));
await page.goto(`${APP}/app/estimator/${estimateId}`);
await page.waitForLoadState("networkidle");
check("the estimate now shows View invoice, not Create invoice",
  (await page.getByRole("link", { name: "View invoice" }).getAttribute("href")) === `/app/estimator/invoices/${draftId}` &&
  (await page.getByTestId("estimate-create-invoice").count()) === 0);

// 5. Off the draft releases it; "From the job" puts it back --------------------------------------------------
r = await owner.post("rpc/invoice_set_draft", { p: {
  invoice_id: draftId, line_items: extraRows, subtotal_cents: 10725, tax_cents: 0, total_cents: 10725,
} });
d = await inv(draftId);
check("a draft saved without the estimate's rows releases the estimate", r.status < 300 && d.estimate_id === null,
  `${r.status} ${JSON.stringify(r.body)?.slice(0, 120)}`);
await page.goto(`${APP}/app/estimator/invoices/${draftId}`);
await page.waitForLoadState("networkidle");
const offer = page.locator('[data-available="Estimate v1"]');
check("the draft offers the released estimate under From the job", (await offer.count()) === 1);
await offer.getByRole("button", { name: "Add Estimate v1" }).click();
d = await eventually(async () => { const x = await inv(draftId); return x.estimate_id === estimateId ? x : null; });
check("Add puts the estimate back at the top of the draft, claimed", d?.subtotal_cents === 32725 && d.line_items[0].estimate_id === estimateId,
  JSON.stringify(d?.line_items ?? []).slice(0, 200));

// 6. Sent: final ---------------------------------------------------------------------------------------------
r = await owner.patch(`invoices?id=eq.${draftId}`, { status: "sent", sent_at: new Date().toISOString() });
check("the draft sends", r.status < 300, JSON.stringify(r.body).slice(0, 160));
const hrs = await adminGet(`time_entries?job_id=eq.${job.id}&select=invoice_id,covered_at`);
check("unticked hours count as covered by the invoice once it's sent", hrs.every((h) => h.invoice_id === draftId && h.covered_at));
const after = await billing(job.id);
check("the job isn't ready to invoice any more", after.state === "invoiced" && after.ready_count === 0, JSON.stringify(after));
r = await owner.patch(`estimates?id=eq.${estimateId}`, { status: "lost" });
check("an estimate on a sent invoice can't change", r.status >= 400 && /went out/.test(JSON.stringify(r.body)), JSON.stringify(r.body).slice(0, 160));
r = await owner.patch(`estimate_line_items?estimate_id=eq.${estimateId}`, { description: "Changed" });
check("…nor its lines", r.status >= 400 && /went out/.test(JSON.stringify(r.body)));
r = await owner.del(`estimates?id=eq.${estimateId}`);
check("…nor be deleted", r.status >= 400 && /went out/.test(JSON.stringify(r.body)));
r = await owner.patch(`invoices?id=eq.${draftId}`, { estimate_id: null });
check("a sent invoice's estimate is final", r.status >= 400);

// 7. Voided: the estimate can be billed again --------------------------------------------------------------
r = await adminCall("POST", "rpc/invoice_void", { p_invoice_id: draftId });
await page.goto(`${APP}/app/jobs/${job.id}/invoice`);
await page.getByTestId("invoice-preview").waitFor();
check("after a void, the builder offers the estimate again", (await page.getByTestId("builder-estimate").count()) === 1);

// 8. An estimate line linked to a priced job line: refused, never billed twice -------------------------------
const job2 = (await owner.post("jobs", {
  client_id: 8, name: `Linked ${RUN}`, status: "in_progress", source: "manual", address: "8 Link St, Provo, UT 84601",
})).body[0];
const prep = (await owner.post("tasks", {
  client_id: 8, job_id: job2.id, title: "Prep walls", status: "done", qty: 1, unit: "each", unit_price: 150, billable: true, sort_order: 1,
})).body[0];
await page.goto(`${APP}/app/estimator/new?job=${job2.id}`);
await page.getByPlaceholder("Search catalog…").waitFor();
await page.waitForLoadState("networkidle");
await page.getByRole("button", { name: "Service (hours)" }).click();
await page.getByPlaceholder("Describe the work…").fill("Prep and paint walls");
await page.locator('input[placeholder="0"]').last().fill("3");
await page.getByLabel("Link to task").selectOption(String(prep.id));
await Promise.all([page.waitForURL(/\/app\/estimator\/\d+$/), page.getByRole("button", { name: "Save estimate" }).click()]);
const estimate2 = Number(page.url().split("/").pop());
await page.waitForLoadState("networkidle");
await page.getByRole("button", { name: "Accepted" }).click();
await eventually(async () => (await adminGet(`estimates?id=eq.${estimate2}&select=status`))[0].status === "accepted");
await owner.patch(`jobs?id=eq.${job2.id}`, { status: "completed" });
const builder2 = async () => {
  await page.goto(`${APP}/app/jobs/${job2.id}/invoice`);
  await page.getByTestId("invoice-preview").waitFor();
  await page.waitForLoadState("networkidle");
};
await builder2();
const twice = page.getByTestId("estimate-linked-twice");
check("estimate line linked to a priced job line: the builder says it would bill twice, and won't make the draft",
  (await twice.count()) === 1 && /"Prep and paint walls" is linked to the job line "Prep walls"/.test(await twice.innerText()) &&
  (await page.getByRole("button", { name: "Create draft" }).isDisabled()), (await twice.count()) ? await twice.innerText() : "no message");
// Marking the job line not billable (the estimate prices it) lets the draft through, with the estimate only.
await owner.patch(`tasks?id=eq.${prep.id}`, { billable: false });
await builder2();
check("…until the job line is marked not billable", (await page.getByTestId("estimate-linked-twice").count()) === 0);
await page.getByRole("button", { name: "Create draft" }).click();
await page.waitForURL(/\/app\/estimator\/invoices\/\d+$/);
const draft2 = Number(page.url().split("/").pop());
d = await inv(draft2);
check("…and the draft bills the estimate, not the job line", d.estimate_id === estimate2 && d.subtotal_cents === 33000 &&
  !d.line_items.some((x) => x.task_id === prep.id), JSON.stringify(d.line_items).slice(0, 200));
// The job line made billable again: neither the draft nor a new draft can take it.
await owner.patch(`tasks?id=eq.${prep.id}`, { billable: true });
await page.goto(`${APP}/app/estimator/invoices/${draft2}`);
await page.waitForLoadState("networkidle");
await page.locator('[data-available="Prep walls"]').getByRole("button", { name: "Add Prep walls" }).click();
const refused = page.getByTestId("job-lines").locator(".form-error");
await refused.waitFor({ timeout: 15_000 }).catch(() => {});
check("adding the linked job line to the draft is refused",
  /bill that work twice/.test((await refused.count()) ? await refused.innerText() : "") &&
  (await adminGet(`tasks?id=eq.${prep.id}&select=invoice_id`))[0].invoice_id === null);
await builder2();
check("…and so is a new draft with it", (await page.getByTestId("estimate-linked-twice").count()) === 1 &&
  (await page.getByRole("button", { name: "Create draft" }).isDisabled()));

await browser.close();
