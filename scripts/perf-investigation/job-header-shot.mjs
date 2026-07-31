/**
 * Job page header micro-fix — iPhone-width visual + structural check.
 * Seeds its own preconditions (job + property + contact + one expense),
 * cleans by captured ids only. Uses the shared harness: a skip is NOT RUN.
 * Usage: node job-header-shot.mjs [baseUrl]
 */
import {
  admin, anonClient, SUPABASE_REF, OUT_DIR, baseUrlFrom,
  CLIENT_ID, SMOKE_ID, SMOKE_EMAIL, loadPlaywright,
} from "./_config.mjs";
const { chromium } = loadPlaywright();
import { createHarness } from "./_harness.mjs";

const { check, summary, note, capture } = createHarness("job-header");
const BASE = baseUrlFrom(process.argv[2]);
const OUT = OUT_DIR;
const host = new URL(BASE).hostname;
const RID = Math.random().toString(36).slice(2, 6);
// Unique per run so a previous run's litter can never block seeding.
// Deliberately nothing to do with painting: the chip must render whatever the
// tenant's data holds, with no label hardcoded anywhere in the app.
const SERVICE = "Furnace tune-up";
const SCOPE = "Replace igniter, clean burners, verify flue draft and CO levels";
const PHONE2 = "+1802555" + String(1000 + Math.floor(Math.random() * 8999));
const PHONE = "+1801555" + String(1000 + Math.floor(Math.random() * 8999));

const PW = "hdr-" + Math.random().toString(36).slice(2, 10) + "-H1!";
await admin.auth.admin.updateUserById(SMOKE_ID, { password: PW });

const { data: contact } = await admin.from("contacts").insert({
  client_id: CLIENT_ID, name: `Header Probe ${RID}`, phone: PHONE, email: "header.probe@example.com",
}).select("id").single();
capture("contacts", contact.id);
const { data: prop } = await admin.from("properties").insert({
  client_id: CLIENT_ID, contact_id: contact.id, address: "2376 W 12920 S, Riverton UT 84065", unit: "4B",
}).select("id").single();
capture("properties", prop.id);
const { data: job } = await admin.from("jobs").insert({
  client_id: CLIENT_ID, name: `Header Probe ${RID}`, phone: PHONE, email: "header.probe@example.com",
  address: "2376 W 12920 S, Riverton UT 84065, Unit 4B", status: "in_progress",
  contact_id: contact.id, property_id: prop.id, source: "manual",
  service: SERVICE, scope: SCOPE,
}).select("id, job_number").single();
capture("jobs", job.id);
const { data: exp } = await admin.from("expenses").insert({
  client_id: CLIENT_ID, job_id: job.id, expense_date: "2026-07-30", category: "Materials & supplies",
  description: "Header probe material", amount: 20, assignment: "job_in_bid",
}).select("id").single();
capture("expenses", exp.id);

const { data: bareJob } = await admin.from("jobs").insert({
  client_id: CLIENT_ID, name: `Bare Probe ${RID}`, phone: PHONE2,
  address: "9 Bare St", status: "lead", contact_id: contact.id, source: "manual",
}).select("id").single();
capture("jobs", bareJob.id);

const browser = await chromium.launch();
try {
  const anon = anonClient();
  const { data: si } = await anon.auth.signInWithPassword({ email: SMOKE_EMAIL, password: PW });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addCookies([{
    name: `sb-${SUPABASE_REF}-auth-token`,
    value: "base64-" + Buffer.from(JSON.stringify(si.session), "utf8").toString("base64url"),
    domain: host, path: "/",
  }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app/jobs/${job.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: `Header Probe ${RID}` }).waitFor({ timeout: 25000 });

  const body = await page.locator("body").innerText();
  const lc = body.toLowerCase();

  // label-eyebrow CSS-uppercases and innerText returns the rendered case.
  const nameIdx = lc.indexOf(`header probe ${RID}`.toLowerCase());
  const numIdx = lc.indexOf(String(job.job_number).toLowerCase());
  check("job number, status and assignment sit above the name",
    numIdx >= 0 && numIdx < nameIdx && /in progress/i.test(body),
    `num@${numIdx} name@${nameIdx}`);
  check("phone is a tel: link in the header",
    (await page.locator(`a[href="tel:${PHONE}"]`).count()) >= 1);
  check("address opens maps from the header (one tap)",
    (await page.locator('a[href^="https://maps.google.com/?q="]').count()) >= 1);
  check("property unit is shown with the address", body.includes("Unit 4B"));

  // --- service chip + details sheet (multi-tenant: nothing hardcoded) ---
  check("service chip shows the tenant's own service value verbatim",
    body.includes(SERVICE), SERVICE);
  check("scope is NOT on the chip / header", !body.includes(SCOPE));
  const chip = page.getByRole("button", { name: new RegExp(`Job details`) });
  check("service chip is tappable", (await chip.count()) === 1);
  await chip.first().click();
  await page.getByRole("dialog", { name: "Job details" }).waitFor({ timeout: 10000 });
  const sheet = await page.getByRole("dialog", { name: "Job details" }).innerText();
  check("sheet shows service, full scope, quoted price, start and end",
    sheet.includes(SERVICE) && sheet.includes(SCOPE) &&
    /quoted price/i.test(sheet) && /start/i.test(sheet) && /end/i.test(sheet));
  await page.screenshot({ path: `${OUT}/jobheader-details-sheet.png`, fullPage: false });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  check("no collapsed Job disclosure remains",
    (await page.locator("details summary", { hasText: /^Job$/ }).count()) === 0);
  check("Activity and Timestamps disclosures remain",
    (await page.locator("details summary", { hasText: "Activity" }).count()) === 1 &&
    (await page.locator("details summary", { hasText: "Timestamps" }).count()) === 1);
  check("no customer card remains", !/^\s*customer\s*$/im.test(body));
  check("email is NOT in the header", !body.includes("header.probe@example.com"));

  // Options menu
  const menuBtn = page.getByRole("button", { name: "Job options" });
  check("options (3-dot) menu present", (await menuBtn.count()) === 1);
  await menuBtn.click();
  await page.waitForTimeout(300);
  const items = await page.getByRole("menuitem").allInnerTexts();
  const flat = items.join(" | ");
  note(`menu: ${flat}`);
  for (const want of ["Call", "Text", "Copy phone", "Copy address", "Map", "New estimate"]) {
    check(`menu has "${want}"`, items.some((t) => t.trim().startsWith(want)));
  }
  check("email lives in the menu", flat.includes("header.probe@example.com"));
  await page.screenshot({ path: `${OUT}/jobheader-menu-open.png`, fullPage: false });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);

  // Section order
  const order = ["job expenses", "actuals", "tasks"];
  const idx = order.map((t) => lc.indexOf(t));
  check("section order is Job Expenses → Actuals → Tasks",
    idx.every((i) => i >= 0) && idx[0] < idx[1] && idx[1] < idx[2], JSON.stringify(idx));
  check("exactly two collapsed disclosures remain (Activity, Timestamps)",
    (await page.locator("details:not([open])").count()) === 2);

  // No horizontal overflow at iPhone width
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth);
  check("no horizontal overflow at 390px", !overflow);

  // Empty service → neutral "Details" chip, never an empty or placeholder one.
  await page.goto(`${BASE}/app/jobs/${bareJob.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: `Bare Probe ${RID}` }).waitFor({ timeout: 20000 });
  const bareChip = page.getByRole("button", { name: /Job details/ });
  check("service-less job renders a neutral \"Details\" chip",
    (await bareChip.count()) === 1 &&
    (await bareChip.first().innerText()).trim().toLowerCase().startsWith("details"),
    (await bareChip.first().innerText()).trim());
  await page.goto(`${BASE}/app/jobs/${job.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: `Header Probe ${RID}` }).waitFor({ timeout: 20000 });

  await page.screenshot({ path: `${OUT}/jobheader-390.png`, fullPage: true });
  note("screenshots: jobheader-390.png, jobheader-menu-open.png");
  await ctx.close();
} catch (e) {
  check("run completed without exception", false, String(e).slice(0, 200));
} finally {
  await browser.close();
  await admin.from("expenses").delete().eq("id", exp.id);
  await admin.from("job_status_log").delete().eq("job_id", bareJob.id);
  await admin.from("jobs").delete().eq("id", bareJob.id);
  await admin.from("job_status_log").delete().eq("job_id", job.id);
  await admin.from("jobs").delete().eq("id", job.id);
  await admin.from("properties").delete().eq("id", prop.id);
  await admin.from("contacts").delete().eq("id", contact.id);
  await admin.auth.admin.updateUserById(SMOKE_ID, { password: "reset-" + Math.random().toString(36) });
  const { data: left } = await admin.from("jobs").select("id").eq("id", job.id);
  check("zero residue (captured ids only)", (left ?? []).length === 0);
}

process.exit(summary());
