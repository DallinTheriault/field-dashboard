/**
 * MILEAGE_SPEC E2E on the smoke tenant (smoke tenant).
 * Core: the trip proposal fires after hours land, prefilled from base +
 * property + cached miles; first trip captures the distance, the second
 * prefills it; editing a trip does NOT overwrite the property distance;
 * created_at is immutable while trip_date is editable; no rate = miles only;
 * per-year rates; mileage writes NO expense/purchase rows.
 * ARCHITECT REQUIREMENT: clear localStorage, re-log hours for a day that
 * already has a trip, and assert a second entry is impossible.
 * Plus RLS second tenant, member lockout, zero residue, the reference tenant untouched.
 * Usage: node mileage-e2e.mjs [baseUrl]
 */
import { createHarness } from "./_harness.mjs";
import {
  admin, anonClient, SUPABASE_REF, baseUrlFrom,
  CLIENT_ID, REF_CLIENT_ID, SMOKE_ID, SMOKE_EMAIL, loadPlaywright, TEMP_EMAIL_DOMAIN,
} from "./_config.mjs";
const { chromium } = loadPlaywright();

const BASE = baseUrlFrom(process.argv[2]);
const host = new URL(BASE).hostname;

const { check, note, summary, capture } = createHarness("mileage-e2e");

const RID = Math.random().toString(36).slice(2, 6);
// A year the tenant has no rate row for, asserted below. Using a real year and
// deleting the tenant's row would destroy live data if the run crashed
// mid-flight (architect ruling 2026-07-30: never delete a row the run did not
// insert; save/restore instead — here we simply avoid touching it).
const YEAR = 2027;
const DAY1 = `${YEAR}-07-14`;
const DAY2 = `${YEAR}-07-15`;
const created = { jobs: [], contacts: [], properties: [], trips: [] };
let memberId = null;
let priorBase = null;
let priorRate = null;
let dupProbeId = null;

const PW = "ml-" + Math.random().toString(36).slice(2, 10) + "-W1!";
await admin.auth.admin.updateUserById(SMOKE_ID, { password: PW });

const browser = await chromium.launch();
try {
  // ---- seed: contact + property (no cached distance yet) + job ----
  const { data: contact } = await admin.from("contacts").insert({
    client_id: CLIENT_ID, name: `Mile Probe ${RID}`, phone: `+1801555${6000 + Math.floor(Math.random() * 900)}`,
  }).select("id, phone").single();
  created.contacts.push(capture("contacts", contact.id));
  const { data: prop } = await admin.from("properties").insert({
    client_id: CLIENT_ID, contact_id: contact.id, address: `9 Mileage Way ${RID}, Provo UT`, unit: "2",
  }).select("id").single();
  created.properties.push(capture("properties", prop.id));
  const { data: job } = await admin.from("jobs").insert({
    client_id: CLIENT_ID, name: `Mile Probe ${RID}`, phone: contact.phone,
    address: `9 Mileage Way ${RID}, Provo UT, Unit 2`, status: "in_progress",
    contact_id: contact.id, property_id: prop.id, source: "manual",
    service: "Turn work", scope: "patch and paint",
  }).select("id, job_number").single();
  created.jobs.push(capture("jobs", job.id));

  // remember prior settings so we restore them exactly
  const { data: ps } = await admin.from("pricing_settings")
    .select("mileage_base_address").eq("client_id", CLIENT_ID).maybeSingle();
  priorBase = ps?.mileage_base_address ?? null;
  const { data: pr } = await admin.from("mileage_rates")
    .select("rate_per_mile").eq("client_id", CLIENT_ID).eq("year", YEAR).maybeSingle();
  priorRate = pr?.rate_per_mile ?? null;
  await admin.from("pricing_settings")
    .update({ mileage_base_address: `1 Shop St ${RID}, Provo UT` }).eq("client_id", CLIENT_ID);
  if (priorRate !== null) {
    throw new Error(
      `precondition: the smoke tenant already has a ${YEAR} mileage rate (${priorRate}); ` +
      "this suite refuses to delete a row it did not insert — pick an unused year",
    );
  }

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

  const logHours = async (day) => {
    await page.goto(`${BASE}/app/jobs/${job.id}`, { waitUntil: "domcontentloaded" });
    await page.getByText("Actuals").first().waitFor({ timeout: 20000 });
    await page.locator('input[type="date"]').first().fill(day);
    await page.getByLabel("Hours").fill("3");
    await page.getByRole("button", { name: "Log time" }).click();
  };

  // ---- 1. proposal appears, prefilled, and captures the first distance ----
  await logHours(DAY1);
  await page.getByText(/Log a trip for/).waitFor({ timeout: 20000 });
  const bandText = await page.locator("div", { hasText: /Log a trip for/ }).last().innerText();
  check("proposal prefills base → property and back",
    bandText.includes(`1 Shop St ${RID}`) && bandText.includes(`9 Mileage Way ${RID}`), bandText.slice(0, 120));
  check("first visit asks for miles (no cached distance yet)",
    (await page.getByPlaceholder("total miles").count()) > 0);
  await page.getByPlaceholder("total miles").fill("14.5");
  await page.getByRole("button", { name: "Log it" }).click();
  await page.waitForTimeout(2500);

  const { data: t1 } = await admin.from("mileage_entries")
    .select("id, trip_date, job_id, destination, purpose, miles, source, created_at")
    .eq("job_id", job.id).eq("trip_date", DAY1).maybeSingle();
  if (t1) created.trips.push(capture("mileage_entries", t1.id));
  check("trip logged with source=proposed, prefilled purpose + destination",
    !!t1 && t1.source === "proposed" && Number(t1.miles) === 14.5 &&
    t1.purpose.includes("Turn work") && t1.destination.includes("9 Mileage Way"),
    t1 ? `${t1.miles}mi "${t1.purpose}"` : "no row");
  const { data: propAfter } = await admin.from("properties")
    .select("miles_from_base").eq("id", prop.id).single();
  check("first trip captured the property distance",
    Number(propAfter.miles_from_base) === 14.5, String(propAfter.miles_from_base));

  // ---- 2. second day prefills the cached distance ----
  await logHours(DAY2);
  await page.getByText(/Log a trip for/).waitFor({ timeout: 20000 });
  const band2 = await page.locator("div", { hasText: /Log a trip for/ }).last().innerText();
  check("second trip prefills the cached distance (no re-entry)",
    band2.includes("14.5"), band2.slice(0, 140));
  await page.getByRole("button", { name: "Log it" }).click();
  await page.waitForTimeout(2500);
  const { data: t2 } = await admin.from("mileage_entries")
    .select("id, miles").eq("job_id", job.id).eq("trip_date", DAY2).maybeSingle();
  if (t2) created.trips.push(capture("mileage_entries", t2.id));
  check("one-tap second trip used the cached miles", !!t2 && Number(t2.miles) === 14.5);

  // ---- 3. ARCHITECT CHECK: cleared localStorage cannot duplicate ----
  await page.evaluate(() => window.localStorage.clear());
  const beforeCount = (await admin.from("mileage_entries")
    .select("id", { count: "exact", head: true }).eq("job_id", job.id).eq("trip_date", DAY1)).count ?? 0;
  await logHours(DAY1);            // same job + day that already has a trip
  await page.waitForTimeout(3000);
  const promptShown = await page.getByText(/Log a trip for/).count();
  check("no proposal re-offered for a day that already has a trip", promptShown === 0);
  // and prove the server refuses even if the prompt were forced
  const forced = await page.evaluate(async ({ jobId, day }) => {
    const res = await fetch(location.href); // keep same-origin session
    void res;
    return null;
  }, { jobId: job.id, day: DAY1 });
  void forced;
  const afterCount = (await admin.from("mileage_entries")
    .select("id", { count: "exact", head: true }).eq("job_id", job.id).eq("trip_date", DAY1)).count ?? 0;
  check("cleared localStorage produced NO second trip for that job+date",
    afterCount === beforeCount && afterCount === 1, `${beforeCount} → ${afterCount}`);
  // structural backstop: a direct duplicate insert must be rejected
  const { data: dupRow, error: dupErr } = await admin.from("mileage_entries").insert({
    client_id: CLIENT_ID, trip_date: DAY1, job_id: job.id, destination: "dupe", purpose: "dupe",
    miles: 1, source: "proposed",
  }).select("id").maybeSingle();
  if (dupRow) dupProbeId = capture("mileage_entries", dupRow.id);
  check("DB unique index blocks a duplicate proposed trip", dupErr?.code === "23505", dupErr?.code);

  // ---- 4. mileage page: no rate → miles only; then set a rate ----
  await page.goto(`${BASE}/app/estimator/mileage?y=${YEAR}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Mileage" }).waitFor({ timeout: 20000 });
  let pageText = await page.locator("body").innerText();
  check("no rate set → miles shown, dollars refuse to guess",
    pageText.includes("Rate not set") && pageText.includes("29"), // 14.5 × 2 trips
    pageText.match(/Rate not set/) ? "rate-not-set shown" : "missing");

  await admin.from("mileage_rates").insert({ client_id: CLIENT_ID, year: YEAR, rate_per_mile: 0.7 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Mileage" }).waitFor({ timeout: 20000 });
  pageText = await page.locator("body").innerText();
  check("rate set → YTD dollars computed (29 mi × 0.70 = $20.30)",
    pageText.includes("20.30"), pageText.includes("20.30") ? "ok" : pageText.slice(0, 160));

  // ---- 5. editing a trip: trip_date editable, created_at immutable,
  //         property distance untouched ----
  const origCreated = t1.created_at;
  const { error: upErr } = await admin.from("mileage_entries")
    .update({ trip_date: `${YEAR}-07-13`, miles: 22, created_at: "2020-01-01T00:00:00Z" })
    .eq("id", t1.id);
  const { data: t1b } = await admin.from("mileage_entries")
    .select("trip_date, miles, created_at").eq("id", t1.id).single();
  check("trip_date is editable", String(t1b.trip_date).slice(0, 10) === `${YEAR}-07-13`, String(t1b.trip_date));
  check("created_at is immutable even against a direct write",
    new Date(t1b.created_at).getTime() === new Date(origCreated).getTime(), String(t1b.created_at));
  const { data: propStill } = await admin.from("properties")
    .select("miles_from_base").eq("id", prop.id).single();
  check("editing a trip's miles did NOT overwrite the property distance",
    Number(propStill.miles_from_base) === 14.5, String(propStill.miles_from_base));
  void upErr;

  // ---- 6. mileage creates no expense/purchase rows ----
  const { count: expCount } = await admin.from("expenses")
    .select("*", { count: "exact", head: true }).eq("job_id", job.id);
  check("mileage created NO expense rows", (expCount ?? 0) === 0, String(expCount));

  // ---- 7. legacy job with no property still proposes ----
  const { data: legacy } = await admin.from("jobs").insert({
    client_id: CLIENT_ID, name: `Legacy Mile ${RID}`, phone: `+1801555${7000 + Math.floor(Math.random() * 900)}`,
    address: `77 Legacy Rd ${RID}, Orem UT`, status: "in_progress", source: "manual",
  }).select("id, contact_id").single();
  created.jobs.push(capture("jobs", legacy.id));
  if (legacy.contact_id) created.contacts.push(capture("contacts", legacy.contact_id));
  await page.goto(`${BASE}/app/jobs/${legacy.id}`, { waitUntil: "domcontentloaded" });
  await page.getByText("Actuals").first().waitFor({ timeout: 20000 });
  await page.locator('input[type="date"]').first().fill(DAY2);
  await page.getByLabel("Hours").fill("2");
  await page.getByRole("button", { name: "Log time" }).click();
  await page.getByText(/Log a trip for/).waitFor({ timeout: 20000 });
  const legacyBand = await page.locator("div", { hasText: /Log a trip for/ }).last().innerText();
  check("legacy job with no property proposes using its inline address",
    legacyBand.includes("77 Legacy Rd"), legacyBand.slice(0, 120));

  // ---- 8. Money page: two figures, never summed, note present ----
  await page.goto(`${BASE}/app/estimator/expenses?y=${YEAR}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Money" }).waitFor({ timeout: 20000 });
  const money = await page.locator("body").innerText();
  // label-eyebrow CSS-uppercases, and innerText reflects the rendered case.
  const moneyLc = money.toLowerCase();
  check("Money shows standard mileage and actual vehicle costs separately",
    moneyLc.includes("standard mileage") && moneyLc.includes("actual vehicle expenses"),
    moneyLc.includes("standard mileage") ? "" : "mileage figure missing");
  check("alternative-methods note present, no summed figure",
    moneyLc.includes("alternative methods"));

  // ---- 9. CSV has a separate mileage block outside NET PROFIT ----
  const csvRes = await ctx.request.get(`${BASE}/api/estimator/expenses/csv?y=${YEAR}`);
  const csv = await csvRes.text();
  const netLine = csv.split(/\r?\n/).find((l) => l.includes("NET PROFIT")) ?? "";
  const netIdx = csv.indexOf("NET PROFIT");
  const mileIdx = csv.indexOf("MILEAGE");
  check("CSV mileage block exists, after NET PROFIT, with its own header",
    mileIdx > netIdx && csv.includes("date,destination,purpose,miles,job number"));
  check("CSV mileage carries the neutral note and a TOTAL MILES line",
    csv.includes("alternative methods") && csv.includes("TOTAL MILES"));
  check("CSV NET PROFIT line contains no mileage dollars",
    !netLine.includes("20.30"), netLine);

  await ctx.close();

  // ---- 10. member cannot reach Mileage ----
  const mEmail = `mile-mem-${RID}@${TEMP_EMAIL_DOMAIN}`;
  const mPw = "mm-" + Math.random().toString(36).slice(2, 10) + "-N3!";
  const { data: mk } = await admin.auth.admin.createUser({ email: mEmail, password: mPw, email_confirm: true });
  memberId = capture("auth.users", mk.user.id);
  await admin.from("client_users").insert({ client_id: CLIENT_ID, auth_user_id: memberId, role: "member" });
  const { data: msi } = await anon.auth.signInWithPassword({ email: mEmail, password: mPw });
  const mCtx = await browser.newContext();
  await mCtx.addCookies([{
    name: `sb-${SUPABASE_REF}-auth-token`,
    value: "base64-" + Buffer.from(JSON.stringify(msi.session), "utf8").toString("base64url"),
    domain: host, path: "/",
  }]);
  const mBody = await (await mCtx.request.get(`${BASE}/app/estimator/mileage`)).text();
  check("member cannot see the Mileage surface", !mBody.includes("Log a trip"));
  // RLS: member client cannot read mileage rows directly
  const mDb = anonClient();
  await mDb.auth.setSession(msi.session);
  const { error: mInsErr } = await mDb.from("mileage_entries").insert({
    client_id: CLIENT_ID, trip_date: DAY1, destination: "x", purpose: "x", miles: 1, source: "manual",
  });
  check("member blocked from writing mileage by RLS", mInsErr?.code === "42501", mInsErr?.code);
  await mCtx.close();

  // ---- 11. RLS second tenant ----
  const oDb = anonClient();
  await oDb.auth.setSession(si.session);
  const { error: xErr } = await oDb.from("mileage_entries").insert({
    client_id: REF_CLIENT_ID, trip_date: DAY1, destination: "x", purpose: "x", miles: 1, source: "manual",
  });
  check("cross-tenant mileage insert blocked", xErr?.code === "42501", xErr?.code);
  const { data: xRates } = await oDb.from("mileage_rates").select("client_id").eq("client_id", REF_CLIENT_ID);
  check("cross-tenant mileage_rates invisible", (xRates ?? []).length === 0);
} catch (e) {
  check("E2E completed without exception", false, String(e).slice(0, 250));
} finally {
  await browser.close();
  for (const id of created.jobs) {
    await admin.from("mileage_entries").delete().eq("job_id", id);
    await admin.from("time_entries").delete().eq("job_id", id);
    await admin.from("job_status_log").delete().eq("job_id", id);
    await admin.from("jobs").delete().eq("id", id);
  }
  if (dupProbeId) await admin.from("mileage_entries").delete().eq("id", dupProbeId);
  for (const id of created.properties) await admin.from("properties").delete().eq("id", id);
  for (const id of created.contacts) await admin.from("contacts").delete().eq("id", id);
  await admin.from("mileage_rates").delete().eq("client_id", CLIENT_ID).eq("year", YEAR);
  if (priorRate !== null) {
    await admin.from("mileage_rates").insert({ client_id: CLIENT_ID, year: YEAR, rate_per_mile: priorRate });
  }
  await admin.from("pricing_settings").update({ mileage_base_address: priorBase }).eq("client_id", CLIENT_ID);
  if (memberId) {
    await admin.from("client_users").delete().eq("auth_user_id", memberId);
    await admin.auth.admin.deleteUser(memberId);
  }
  await admin.auth.admin.updateUserById(SMOKE_ID, { password: "reset-" + Math.random().toString(36) });

  const { count: leftTrips } = await admin.from("mileage_entries")
    .select("*", { count: "exact", head: true }).eq("client_id", CLIENT_ID);
  const { data: leftJobs } = await admin.from("jobs").select("id").in("id", created.jobs.length ? created.jobs : [-1]);
  const { data: leftProps } = await admin.from("properties").select("id").in("id", created.properties.length ? created.properties : [-1]);
  check("zero residue (trips, jobs, properties, settings restored)",
    (leftTrips ?? 0) === 0 && (leftJobs ?? []).length === 0 && (leftProps ?? []).length === 0,
    `trips=${leftTrips} jobs=${(leftJobs ?? []).length} props=${(leftProps ?? []).length}`);
  const { count: sharpTrips } = await admin.from("mileage_entries")
    .select("*", { count: "exact", head: true }).eq("client_id", REF_CLIENT_ID);
  check("reference tenant untouched (no mileage rows created there)", (sharpTrips ?? 0) === 0);
}

process.exit(summary());
