/**
 * Micro-fix visual check — expense item identification at iPhone width (390px).
 * Seeds a the smoke tenant multi-item receipt (two items share the "HDX" prefix), shots
 * the Expenses list (collapsed), an expanded item, and the JobExpenseCapture
 * list. Owner (smoke user) session. Cleans up. Usage: node micro-fix-screenshots.mjs [baseUrl]
 */
import {
  admin, anonClient, SUPABASE_REF, OUT_DIR, baseUrlFrom, CLIENT_ID,
  SMOKE_ID, SMOKE_EMAIL, loadPlaywright,
} from "./_config.mjs";
const { chromium } = loadPlaywright();
import { createManifest } from "./_harness.mjs";

const BASE = baseUrlFrom(process.argv[2]);
const OUT = OUT_DIR;
const { capture, done: manifestDone } = createManifest("micro-fix-shots");
const host = new URL(BASE).hostname;

const PW = "shot-" + Math.random().toString(36).slice(2, 10) + "-S1!";
await admin.auth.admin.updateUserById(SMOKE_ID, { password: PW });

const { data: job } = await admin.from("jobs").insert({
  client_id: CLIENT_ID, name: "MICROFIX shot", phone: "+18015550281", address: "7 Shot Ln", status: "in_progress", source: "manual",
}).select("id, contact_id").single();
capture("jobs", job.id);
capture("contacts", job.contact_id); // trigger-created on every job insert
const { data: purchase } = await admin.from("purchases").insert({
  client_id: CLIENT_ID, vendor: "Home Depot", purchase_date: "2026-07-20", source: "manual", subtotal: 138.9, tax: 9.72, total: 148.62,
}).select("id").single();
capture("purchases", purchase.id);
// Two items share the "HDX" prefix; one long "Mr. Clean" and one "5 gallon".
const items = [
  { description: "HDX 5 gal all-purpose bucket with reusable snap lid", unit_price: 8.98, qty: 2, amount: 17.96, sku: "1004-655-142", assignment: "job_in_bid", job_id: job.id },
  { description: "HDX 9-inch heavy-duty roller frame + 3 covers", unit_price: 12.47, qty: 1, amount: 12.47, sku: "1005-321-908", assignment: "job_in_bid", job_id: job.id },
  { description: "Mr. Clean Multi-Surface Antibacterial cleaner, 45 oz refill", unit_price: 6.98, qty: 1, amount: 6.98, sku: "MRC-45-ANTI", assignment: "unassigned", job_id: null },
  { description: "5 gallon ceiling flat ultra-white interior paint", unit_price: 111.49, qty: 1, amount: 111.49, sku: "PPG-CEIL-5G", assignment: "unassigned", job_id: null },
];
const { data: seeded } = await admin.from("expenses").insert(items.map((it) => ({
  client_id: CLIENT_ID, purchase_id: purchase.id, expense_date: "2026-07-20", category: "Materials & supplies", ...it,
}))).select("id");
for (const r of seeded ?? []) capture("expenses", r.id);

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

  await page.goto(`${BASE}/app/estimator/purchases`, { waitUntil: "domcontentloaded" });
  await page.getByText("HDX 5 gal", { exact: false }).first().waitFor({ timeout: 10000 });
  await page.screenshot({ path: `${OUT}/microfix-expenses-list.png`, fullPage: true });
  console.log("shot: expenses list");

  // expand the first HDX item
  await page.getByText("HDX 5 gal", { exact: false }).first().click();
  await page.getByText(/SKU 1004-655-142/).waitFor({ timeout: 5000 });
  await page.screenshot({ path: `${OUT}/microfix-expenses-expanded.png`, fullPage: true });
  console.log("shot: expanded item");

  await page.goto(`${BASE}/app/jobs/${job.id}`, { waitUntil: "domcontentloaded" });
  await page.getByText("Job expenses").waitFor({ timeout: 10000 });
  await page.screenshot({ path: `${OUT}/microfix-job-capture.png`, fullPage: true });
  console.log("shot: job capture list");

  await ctx.close();
} finally {
  await browser.close();
  await admin.from("expenses").delete().eq("purchase_id", purchase.id);
  await admin.from("job_status_log").delete().eq("job_id", job.id);
  await admin.from("jobs").delete().eq("id", job.id);
  await admin.from("purchases").delete().eq("id", purchase.id);
  if (job?.contact_id) await admin.from("contacts").delete().eq("id", job.contact_id);
  await admin.auth.admin.updateUserById(SMOKE_ID, { password: "reset-" + Math.random().toString(36) });
  manifestDone();
  console.log("cleaned");
}
