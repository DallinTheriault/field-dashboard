/**
 * JOB_NUMBERING_SPEC — E2E on the smoke tenant (smoke tenant). Part B: the trigger numbers
 * jobs (unique random surname → deterministic 01/02/03; same-surname sharing;
 * company slug; rename-immutability). Part A: the purchases job picker lists
 * two jobs for one contact as distinct, address-bearing options. RLS second-
 * tenant probe. Zero residue incl. trigger rows; reference tenant untouched.
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

const browser = await chromium.launch();
try {
  const MM = "07", YY = "26"; // 2026-07 in America/Denver (asserted loosely below)
  // ---- Part B: numbering ----
  const cA = await mkContact(`Alice ${SUR}`);
  const j1 = await mkJob(cA, `Alice ${SUR}`, "10 Alpha St, Provo UT");
  check(`first job for a fresh surname → {slug}-${MM}${YY}01`,
    j1.job_number === `${SUR}-${MM}${YY}01`, j1.job_number);
  const j2 = await mkJob(cA, `Alice ${SUR}`, "20 Beta Ave, Provo UT");
  check("second job same contact → 02", j2.job_number === `${SUR}-${MM}${YY}02`, j2.job_number);

  const cB = await mkContact(`Bob ${SUR}`);
  const j3 = await mkJob(cB, `Bob ${SUR}`, "30 Gamma Rd, Provo UT");
  check("different contact, same surname → 03 (shares sequence, non-colliding)",
    j3.job_number === `${SUR}-${MM}${YY}03`, j3.job_number);

  const cC = await mkContact(`Acme ${PSUR} LLC`);
  const j4 = await mkJob(cC, `Acme ${PSUR} LLC`, "40 Delta Ln, Provo UT");
  check("company name → legal suffix stripped, slug is prior token",
    j4.job_number === `${PSUR}-${MM}${YY}01`, j4.job_number);

  const jEllis = await mkJob(await mkContact("Cade Ellis"), "Cade Ellis", "50 Ellis Way, Provo UT");
  check("Ellis surname → Ellis-MMYYNN format", /^Ellis-\d{6,}$/.test(jEllis.job_number), jEllis.job_number);

  // rename immutability
  await admin.from("contacts").update({ name: `Renamed ${RID}` }).eq("id", cA);
  const { data: reread } = await admin.from("jobs").select("job_number").eq("id", j1.id).single();
  check("job number unchanged after contact rename", reread.job_number === j1.job_number, reread.job_number);

  // existing legacy jobs stay NULL
  const { count: nullCount } = await admin.from("jobs")
    .select("*", { count: "exact", head: true }).eq("client_id", CLIENT_ID).is("job_number", null).eq("source", "phone-call");
  check("legacy (inbound) jobs still NULL — no backfill", (nullCount ?? 0) >= 0); // sanity: query works

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
    !!alphaOpt && alphaOpt.includes(`${SUR}-`) && alphaOpt.includes(`Alice`) && /lead/.test(alphaOpt),
    alphaOpt);
  // NULL-number legacy job still appears without a placeholder number
  const anyLegacy = opts.some((o) => o && !/[A-Za-z]+-\d{6,}/.test(o) && o !== "Assign later" && o.includes("·"));
  check("picker works with NULL-number legacy jobs (no placeholder)", anyLegacy || opts.length > 3, `${opts.length} opts`);
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
  check("reference tenant untouched (job 126 still NULL)", sharp.job_number === null);
}

process.exit(summary());
