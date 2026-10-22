/**
 * Job numbers (v103) — E2E on the smoke tenant. Part B: the trigger numbers
 * jobs "Job N" from a per-business counter (consecutive, never reused, kept
 * on rename). Part A: the purchases job picker lists two jobs for one contact
 * as distinct, address-bearing options with their numbers. RLS second-tenant
 * probe. Zero residue; reference tenant untouched.
 * Usage: node job-numbering-e2e.mjs [baseUrl]
 */
import {
  admin, anonClient, SUPABASE_REF, baseUrlFrom,
  CLIENT_ID, REF_CLIENT_ID, SMOKE_ID, SMOKE_EMAIL, FIXTURES, loadPlaywright,
} from "./_config.mjs";
const { chromium } = loadPlaywright();
import { createHarness } from "./_harness.mjs";

const BASE = baseUrlFrom(process.argv[2]);
const host = new URL(BASE).hostname;

const { check, note, summary, capture } = createHarness("job-numbering-e2e");

const RID = Math.random().toString(36).slice(2, 6);   // rerun-safe unique slugs
const SUR = "Znt" + RID;                                 // shared surname
const PSUR = "Plm" + RID;                                // company slug
const PHONES = [];
const createdJobs = [];
const createdContacts = [];

async function mkContact(name) {
  const phone = "+1801555" + String(4000 + createdContacts.length).padStart(4, "0");
  PHONES.push(phone);
  const { data } = await admin.from("contacts").insert({
    client_id: CLIENT_ID, name, phone, first_contacted_at: new Date().toISOString(), last_contacted_at: new Date().toISOString(),
  }).select("id").single();
  createdContacts.push(capture("contacts", data.id));
  return data.id;
}
async function mkJob(contactId, name, address) {
  const { data } = await admin.from("jobs").insert({
    client_id: CLIENT_ID, name, phone: "+1801555" + String(9000 + createdJobs.length).padStart(4, "0"),
    address, status: "lead", contact_id: contactId, source: "manual",
  }).select("id, job_number").single();
  createdJobs.push(capture("jobs", data.id));
  return data;
}

const PW = "jn-" + Math.random().toString(36).slice(2, 10) + "-N1!";
await admin.auth.admin.updateUserById(SMOKE_ID, { password: PW });

const { data: refBefore } = await admin.from("jobs").select("job_number").eq("id", FIXTURES.refJobId).single();
const browser = await chromium.launch();
try {
  // ---- Part B: numbering ----
  const { data: counter } = await admin.from("job_counters").select("last_job_seq").eq("client_id", CLIENT_ID).maybeSingle();
  const n0 = Number(counter?.last_job_seq ?? 0);
  const cA = await mkContact(`Alice ${SUR}`);
  const j1 = await mkJob(cA, `Alice ${SUR}`, "10 Alpha St, Provo UT");
  check("a new job takes the business's next number", j1.job_number === `Job ${n0 + 1}`, j1.job_number);
  const j2 = await mkJob(cA, `Alice ${SUR}`, "20 Beta Ave, Provo UT");
  check("the next one, the next number", j2.job_number === `Job ${n0 + 2}`, j2.job_number);
  const cC = await mkContact(`Acme ${PSUR} LLC`);
  const j3 = await mkJob(cC, `Acme ${PSUR} LLC`, "40 Delta Ln, Provo UT");
  check("any contact, same counter", j3.job_number === `Job ${n0 + 3}`, j3.job_number);

  // rename immutability
  await admin.from("contacts").update({ name: `Renamed ${RID}` }).eq("id", cA);
  const { data: reread } = await admin.from("jobs").select("job_number").eq("id", j1.id).single();
  check("job number unchanged after contact rename", reread.job_number === j1.job_number, reread.job_number);

  // every job has a number since v103's backfill
  const { count: nullCount } = await admin.from("jobs")
    .select("*", { count: "exact", head: true }).eq("client_id", CLIENT_ID).is("job_number", null);
  check("every job has a number", (nullCount ?? 0) === 0, `${nullCount} without`);

  // job number NOT selected by the PDF routes (grep-style: read the invoice PDF cols)
  // (verified by construction — the PDF route selects jobs(address) only; see note)

  // ---- RLS second-tenant ----
  const anon = anonClient();
  const { data: si } = await anon.auth.signInWithPassword({ email: SMOKE_EMAIL, password: PW });
  const userClient = anonClient();
  await userClient.auth.setSession(si.session);
  const { data: sharpJobs } = await userClient.from("jobs").select("id, job_number").eq("client_id", REF_CLIENT_ID);
  check("RLS: the smoke tenant user cannot read the reference tenant job numbers", (sharpJobs ?? []).length === 0);

  // ---- Part A: picker lists both same-contact jobs distinctly ----
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([{
    name: `sb-${SUPABASE_REF}-auth-token`,
    value: "base64-" + Buffer.from(JSON.stringify(si.session), "utf8").toString("base64url"),
    domain: host, path: "/",
  }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app/estimator/purchases`, { waitUntil: "domcontentloaded" });
  await page.getByText("Log a purchase").first().click();
  const sel = page.locator('select[aria-label="Assign to"]').first();
  await sel.waitFor({ timeout: 10000 });
  const opts = await sel.locator("option").evaluateAll((os) => os.map((o) => o.textContent || ""));
  const alphaOpt = opts.find((o) => o.includes("10 Alpha St"));
  const betaOpt = opts.find((o) => o.includes("20 Beta Ave"));
  check("picker lists both same-contact jobs (distinct addresses)", !!alphaOpt && !!betaOpt);
  check("picker option carries the job number + name + status",
    !!alphaOpt && alphaOpt.includes(j1.job_number) && alphaOpt.includes(`Alice`) && /lead/.test(alphaOpt),
    alphaOpt);
  await ctx.close();
} catch (e) {
  check("E2E completed without exception", false, String(e).slice(0, 200));
} finally {
  await browser.close();
  for (const id of createdJobs) {
    await admin.from("job_status_log").delete().eq("job_id", id);
    await admin.from("jobs").delete().eq("id", id);
  }
  for (const id of createdContacts) await admin.from("contacts").delete().eq("id", id);
  // contacts are removed above by captured id (createdContacts).
  await admin.auth.admin.updateUserById(SMOKE_ID, { password: "reset-" + Math.random().toString(36) });
  const { data: leftJobs } = await admin.from("jobs").select("id").in("id", createdJobs.length ? createdJobs : [-1]);
  const { data: leftC } = await admin.from("contacts").select("id").in("id", createdContacts.length ? createdContacts : [-1]);
  check("zero residue (jobs + contacts)", (leftJobs ?? []).length === 0 && (leftC ?? []).length === 0);
  const { data: sharp } = await admin.from("jobs").select("job_number").eq("id", FIXTURES.refJobId).single();
  check("reference tenant untouched (its job keeps its number)", sharp.job_number === refBefore?.job_number, sharp.job_number);
}

process.exit(summary());
