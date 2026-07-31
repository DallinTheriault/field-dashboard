/**
 * Business/job-expense handoff — E2E on the smoke tenant (smoke tenant). Drives the real
 * job-detail capture card as an OWNER (smoke user) and a TEMP MEMBER, proving:
 * member manual capture works, the member dropdown offers no job_extra, a
 * TAMPERED job_extra request is rejected server-side, member scan is authorized
 * (past the old owner/manager gate) while entitlement stays enforced, and every
 * item is a plain single-ledger expenses row. Zero residue incl. meter rows +
 * temp user; reference tenant untouched. Usage: node job-expense-e2e.mjs [baseUrl]
 */
import {
  admin, anonClient, SUPABASE_REF, baseUrlFrom,
  CLIENT_ID, SMOKE_ID, SMOKE_EMAIL, FIXTURES, loadPlaywright, TEMP_EMAIL_DOMAIN,
} from "./_config.mjs";
const { chromium } = loadPlaywright();
import { createHarness } from "./_harness.mjs";

const BASE = baseUrlFrom(process.argv[2]);
const host = new URL(BASE).hostname;

const { check, note, summary, capture } = createHarness("job-expense-e2e");
const cookieFor = (session) => ({
  name: `sb-${SUPABASE_REF}-auth-token`,
  value: "base64-" + Buffer.from(JSON.stringify(session), "utf8").toString("base64url"),
  domain: host, path: "/",
});

// ---- seed: a smoke-tenant job + a temp member --------------------------------
const OWNER_PW = "own-" + Math.random().toString(36).slice(2, 12) + "-A1!";
await admin.auth.admin.updateUserById(SMOKE_ID, { password: OWNER_PW });
const memberEmail = `member-e2e-${Math.random().toString(36).slice(2, 8)}@${TEMP_EMAIL_DOMAIN}`;
const MEMBER_PW = "mbr-" + Math.random().toString(36).slice(2, 12) + "-B2!";
const { data: mk } = await admin.auth.admin.createUser({ email: memberEmail, password: MEMBER_PW, email_confirm: true });
const memberId = capture("auth.users", mk.user.id);
await admin.from("client_users").insert({ client_id: CLIENT_ID, auth_user_id: memberId, role: "member" });

const { data: job } = await admin.from("jobs").insert({
  client_id: CLIENT_ID, name: "JOBEXP e2e", phone: "+18015550261", address: "3 Expense Way", status: "in_progress", source: "manual",
}).select("id, contact_id").single();
capture("jobs", job.id);
capture("contacts", job.contact_id);

const createdPurchaseIds = [];
async function fullClean() {
  await admin.from("receipt_scans").delete().in("purchase_id", createdPurchaseIds.length ? createdPurchaseIds : [-1]);
  await admin.from("job_status_log").delete().eq("job_id", job.id);
  await admin.from("expenses").delete().eq("job_id", job.id);
  await admin.from("purchases").delete().in("id", createdPurchaseIds.length ? createdPurchaseIds : [-1]);
  await admin.from("jobs").delete().eq("id", job.id);
  if (job?.contact_id) await admin.from("contacts").delete().eq("id", job.contact_id);
  await admin.from("client_users").delete().eq("auth_user_id", memberId);
  await admin.auth.admin.deleteUser(memberId);
  await admin.from("Clients").update({ feature_receipt_ai_enabled: false }).eq("id", CLIENT_ID);
  await admin.auth.admin.updateUserById(SMOKE_ID, { password: "reset-" + Math.random().toString(36) });
}

const browser = await chromium.launch();
try {
  const anon = anonClient();

  // ================= OWNER =================
  const { data: osi } = await anon.auth.signInWithPassword({ email: SMOKE_EMAIL, password: OWNER_PW });
  const oCtx = await browser.newContext();
  await oCtx.addCookies([cookieFor(osi.session)]);
  const oPage = await oCtx.newPage();
  await oPage.goto(`${BASE}/app/jobs/${job.id}`, { waitUntil: "domcontentloaded" });

  const oCap = await oPage.getByText("Job expenses").waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
  check("owner: capture card present", oCap);

  // owner sees job_extra in the assignment options
  const ownerOpts = await oPage.locator('select[aria-label="Assignment"]').first().locator("option").evaluateAll(
    (os) => os.map((o) => o.value),
  );
  check("owner: assignment options include job_extra", ownerOpts.includes("job_extra"), ownerOpts.join(","));

  // owner logs a job_extra manual expense
  await oPage.getByPlaceholder("Item (e.g. Paint, 2 gal)").fill("Owner extra part");
  await oPage.locator('input[placeholder="0.00"]').first().fill("40");
  await oPage.locator('select[aria-label="Assignment"]').first().selectOption("job_extra");
  await oPage.getByRole("button", { name: "Log expense" }).click();
  await oPage.waitForTimeout(1500);
  const { data: oExtra } = await admin.from("expenses").select("assignment, job_id, client_id")
    .eq("job_id", job.id).eq("description", "Owner extra part").maybeSingle();
  check("owner: job_extra expense created (single ledger row)",
    oExtra?.assignment === "job_extra" && oExtra?.job_id === job.id && oExtra?.client_id === CLIENT_ID);
  await oCtx.close();

  // ================= MEMBER =================
  const { data: msi } = await anon.auth.signInWithPassword({ email: memberEmail, password: MEMBER_PW });
  const mCtx = await browser.newContext();
  await mCtx.addCookies([cookieFor(msi.session)]);
  const mPage = await mCtx.newPage();
  await mPage.goto(`${BASE}/app/jobs/${job.id}`, { waitUntil: "domcontentloaded" });

  const mCap = await mPage.getByText("Job expenses").waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
  check("member: capture card present", mCap);

  // member dropdown offers only the allowed set (no job_extra)
  const memberOpts = await mPage.locator('select[aria-label="Assignment"]').first().locator("option").evaluateAll(
    (os) => os.map((o) => o.value),
  );
  check("member: assignment options = allowed set, no job_extra",
    !memberOpts.includes("job_extra") && memberOpts.includes("job_in_bid") && memberOpts.includes("job_internal") && memberOpts.includes("stock"),
    memberOpts.join(","));

  // member logs a job_in_bid manual expense
  await mPage.getByPlaceholder("Item (e.g. Paint, 2 gal)").fill("Member paint");
  await mPage.locator('input[placeholder="0.00"]').first().fill("25");
  await mPage.locator('select[aria-label="Assignment"]').first().selectOption("job_in_bid");
  await mPage.getByRole("button", { name: "Log expense" }).click();
  await mPage.waitForTimeout(1500);
  const { data: mItem } = await admin.from("expenses").select("assignment, job_id, client_id, amount")
    .eq("job_id", job.id).eq("description", "Member paint").maybeSingle();
  check("member: job_in_bid capture works (single ledger row)",
    mItem?.assignment === "job_in_bid" && mItem?.job_id === job.id && mItem?.client_id === CLIENT_ID && Number(mItem?.amount) === 25);

  // TAMPER: inject a job_extra option, select it, submit → server must reject
  await mPage.getByPlaceholder("Item (e.g. Paint, 2 gal)").fill("Member sneaky extra");
  await mPage.locator('input[placeholder="0.00"]').first().fill("99");
  await mPage.evaluate(() => {
    const sel = document.querySelector('select[aria-label="Assignment"]');
    const o = document.createElement("option");
    o.value = "job_extra"; o.text = "tampered";
    sel.appendChild(o); sel.value = "job_extra";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await mPage.getByRole("button", { name: "Log expense" }).click();
  await mPage.waitForTimeout(1500);
  const rejected = await mPage.getByText(/can't set that assignment/i).isVisible().catch(() => false);
  check("member: tampered job_extra rejected server-side (form error)", rejected);
  const { data: sneaky } = await admin.from("expenses").select("id")
    .eq("job_id", job.id).eq("description", "Member sneaky extra");
  check("member: tampered job_extra wrote NO row", (sneaky ?? []).length === 0);

  // ---- member scan authorization (Q1): route accepts member, entitlement enforced ----
  // flag ON: a photo-less purchase → 400 (past the old owner/manager 403 gate)
  await admin.from("Clients").update({ feature_receipt_ai_enabled: true }).eq("id", CLIENT_ID);
  const { data: pOn } = await admin.from("purchases").insert({
    client_id: CLIENT_ID, vendor: "scan-probe", purchase_date: "2026-07-22", source: "scan",
  }).select("id").single();
  createdPurchaseIds.push(capture("purchases", pOn.id));
  const rOn = await mCtx.request.post(`${BASE}/api/estimator/purchases/${pOn.id}/scan`);
  check("member scan: entitled tenant authorizes member (not 403)", rOn.status() !== 403, `status ${rOn.status()}`);
  check("member scan: no-photos yields 400 (past auth + entitlement)", rOn.status() === 400, `status ${rOn.status()}`);

  // flag OFF: entitlement still enforced → 403 + a rejected meter row
  await admin.from("Clients").update({ feature_receipt_ai_enabled: false }).eq("id", CLIENT_ID);
  const rOff = await mCtx.request.post(`${BASE}/api/estimator/purchases/${pOn.id}/scan`);
  check("member scan: entitlement off → 403", rOff.status() === 403, `status ${rOff.status()}`);
  await new Promise((r) => setTimeout(r, 400));
  const { data: meter } = await admin.from("receipt_scans").select("status").eq("purchase_id", pOn.id);
  check("member scan: 403 still writes a rejected meter row (behavior preserved)",
    (meter ?? []).some((m) => m.status === "rejected"));

  await mCtx.close();

  // ---- single ledger: member + owner items are plain expenses rows ----
  const { data: allItems } = await admin.from("expenses").select("id, assignment").eq("job_id", job.id);
  check("single ledger: both captures are expenses rows on the job",
    (allItems ?? []).length === 2 && (allItems ?? []).some((i) => i.assignment === "job_in_bid") && (allItems ?? []).some((i) => i.assignment === "job_extra"));
} catch (e) {
  check("E2E completed without exception", false, String(e).slice(0, 200));
} finally {
  await browser.close();
  await fullClean();
  const { data: leftJob } = await admin.from("jobs").select("id").eq("id", job.id);
  const { data: leftUser } = await admin.from("client_users").select("auth_user_id").eq("auth_user_id", memberId);
  const { data: flag } = await admin.from("Clients").select("feature_receipt_ai_enabled").eq("id", CLIENT_ID).single();
  check("zero residue + flag restored off",
    (leftJob ?? []).length === 0 && (leftUser ?? []).length === 0 && flag.feature_receipt_ai_enabled === false);
  const { data: refJob } = await admin.from("jobs").select("id").eq("id", FIXTURES.refJobId).maybeSingle();
  check("reference tenant untouched (reference job present)", !!refJob);
}

process.exit(summary());
