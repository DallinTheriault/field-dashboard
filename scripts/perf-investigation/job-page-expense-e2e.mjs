/**
 * JOB_PAGE_EXPENSE_SPEC E2E — the SMOKE TENANT ONLY.
 * Part A: receipt-level assignment (stock + job tap counts reported
 *   separately), split + multi-select, member has no job_extra and a tampered
 *   request is rejected, pass/mismatch states.
 * Part B: customer info appears once, Job/Activity/Timestamps collapsed,
 *   only one expense form on the job page.
 * Part C: absorbed/billed/in-bid correct with stock excluded; Money totals.
 * Plus: NO BACKFILL (pre-existing unassigned rows stay unassigned), RLS,
 * zero residue. the reference tenant is READ-ONLY — its purchases 63/64 are the owner's
 * real pending queue and must not be touched.
 * Usage: node job-page-expense-e2e.mjs [baseUrl]
 */
import {
  admin, anonClient, SUPABASE_REF, baseUrlFrom, CLIENT_ID, REF_CLIENT_ID,
  SMOKE_ID, SMOKE_EMAIL, loadPlaywright, TEMP_EMAIL_DOMAIN,
} from "./_config.mjs";
const { chromium } = loadPlaywright();
import { createHarness } from "./_harness.mjs";

const BASE = baseUrlFrom(process.argv[2]);
const host = new URL(BASE).hostname;

const { check, summary, note, capture } = createHarness("job-page-expense");

const RID = Math.random().toString(36).slice(2, 6);
const created = { purchases: [], jobs: [], contacts: [], properties: [], expenses: [] };

/**
 * A fingerprint of the reference tenant's expense/purchase state — every row id with its
 * assignment and job. Taken before and after the run and compared verbatim, so
 * the assertion is "this run changed nothing" rather than a hardcoded census
 * that the owner's ordinary work invalidates.
 */
async function refTenantSnapshot() {
  const { data: e } = await admin.from("expenses")
    .select("id, assignment, job_id").eq("client_id", REF_CLIENT_ID).order("id");
  const { data: p } = await admin.from("purchases")
    .select("id").eq("client_id", REF_CLIENT_ID).order("id");
  return JSON.stringify({
    expenses: (e ?? []).length,
    purchases: (p ?? []).length,
    rows: (e ?? []).map((r) => `${r.id}:${r.assignment}:${r.job_id ?? "-"}`),
    pids: (p ?? []).map((r) => r.id),
  });
}
const refTenantBefore = await refTenantSnapshot();
let memberId = null;
let sentinelId = null;

const PW = "jp-" + Math.random().toString(36).slice(2, 10) + "-Q1!";
await admin.auth.admin.updateUserById(SMOKE_ID, { password: PW });

async function mkPurchase(vendor, items) {
  const { data: p } = await admin.from("purchases").insert({
    client_id: CLIENT_ID, vendor, purchase_date: "2026-07-30", source: "scan",
    subtotal: 100, tax: 7, total: 107, receipt_paths: [],
  }).select("id").single();
  created.purchases.push(capture("purchases", p.id));
  return p.id;
}

const browser = await chromium.launch();
try {
  // ---- SENTINEL: a pre-existing unassigned item that must NEVER be touched
  const sentinelPurchase = await mkPurchase(`Sentinel ${RID}`);
  const { data: sentinel } = await admin.from("expenses").insert({
    client_id: CLIENT_ID, purchase_id: sentinelPurchase, expense_date: "2026-07-01",
    category: "Materials & supplies", description: `SENTINEL ${RID}`,
    amount: 42, assignment: "unassigned",
  }).select("id, assignment").single();
  sentinelId = capture("expenses", sentinel.id);

  // ---- seed a job with a property
  const { data: contact } = await admin.from("contacts").insert({
    client_id: CLIENT_ID, name: `Page Probe ${RID}`, phone: `+1801555${8000 + Math.floor(Math.random() * 900)}`,
  }).select("id, phone").single();
  created.contacts.push(capture("contacts", contact.id));
  const { data: prop } = await admin.from("properties").insert({
    client_id: CLIENT_ID, contact_id: contact.id, address: `5 Restructure Rd ${RID}, Provo UT`, unit: "7",
  }).select("id").single();
  created.properties.push(capture("properties", prop.id));
  const { data: job } = await admin.from("jobs").insert({
    client_id: CLIENT_ID, name: `Page Probe ${RID}`, phone: contact.phone,
    address: `5 Restructure Rd ${RID}, Provo UT, Unit 7`, status: "in_progress",
    contact_id: contact.id, property_id: prop.id, source: "manual",
    service: "Turn work", scope: "paint",
  }).select("id, job_number").single();
  created.jobs.push(capture("jobs", job.id));
  // Part C seeds three loose expenses later; their ids are captured there.

  const anon = anonClient();
  const { data: si, error: siErr } = await anon.auth.signInWithPassword({
    email: SMOKE_EMAIL, password: PW });
  if (siErr) throw new Error("owner sign-in: " + siErr.message);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([{
    name: `sb-${SUPABASE_REF}-auth-token`,
    value: "base64-" + Buffer.from(JSON.stringify(si.session), "utf8").toString("base64url"),
    domain: host, path: "/",
  }]);
  const page = await ctx.newPage();

  // ===== Part A: STOCK receipt from the Expenses page — count the taps =====
  const stockPurchase = await mkPurchase(`Stock Run ${RID}`);
  await page.goto(`${BASE}/app/estimator/purchases`, { waitUntil: "domcontentloaded" });
  await page.locator("li", { hasText: `Stock Run ${RID}` })
    .getByRole("button", { name: "Enter items" }).first().click();   // tap 1 (stands in for Camera)
  const vendorInput = page.getByPlaceholder("Vendor").first();
  await vendorInput.waitFor({ timeout: 15000 });
  // Scope to the open confirm panel so nothing else on the page can match.
  const stockPanel = page.locator("li", { has: page.getByPlaceholder("Vendor") }).first();
  await stockPanel.getByPlaceholder("Item").first().fill("Shop towels");
  await stockPanel.getByLabel("Amount").first().fill("14.98");
  let stockTaps = 1;
  await stockPanel.getByRole("button", { name: "Stock", exact: true }).first().click(); // tap 2
  stockTaps++;
  check("Stock is a PEER choice — no job picker appears for it",
    (await stockPanel.getByRole("combobox", { name: "Job" }).count()) === 0);
  check("Stock choice registers on the control",
    (await stockPanel.getByRole("button", { name: "Stock", exact: true }).first()
      .getAttribute("aria-pressed")) === "true");
  await stockPanel.getByRole("button", { name: "Accept" }).click();       // tap 3
  stockTaps++;
  await page.waitForTimeout(2500);
  const { data: stockItems } = await admin.from("expenses")
    .select("assignment, job_id").eq("purchase_id", stockPurchase);
  check("stock receipt: every item persisted as stock, no job",
    (stockItems ?? []).length > 0 && stockItems.every((i) => i.assignment === "stock" && i.job_id === null),
    JSON.stringify(stockItems));
  note(`TAP COUNT — stock receipt: ${stockTaps} (enter/scan → Stock → Accept)`);

  // ===== Part A: JOB receipt — count the taps =====
  const jobPurchase = await mkPurchase(`Job Run ${RID}`);
  await page.goto(`${BASE}/app/estimator/purchases`, { waitUntil: "domcontentloaded" });
  await page.locator("li", { hasText: `Job Run ${RID}` })
    .getByRole("button", { name: "Enter items" }).first().click();     // tap 1
  await page.getByPlaceholder("Vendor").first().waitFor({ timeout: 15000 });
  await page.getByPlaceholder("Item").first().fill("Paint, 2 gal");
  await page.getByLabel("Amount").first().fill("89.98");
  let jobTaps = 1;
  await page.getByRole("button", { name: "A job", exact: true }).first().click();    // tap 2
  jobTaps++;
  await page.getByRole("combobox", { name: "Job" }).selectOption(String(job.id)); // tap 3
  jobTaps++;
  await page.getByRole("button", { name: "Accept" }).click();           // tap 4
  jobTaps++;
  await page.waitForTimeout(2500);
  const { data: jobItems } = await admin.from("expenses")
    .select("assignment, job_id").eq("purchase_id", jobPurchase);
  check("job receipt: every item persisted job_in_bid against that job",
    (jobItems ?? []).length > 0 && jobItems.every((i) => i.assignment === "job_in_bid" && i.job_id === job.id),
    `${(jobItems ?? []).length} items`);
  note(`TAP COUNT — job receipt: ${jobTaps} (enter/scan → A job → pick job → Accept)`);

  // ===== pass state vs mismatch =====
  const passPurchase = await mkPurchase(`Totals ${RID}`);
  await page.goto(`${BASE}/app/estimator/purchases`, { waitUntil: "domcontentloaded" });
  await page.locator("li", { hasText: `Totals ${RID}` })
    .getByRole("button", { name: "Enter items" }).first().click();
  await page.getByPlaceholder("Vendor").first().waitFor({ timeout: 15000 });
  await page.getByLabel("Receipt total").fill("107");
  await page.getByLabel("Receipt tax").fill("7");
  await page.getByPlaceholder("Item").first().fill("Matches");
  await page.getByLabel("Amount").first().fill("100");
  await page.waitForTimeout(600);
  const bodyPass = await page.locator("body").innerText();
  check("matching totals show a pass state, not a warning",
    /add up to the receipt total/i.test(bodyPass) || !/may be missing/i.test(bodyPass));
  // now force a mismatch
  await page.getByLabel("Receipt total").fill("999");
  await page.waitForTimeout(700);
  const bodyMismatch = await page.locator("body").innerText();
  check("deliberate mismatch surfaces the warning and still allows Accept",
    /may be missing, doubled, or misread/i.test(bodyMismatch) &&
    (await page.getByRole("button", { name: "Accept" }).isEnabled()));

  // ===== split + multi-select =====
  const splitPurchase = await mkPurchase(`Split ${RID}`);
  await page.goto(`${BASE}/app/estimator/purchases`, { waitUntil: "domcontentloaded" });
  await page.locator("li", { hasText: `Split ${RID}` })
    .getByRole("button", { name: "Enter items" }).first().click();
  await page.getByPlaceholder("Vendor").first().waitFor({ timeout: 15000 });
  await page.getByPlaceholder("Item").first().fill("Bulk stock item");
  await page.getByLabel("Amount").first().fill("10");
  await page.getByRole("button", { name: "Add row" }).click();
  const items2 = page.getByPlaceholder("Item");
  await items2.nth(1).fill("The odd one out");
  await page.getByLabel("Amount").nth(1).fill("20");
  await page.getByRole("button", { name: "Stock", exact: true }).first().click();
  await page.getByRole("button", { name: "Split this receipt" }).click();
  check("split reveals per-item selection controls",
    (await page.locator('input[type="checkbox"][aria-label^="Select"]').count()) >= 2);
  await page.locator('input[type="checkbox"][aria-label^="Select"]').nth(1).check();
  await page.getByRole("button", { name: "A job", exact: true }).first().click();
  await page.getByRole("combobox", { name: "Job" }).selectOption(String(job.id));
  await page.getByRole("button", { name: /Apply to 1 selected/ }).click();
  await page.getByRole("button", { name: "Accept" }).click();
  await page.waitForTimeout(2500);
  const { data: splitItems } = await admin.from("expenses")
    .select("description, assignment, job_id").eq("purchase_id", splitPurchase);
  const bulk = (splitItems ?? []).find((i) => i.description === "Bulk stock item");
  const odd = (splitItems ?? []).find((i) => i.description === "The odd one out");
  check("multi-select assignment splits one item off the receipt default",
    bulk?.assignment === "stock" && odd?.assignment === "job_in_bid" && odd?.job_id === job.id,
    `bulk=${bulk?.assignment} odd=${odd?.assignment}`);

  // ===== Part C: absorbed / billed / in bid on the job =====
  const { data: looseSeed } = await admin.from("expenses").insert([
    { client_id: CLIENT_ID, job_id: job.id, expense_date: "2026-07-30", category: "Materials & supplies",
      description: `absorbed ${RID}`, amount: 12.25, assignment: "job_internal" },
    { client_id: CLIENT_ID, job_id: job.id, expense_date: "2026-07-30", category: "Materials & supplies",
      description: `billed ${RID}`, amount: 25, assignment: "job_extra" },
    { client_id: CLIENT_ID, expense_date: "2026-07-30", category: "Tools & equipment",
      description: `stock excl ${RID}`, amount: 999, assignment: "stock" },
  ]).select("id");
  created.expenses.push(...(looseSeed ?? []).map((r) => capture("expenses", r.id)));
  await page.goto(`${BASE}/app/jobs/${job.id}`, { waitUntil: "domcontentloaded" });
  await page.getByText("Job expenses").waitFor({ timeout: 20000 });
  const jobBody = await page.locator("body").innerText();
  check("job shows in bid / billed / absorbed with stock excluded",
    jobBody.includes("$89.98") && jobBody.includes("$25.00") && jobBody.includes("$12.25") &&
    !jobBody.includes("$999"),
    jobBody.match(/Materials:[\s\S]{0,80}/)?.[0]?.replace(/\n/g, " "));

  // ===== Part B: layout =====
  const addrCount = (jobBody.match(new RegExp(`5 Restructure Rd ${RID}`, "g")) ?? []).length;
  check("customer info appears exactly once (header only, no customer card)",
    addrCount === 1 && !/^\s*customer\s*$/im.test(jobBody), `address x${addrCount}`);
  check("Activity / Timestamps are collapsed by default (Job folded into the details sheet)",
    (await page.locator("details:not([open]) summary", { hasText: "Activity" }).count()) > 0 &&
    (await page.locator("details:not([open]) summary", { hasText: "Timestamps" }).count()) > 0 &&
    (await page.locator("details summary", { hasText: /^Job$/ }).count()) === 0);
  await page.locator("details summary", { hasText: "Timestamps" }).first().click();
  await page.waitForTimeout(300);
  check("a disclosure expands", (await page.locator("details[open]").count()) > 0);
  const jobLc = jobBody.toLowerCase();
  check("only ONE expense entry form on the job page (Materials-used removed)",
    !jobLc.includes("materials used") && jobLc.includes("log an expense"));
  check("hours entry is present and legible; the mileage proposal is untouched",
    jobLc.includes("actuals") &&
    (await page.getByLabel("Hours").count()) === 1 &&
    (await page.getByLabel("Note (optional)").count()) === 1 &&
    (await page.getByRole("button", { name: "Log time" }).count()) === 1);

  // ===== per-item reassignment still moves an item to absorbed =====
  const { data: toMove } = await admin.from("expenses")
    .select("id").eq("purchase_id", jobPurchase).limit(1).single();
  await page.goto(`${BASE}/app/estimator/purchases`, { waitUntil: "domcontentloaded" });
  await page.getByText("Paint, 2 gal").first().click();
  await page.locator('select[aria-label="Assignment"]').first().selectOption("job_internal");
  await page.getByRole("button", { name: "Apply" }).first().click();
  await page.waitForTimeout(2000);
  const { data: moved } = await admin.from("expenses")
    .select("assignment").eq("id", toMove.id).single();
  check("per-item reassignment still moves an item into job_internal",
    moved.assignment === "job_internal", moved.assignment);

  // ===== NO BACKFILL: the sentinel is untouched =====
  const { data: sentinelAfter } = await admin.from("expenses")
    .select("assignment, job_id").eq("id", sentinelId).single();
  check("pre-existing unassigned item was NOT retroactively assigned",
    sentinelAfter.assignment === "unassigned" && sentinelAfter.job_id === null,
    sentinelAfter.assignment);

  // ===== Money page totals =====
  await page.goto(`${BASE}/app/estimator/expenses?y=2026`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Money" }).waitFor({ timeout: 20000 });
  const money = (await page.locator("body").innerText()).toLowerCase();
  check("Money shows absorbed, billed, in bid and stock for the year",
    money.includes("absorbed") && money.includes("billed") && money.includes("in bid") &&
    money.includes("stock by category"));
  await ctx.close();

  // ===== member: no job_extra + tampered request rejected =====
  const mEmail = `page-mem-${RID}@${TEMP_EMAIL_DOMAIN}`;
  const mPw = "pm-" + Math.random().toString(36).slice(2, 10) + "-R2!";
  const { data: mk } = await admin.auth.admin.createUser({ email: mEmail, password: mPw, email_confirm: true });
  memberId = mk.user.id;
  await admin.from("client_users").insert({ client_id: CLIENT_ID, auth_user_id: memberId, role: "member" });
  const { data: msi } = await anon.auth.signInWithPassword({ email: mEmail, password: mPw });
  const mCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await mCtx.addCookies([{
    name: `sb-${SUPABASE_REF}-auth-token`,
    value: "base64-" + Buffer.from(JSON.stringify(msi.session), "utf8").toString("base64url"),
    domain: host, path: "/",
  }]);
  const mPage = await mCtx.newPage();
  await mPage.goto(`${BASE}/app/jobs/${job.id}`, { waitUntil: "domcontentloaded" });
  await mPage.getByText("Job expenses").waitFor({ timeout: 20000 });
  const mOpts = await mPage.locator('select[aria-label="Assignment"]').first()
    .locator("option").evaluateAll((os) => os.map((o) => o.value));
  check("member's assignment control offers no job_extra", !mOpts.includes("job_extra"), mOpts.join(","));
  // tampered: inject the option and submit
  await mPage.getByPlaceholder("Item (e.g. Paint, 2 gal)").fill(`tamper ${RID}`);
  await mPage.locator('input[placeholder="0.00"]').first().fill("5");
  await mPage.evaluate(() => {
    const sel = document.querySelector('select[aria-label="Assignment"]');
    const o = document.createElement("option");
    o.value = "job_extra"; o.text = "x";
    sel.appendChild(o); sel.value = "job_extra";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await mPage.getByRole("button", { name: "Log expense" }).click();
  await mPage.waitForTimeout(2000);
  const { data: tampered } = await admin.from("expenses")
    .select("id").eq("client_id", CLIENT_ID).eq("description", `tamper ${RID}`);
  check("tampered job_extra rejected server-side, no row written",
    (tampered ?? []).length === 0);
  await mCtx.close();

  // ===== RLS second tenant =====
  const oDb = anonClient();
  await oDb.auth.setSession(si.session);
  const { data: sharp } = await oDb.from("expenses").select("id").eq("client_id", REF_CLIENT_ID);
  check("RLS: smoke-tenant owner sees no the reference tenant expenses", (sharp ?? []).length === 0);
} catch (e) {
  check("E2E completed without exception", false, String(e).slice(0, 250));
} finally {
  await browser.close();
  for (const id of created.jobs) {
    await admin.from("mileage_entries").delete().eq("job_id", id);
    await admin.from("time_entries").delete().eq("job_id", id);
    await admin.from("expenses").delete().eq("job_id", id);
    await admin.from("job_status_log").delete().eq("job_id", id);
    await admin.from("jobs").delete().eq("id", id);
  }
  if (created.expenses.length) {
    await admin.from("expenses").delete().in("id", created.expenses);
  }
  for (const id of created.purchases) {
    await admin.from("expenses").delete().eq("purchase_id", id);
    await admin.from("purchases").delete().eq("id", id);
  }
  for (const id of created.properties) await admin.from("properties").delete().eq("id", id);
  for (const id of created.contacts) await admin.from("contacts").delete().eq("id", id);
  if (memberId) {
    await admin.from("client_users").delete().eq("auth_user_id", memberId);
    await admin.auth.admin.deleteUser(memberId);
  }
  await admin.auth.admin.updateUserById(SMOKE_ID, { password: "reset-" + Math.random().toString(36) });

  // Residue is about THIS run's rows. A the smoke tenant-wide count also fails on any
  // row the run never created — someone else's litter, or a demo row — which
  // reports a false regression and, worse, tempts a cleanup by scope.
  const { data: leftExp } = await admin.from("expenses").select("id").in("id", created.expenses.length ? created.expenses : [-1]);
  const { data: leftPur } = await admin.from("purchases").select("id").in("id", created.purchases.length ? created.purchases : [-1]);
  const { data: leftJob } = await admin.from("jobs").select("id").in("id", created.jobs.length ? created.jobs : [-1]);
  check("zero residue (captured ids only)",
    (leftExp ?? []).length === 0 && (leftPur ?? []).length === 0 && (leftJob ?? []).length === 0,
    `expenses=${(leftExp ?? []).length} purchases=${(leftPur ?? []).length} jobs=${(leftJob ?? []).length}`);

  // the reference tenant must be exactly as we found it. Compare against the snapshot
  // taken at the START of this run, never against numbers baked into the
  // script: the reference tenant is a LIVE business, so the owner assigning his own queue or
  // scanning a receipt would otherwise read as a regression. What must hold is
  // that this run changed nothing, not that his data stopped moving.
  const after = await refTenantSnapshot();
  check("reference tenant untouched: identical to the snapshot taken before this run",
    after === refTenantBefore,
    after === refTenantBefore ? `${JSON.parse(after).expenses} expenses / ${JSON.parse(after).purchases} purchases, unchanged`
      : `before ${refTenantBefore} / after ${after}`);
}

process.exit(summary());
