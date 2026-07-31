/**
 * CONTACTS_PROPERTIES_SPEC — end-to-end smoke of the New Job flow, driving the
 * real modal + createJob server action as the smoke tenant's owner
 * against a local dev server. Covers all 4 paths + §5.3 unit auto-save +
 * bill-to override, asserts DB rows, cleans everything (incl. trigger/manual
 * contacts). Reference tenant untouched. Usage: node contacts-e2e.mjs [baseUrl]
 */
import {
  admin, anonClient, SUPABASE_REF, baseUrlFrom,
  CLIENT_ID, SMOKE_ID, SMOKE_EMAIL, FIXTURES, loadPlaywright,
} from "./_config.mjs";
const { chromium } = loadPlaywright();
import { createHarness } from "./_harness.mjs";

const BASE = baseUrlFrom(process.argv[2]);

const { check, note, summary, capture, capturedRows } = createHarness("contacts-e2e");

// ---- deterministic seed ----------------------------------------------------
const TAG = "E2E-CP";
// Unique per run. Fixed numbers meant a prior run's litter collided with this
// run's inserts, which is what a marker-based pre-clean was compensating for.
const RID = Math.random().toString(36).slice(2, 6);
const rnd = () => String(1000 + Math.floor(Math.random() * 8999));
const PM_PHONE = "+1801555" + rnd();
const BILLER_PHONE = "+1801555" + rnd();
const MANUAL_PHONE = "+1801555" + rnd();

// Read the reference tenant's job address up front so the "untouched" check
// compares against reality instead of a customer address baked into the repo.
const { data: refJobBefore } = await admin.from("jobs")
  .select("address").eq("id", FIXTURES.refJobId).single();
const refJobAddressBefore = refJobBefore.address;

const PASSWORD = "cpe-" + Math.random().toString(36).slice(2, 12) + "-T5!";
await admin.auth.admin.updateUserById(SMOKE_ID, { password: PASSWORD });

/**
 * Cleanup, captured ids ONLY (standing rule 2026-07-30).
 *
 * This previously resolved contacts by `client_id = 8` + a phone marker and
 * then deleted those rows plus every job and property hanging off them. The
 * final delete looked id-based, but the ids came from a scope predicate — so
 * any smoke-tenant contact that happened to share a seed number would have been
 * destroyed along with its jobs. There is also no pre-clean any more: clearing
 * a prior run's litter by scope is exactly what the rule forbids, including
 * for crash recovery. Unique-per-run seeds remove the need for one; genuine
 * orphans get reported by the residue check instead.
 */
async function cleanCaptured() {
  const rows = capturedRows();
  const ids = (t) => [...new Set(rows.filter((r) => r.table === t).map((r) => r.id))];
  for (const id of ids("jobs")) {                       // jobs first (FK)
    await admin.from("job_status_log").delete().eq("job_id", id);
    await admin.from("jobs").delete().eq("id", id);
  }
  for (const id of ids("properties")) await admin.from("properties").delete().eq("id", id);
  for (const id of ids("contacts")) await admin.from("contacts").delete().eq("id", id);
}

const { data: pm } = await admin.from("contacts").insert({
  client_id: CLIENT_ID, name: "E2E PM Vista", phone: PM_PHONE,
  first_contacted_at: new Date().toISOString(), last_contacted_at: new Date().toISOString(),
}).select("id").single();
capture("contacts", pm.id);
const { data: seededProp } = await admin.from("properties").insert({
  client_id: CLIENT_ID, contact_id: pm.id, address: "100 E2E Blvd, Provo UT", unit: null, label: "Main office",
}).select("id").single();
capture("properties", seededProp.id);
const { data: biller } = await admin.from("contacts").insert({
  client_id: CLIENT_ID, name: "E2E Biller Corp", phone: BILLER_PHONE,
  first_contacted_at: new Date().toISOString(), last_contacted_at: new Date().toISOString(),
}).select("id").single();
capture("contacts", biller.id);

// ---- browser session -------------------------------------------------------
const browser = await chromium.launch();
const context = await browser.newContext();
const user = anonClient();
const { data: si } = await user.auth.signInWithPassword({
  email: SMOKE_EMAIL, password: PASSWORD,
});
const cookieVal = "base64-" + Buffer.from(JSON.stringify(si.session), "utf8").toString("base64url");
const host = new URL(BASE).hostname;
await context.addCookies([{ name: `sb-${SUPABASE_REF}-auth-token`, value: cookieVal, domain: host, path: "/" }]);

const page = await context.newPage();

async function openForm() {
  await page.goto(BASE + "/app/jobs", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Add job" }).first().click();
  await page.getByRole("heading", { name: "New job" }).waitFor();
}
// After picking a contact, the property <select> loads async; until it does,
// the form defaults to "new property" and blocks submit on the required
// address. Wait for the seeded option to render before interacting.
async function pickPM() {
  await page.getByPlaceholder("Search or type a new name…").fill("E2E PM Vista");
  await page.getByRole("button", { name: /E2E PM Vista/ }).first().click();
  await page
    .locator("select")
    .first()
    .locator("option", { hasText: "100 E2E Blvd" })
    .first()
    .waitFor({ state: "attached", timeout: 10000 });
}
async function submit() {
  await page.getByRole("button", { name: "Create job" }).click();
  try {
    await page.waitForURL(/\/app\/jobs\/\d+$/, { timeout: 15000 });
  } catch (e) {
    const err = await page.locator(".text-status-danger span").last().textContent().catch(() => null);
    throw new Error(`submit did not navigate; modal error = ${JSON.stringify(err)}`);
  }
  const m = page.url().match(/\/app\/jobs\/(\d+)$/);
  return Number(m[1]);
}

try {
  // ---- Path 3: fresh manual lead ----
  await openForm();
  await page.getByPlaceholder("Search or type a new name…").fill("E2E Manual Guy");
  await page.getByPlaceholder("(801) 555-1234").fill("8015550243");
  await page.getByPlaceholder("e.g. 123 Main St, Provo UT").fill("55 Manual St, Orem UT");
  const jManual = capture("jobs", await submit());
  const { data: mjob } = await admin.from("jobs")
    .select("name, address, contact_id, property_id").eq("id", jManual).single();
  capture("contacts", mjob.contact_id);
  capture("properties", mjob.property_id);
  const { data: mprop } = await admin.from("properties")
    .select("address").eq("id", mjob.property_id).maybeSingle();
  check("path3 manual: job created w/ contact + property",
    !!mjob.contact_id && !!mjob.property_id && mjob.address === "55 Manual St, Orem UT",
    `addr=${mjob.address}`);
  check("path3 manual: property address matches", mprop?.address === "55 Manual St, Orem UT");

  // ---- Path 1: existing contact + existing property ----
  await openForm();
  await pickPM();
  const j1 = capture("jobs", await submit());
  const { data: j1row } = await admin.from("jobs").select("contact_id, property_id, address").eq("id", j1).single();
  check("path1 existing+existing: linked to seeded contact+property",
    j1row.contact_id === pm.id && j1row.property_id === seededProp.id, `prop=${j1row.property_id}`);
  const { count: propCount1 } = await admin.from("properties")
    .select("*", { count: "exact", head: true }).eq("contact_id", pm.id);
  check("path1: no duplicate property created", propCount1 === 1, `count=${propCount1}`);

  // ---- Path 1 + new unit: §5.3 auto-save ----
  await openForm();
  await pickPM();
  await page.getByPlaceholder("e.g. 4B").fill("Suite 300");
  const j2 = capture("jobs", await submit());
  const { data: newUnitProp } = await admin.from("properties")
    .select("id, address, unit").eq("contact_id", pm.id).eq("unit", "Suite 300").maybeSingle();
  capture("properties", newUnitProp?.id);
  check("path1 new-unit: property auto-saved (same addr, new unit)",
    !!newUnitProp && newUnitProp.address === "100 E2E Blvd, Provo UT", `unit=${newUnitProp?.unit}`);
  const { data: j2row } = await admin.from("jobs").select("property_id, address").eq("id", j2).single();
  check("path1 new-unit: job links the new property + composed address",
    j2row.property_id === newUnitProp?.id && j2row.address === "100 E2E Blvd, Provo UT, Unit Suite 300",
    j2row.address);

  // ---- Path 2: existing contact + brand-new address ----
  await openForm();
  await pickPM();
  await page.locator("select").first().selectOption("__new__");
  await page.getByPlaceholder("e.g. 123 Main St, Provo UT").fill("777 Fresh Ave, Lehi UT");
  const j3 = capture("jobs", await submit());
  const { data: freshProp } = await admin.from("properties")
    .select("id").eq("contact_id", pm.id).eq("address", "777 Fresh Ave, Lehi UT").maybeSingle();
  capture("properties", freshProp?.id);
  const { data: j3row } = await admin.from("jobs").select("property_id, contact_id").eq("id", j3).single();
  check("path2 existing+new-address: property saved on contact + linked",
    !!freshProp && j3row.property_id === freshProp.id && j3row.contact_id === pm.id);

  // ---- Bill-to override ----
  await openForm();
  await pickPM();
  await page.getByRole("button", { name: /Bill to a different contact/ }).click();
  await page.getByPlaceholder("Search a billing contact…").fill("E2E Biller");
  await page.getByRole("button", { name: /E2E Biller Corp/ }).first().click();
  const j4 = capture("jobs", await submit());
  const { data: j4row } = await admin.from("jobs").select("bill_to_contact_id").eq("id", j4).single();
  check("bill-to: job.bill_to_contact_id set to the biller", j4row.bill_to_contact_id === biller.id);

  // Invoice bill-to resolution replay (§5.4) — the exact 3-tier fallback that
  // createInvoiceFromEstimate freezes onto customer_name at creation.
  async function resolveBiller(jobId) {
    const { data: j } = await admin.from("jobs")
      .select("name, property_id, bill_to_contact_id").eq("id", jobId).single();
    let cid = j.bill_to_contact_id;
    if (!cid && j.property_id) {
      const { data: p } = await admin.from("properties").select("contact_id").eq("id", j.property_id).single();
      cid = p.contact_id;
    }
    if (cid) {
      const { data: c } = await admin.from("contacts").select("name").eq("id", cid).single();
      return c.name;
    }
    return j.name;
  }
  check("bill-to resolution: override → biller bills (not the PM)",
    (await resolveBiller(j4)) === "E2E Biller Corp");
  check("bill-to resolution: no override → property's contact bills",
    (await resolveBiller(j1)) === "E2E PM Vista");

  // ---- the reference job/Subash unchanged (the reference tenant read-only assertion) ----
  const { data: refJob } = await admin.from("jobs")
    .select("address, property_id").eq("id", FIXTURES.refJobId).single();
  const { data: refJobProperty } = await admin.from("properties")
    .select("address").eq("id", refJob.property_id).maybeSingle();
  // Compared against the value read BEFORE the run, not a literal: the address
  // belongs to a real customer in the read-only tenant and must not be
  // committed, and "unchanged" is what this actually asserts anyway.
  check("reference job: address unchanged + property resolves",
    refJob.address === refJobAddressBefore && refJobProperty?.address === refJob.address,
    refJob.address === refJobAddressBefore ? "unchanged" : "ADDRESS CHANGED");
} catch (e) {
  check("E2E run completed without exception", false, String(e).slice(0, 200));
} finally {
  await browser.close();
  await cleanCaptured();
  await admin.auth.admin.updateUserById(SMOKE_ID, { password: "reset-" + Math.random().toString(36) });
  const rows = capturedRows();
  const ids = (t) => [...new Set(rows.filter((r) => r.table === t).map((r) => r.id))];
  const left = [];
  for (const t of ["jobs", "properties", "contacts"]) {
    if (!ids(t).length) continue;
    const { data } = await admin.from(t).select("id").in("id", ids(t));
    for (const r of data ?? []) left.push(`${t}:${r.id}`);
  }
  check("zero residue (captured ids only)", left.length === 0, left.join(", "));
  // reference tenant untouched sanity: the reference job still there
  const { data: refJob } = await admin.from("jobs").select("id").eq("id", FIXTURES.refJobId).maybeSingle();
  check("reference tenant untouched (reference job present)", !!refJob);
}

process.exit(summary());
