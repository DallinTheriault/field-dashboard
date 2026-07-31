/**
 * RECEIPTS_VIEW_SPEC E2E on the smoke tenant (smoke tenant).
 * Part A: duplicate warning fires, merge appends photos to the target, deletes
 *   the placeholder, KEEPS every storage object (each merged photo must fetch
 *   200 through the viewer route — architect requirement a), preserves the
 *   receipt_scans meter row, never rewrites the target header; a different
 *   total is NOT flagged; manual save runs the same check.
 * Part B: Receipts list shows every purchase incl. photo-less manual entries,
 *   grid toggle, detail opens full-size; ONE batched signed-URL pass (counted
 *   in the PERF_TRACE dev log); member blocked; RLS second tenant.
 * Zero residue incl. meter rows + storage objects. Reference tenant untouched.
 * Usage: node receipts-e2e.mjs [baseUrl] [devLogPath]
 */
import { readFileSync } from "node:fs";
import {
  admin, anonClient, SUPABASE_REF, baseUrlFrom,
  CLIENT_ID, REF_CLIENT_ID, SMOKE_ID, SMOKE_EMAIL, loadPlaywright, TEMP_EMAIL_DOMAIN,
} from "./_config.mjs";
const { chromium } = loadPlaywright();

const BASE = baseUrlFrom(process.argv[2]);
const DEVLOG = process.argv[3] ?? null;
const host = new URL(BASE).hostname;

import { createHarness } from "./_harness.mjs";
const { check, notRun, summary, capture } = createHarness("receipts-e2e");

/**
 * the reference tenant fingerprint, taken before the run and compared after. Asserting a
 * hardcoded count ("its purchase intact") fails the moment the owner scans a
 * receipt — a probe that goes red when a real business does ordinary work
 * trains people to ignore red (architect ruling 2026-07-31).
 */
async function refTenantSnapshot() {
  const { data: p } = await admin.from("purchases")
    .select("id, vendor").eq("client_id", REF_CLIENT_ID).order("id");
  return JSON.stringify((p ?? []).map((r) => `${r.id}:${r.vendor}`));
}
const refTenantBefore = await refTenantSnapshot();

// 1x1 JPEG
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);

const VENDOR = "The Home Depot";
const DATE = "2026-07-19";
const TOTAL = 84.31;
const objects = [];
const purchases = [];
let memberId = null;

async function putObj(name) {
  const path = `${CLIENT_ID}/${name}`;
  await admin.storage.from("receipts").upload(path, JPEG, { contentType: "image/jpeg", upsert: true });
  objects.push(path);
  return path;
}
async function mkPurchase(vendor, date, total, paths) {
  const { data, error } = await admin.from("purchases").insert({
    client_id: CLIENT_ID, vendor, purchase_date: date, total, source: "scan", receipt_paths: paths,
  }).select("id").single();
  if (error || !data) throw new Error("mkPurchase failed: " + JSON.stringify(error));
  purchases.push(capture("purchases", data.id));
  return data.id;
}

const PW = "rc-" + Math.random().toString(36).slice(2, 10) + "-V1!";
await admin.auth.admin.updateUserById(SMOKE_ID, { password: PW });

const browser = await chromium.launch();
try {
  const RID = Math.random().toString(36).slice(2, 8);
  // target: same vendor/date/total, HAS a photo, ZERO items (so the
  // "…and add these items" path is offered)
  const tPath = await putObj(`rcpt-target-${RID}.jpg`);
  const targetId = await mkPurchase(VENDOR, DATE, TOTAL, [tPath]);
  // placeholder: the "second scan of the same receipt"
  const pPath1 = await putObj(`rcpt-dupe-${RID}-a.jpg`);
  const pPath2 = await putObj(`rcpt-dupe-${RID}-b.jpg`);
  const placeholderId = await mkPurchase("HOME DEPOT #4412", DATE, TOTAL, [pPath1, pPath2]);
  // a meter row on the placeholder — must survive the merge
  await admin.from("receipt_scans").insert({
    client_id: CLIENT_ID, purchase_id: placeholderId, model: "claude-haiku-4-5",
    input_tokens: 100, output_tokens: 20, status: "ok",
  });
  // a decoy: same vendor + day, DIFFERENT total → must never be flagged
  const decoyId = await mkPurchase(VENDOR, DATE, 12.99, []);
  // a photo-less manual entry → must still appear in the Receipts list
  const manualId = await mkPurchase(`Manual Corner Store ${RID}`, DATE, 5.5, []);
  await admin.from("purchases").update({ source: "manual" }).eq("id", manualId);

  const anon = anonClient();
  const { data: si, error: siErr } = await anon.auth.signInWithPassword({ email: SMOKE_EMAIL, password: PW });
  if (siErr || !si?.session) throw new Error("owner sign-in failed: " + JSON.stringify(siErr));
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([{
    name: `sb-${SUPABASE_REF}-auth-token`,
    value: "base64-" + Buffer.from(JSON.stringify(si.session), "utf8").toString("base64url"),
    domain: host, path: "/",
  }]);
  const page = await ctx.newPage();

  // ---------- Part B: Receipts list ----------
  const traceBefore = DEVLOG ? countSignCalls(DEVLOG) : null;
  await page.goto(`${BASE}/app/estimator/purchases`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Receipts", exact: true }).waitFor({ timeout: 15000 });
  const listText = await page.locator("section", { has: page.getByRole("heading", { name: "Receipts", exact: true }) }).innerText();
  check("receipts list includes the photo-less manual entry",
    listText.includes("Manual Corner Store"));
  check("receipts list includes photographed purchases", listText.includes("Home Depot"));
  check("receipts list shows a photo count for the 2-photo purchase", /2 photos/.test(listText));

  if (DEVLOG) {
    await new Promise((r) => setTimeout(r, 800));
    const signCalls = countSignCalls(DEVLOG) - traceBefore;
    check("ONE batched signed-URL pass for the whole list (not per row)",
      signCalls === 1, `${signCalls} storage sign call(s)`);
  }

  // grid toggle
  await page.getByRole("button", { name: "Grid view" }).click();
  await page.waitForTimeout(400);
  check("grid toggle renders tiles", (await page.locator("section a[href^='/app/estimator/purchases/'] .aspect-square").count()) > 0);

  // ---------- Part A: duplicate warning + merge ----------
  await page.goto(`${BASE}/app/estimator/purchases`, { waitUntil: "domcontentloaded" });
  // the placeholder has zero items → it's in "Receipts waiting for items".
  // Scope to ITS row: several zero-item purchases are in that list.
  await page.locator("li", { hasText: "HOME DEPOT #4412" })
    .getByRole("button", { name: "Enter items" }).first().click();
  const vendorInput = page.getByPlaceholder("Vendor").first();
  await vendorInput.waitFor({ timeout: 10000 });
  await vendorInput.fill("HOME DEPOT #4412");
  await page.locator('input[type="date"]').first().fill(DATE);
  await page.locator('input[placeholder="0.00"]').last().fill(String(TOTAL));
  await page.getByText("Possible duplicate").first().waitFor({ timeout: 10000 });
  check("duplicate warning fires on normalized vendor + date + total", true);
  check("all three actions offered, none preselected",
    (await page.getByRole("link", { name: "View it" }).count()) > 0 &&
    (await page.getByRole("button", { name: "Add these photos to it" }).count()) > 0 &&
    (await page.getByRole("button", { name: "Save as separate purchase" }).count()) > 0);
  check("zero-item target also offers the items path",
    (await page.getByRole("button", { name: "…and add these items" }).count()) > 0);

  // merge photos only
  await page.getByRole("button", { name: "Add these photos to it" }).click();
  await page.waitForFunction(
    (want) => location.pathname.endsWith(`/app/estimator/purchases/${want}`),
    targetId,
    { timeout: 45000 },
  );
  check("merge navigates to the existing purchase", true);

  const { data: tAfter } = await admin.from("purchases")
    .select("vendor, purchase_date, total, receipt_paths").eq("id", targetId).single();
  check("merge appended photos to the target (3 total)",
    (tAfter.receipt_paths ?? []).length === 3, `${(tAfter.receipt_paths ?? []).length}`);
  check("target header untouched (vendor/date/total)",
    tAfter.vendor === VENDOR && String(tAfter.purchase_date).slice(0,10) === DATE && Number(tAfter.total) === TOTAL);
  const { data: gone } = await admin.from("purchases").select("id").eq("id", placeholderId);
  check("placeholder purchase row deleted (no second row)", (gone ?? []).length === 0);
  const { data: meter } = await admin.from("receipt_scans").select("id, purchase_id").eq("client_id", CLIENT_ID).eq("status", "ok");
  const meterRow = (meter ?? []).find((m) => m.purchase_id === targetId);
  check("meter row survived and re-pointed to the target", !!meterRow);

  // *** architect requirement (a): every merged photo must still fetch 200 ***
  let all200 = true;
  const statuses = [];
  for (let i = 0; i < (tAfter.receipt_paths ?? []).length; i++) {
    const res = await ctx.request.get(`${BASE}/api/estimator/purchases/${targetId}/receipt?i=${i}`);
    statuses.push(res.status());
    if (res.status() !== 200) all200 = false;
  }
  check("every merged photo fetches 200 through the viewer (objects intact)",
    all200 && statuses.length === 3, statuses.join(","));
  // and the objects themselves still exist in storage
  const { data: stillThere } = await admin.storage.from("receipts").list(String(CLIENT_ID), { limit: 200 });
  const names = (stillThere ?? []).map((o) => o.name);
  check("placeholder's storage objects were NOT deleted",
    [pPath1, pPath2].every((p) => names.includes(p.split("/")[1])));

  // ---------- different total is NOT flagged ----------
  await page.goto(`${BASE}/app/estimator/purchases`, { waitUntil: "domcontentloaded" });
  await page.getByText("Log a purchase").first().click();
  await page.getByPlaceholder("Vendor (e.g. Home Depot)").fill(VENDOR);
  await page.locator('input[type="date"]').first().fill(DATE);
  await page.getByPlaceholder("Item").first().fill("Nothing alike");
  await page.locator('input[placeholder="0.00"]').first().fill("3.21");
  await page.getByRole("button", { name: "Log purchase" }).click();
  await page.waitForTimeout(2500);
  const flagged = await page.getByText("Possible duplicate").count();
  check("same vendor + day, DIFFERENT total is not flagged", flagged === 0);
  const { data: savedNew } = await admin.from("purchases").select("id").eq("client_id", CLIENT_ID).eq("total", 3.21);
  for (const p of savedNew ?? []) purchases.push(capture("purchases", p.id));
  check("manual save proceeded normally when not a duplicate", (savedNew ?? []).length === 1);

  // ---------- manual save DOES run the check ----------
  await page.goto(`${BASE}/app/estimator/purchases`, { waitUntil: "domcontentloaded" });
  await page.getByText("Log a purchase").first().click();
  await page.getByPlaceholder("Vendor (e.g. Home Depot)").fill("the home depot");
  await page.locator('input[type="date"]').first().fill(DATE);
  await page.getByPlaceholder("Item").first().fill("Dupe probe");
  await page.locator('input[placeholder="0.00"]').first().fill(String(TOTAL));
  await page.getByRole("button", { name: "Log purchase" }).click();
  await page.getByText("Possible duplicate").first().waitFor({ timeout: 10000 });
  check("manual multi-item save runs the same duplicate check", true);
  const { count: notSaved } = await admin.from("purchases")
    .select("*", { count: "exact", head: true }).eq("client_id", CLIENT_ID).eq("vendor", "the home depot");
  check("manual duplicate did not persist before the user chose", (notSaved ?? 0) === 0);

  await ctx.close();

  // ---------- member cannot reach the Receipts view ----------
  const mEmail = `rcpt-member-${RID}@${TEMP_EMAIL_DOMAIN}`;
  const mPw = "mb-" + Math.random().toString(36).slice(2, 10) + "-M2!";
  const { data: mk } = await admin.auth.admin.createUser({ email: mEmail, password: mPw, email_confirm: true });
  memberId = capture("auth_users", mk.user.id);
  await admin.from("client_users").insert({ client_id: CLIENT_ID, auth_user_id: memberId, role: "member" });
  const { data: msi } = await anon.auth.signInWithPassword({ email: mEmail, password: mPw });
  const mCtx = await browser.newContext();
  await mCtx.addCookies([{
    name: `sb-${SUPABASE_REF}-auth-token`,
    value: "base64-" + Buffer.from(JSON.stringify(msi.session), "utf8").toString("base64url"),
    domain: host, path: "/",
  }]);
  // App Router redirect() answers this fetch with a 200 redirect payload, so
  // assert the real security property: the page's data never reaches a member.
  const mRes = await mCtx.request.get(`${BASE}/app/estimator/purchases/${targetId}`);
  const mBody = await mRes.text();
  check("member cannot see purchase-detail content (redirected, no data)",
    !mBody.includes(VENDOR) && !mBody.includes("Manual Corner Store"),
    `status ${mRes.status()}, leak=${mBody.includes(VENDOR)}`);
  const mView = await mCtx.request.get(`${BASE}/api/estimator/purchases/${targetId}/receipt`);
  check("member blocked from the receipt viewer route (403)", mView.status() === 403, `status ${mView.status()}`);
  await mCtx.close();

  // ---------- RLS second tenant ----------
  const { data: sharp } = await admin.from("purchases").select("id").eq("client_id", REF_CLIENT_ID).limit(1).maybeSingle();
  if (sharp) {
    const sRes = await ctx.request; // ctx closed; use a fresh owner context
    const oCtx = await browser.newContext();
    await oCtx.addCookies([{
      name: `sb-${SUPABASE_REF}-auth-token`,
      value: "base64-" + Buffer.from(JSON.stringify(si.session), "utf8").toString("base64url"),
      domain: host, path: "/",
    }]);
    const r1 = await oCtx.request.get(`${BASE}/api/estimator/purchases/${sharp.id}/receipt`);
    check("RLS: smoke-tenant owner cannot fetch a the reference tenant receipt (404)", r1.status() === 404, `status ${r1.status()}`);
    await oCtx.close();
  } else {
    notRun("RLS: smoke-tenant owner cannot fetch a the reference tenant receipt", "no the reference tenant purchase exists to target");
  }
} catch (e) {
  check("E2E completed without exception", false, String(e).slice(0, 250));
} finally {
  await browser.close();
  for (const id of purchases) {
    await admin.from("expenses").delete().eq("purchase_id", id);
    await admin.from("receipt_scans").delete().eq("purchase_id", id);
    await admin.from("purchases").delete().eq("id", id);
  }
  // Meter rows are removed by captured purchase id above; an orphaned row
  // (purchase_id nulled by the merge) is reported rather than scope-deleted.
  if (objects.length) await admin.storage.from("receipts").remove(objects);
  if (memberId) {
    await admin.from("client_users").delete().eq("auth_user_id", memberId);
    await admin.auth.admin.deleteUser(memberId);
  }
  await admin.auth.admin.updateUserById(SMOKE_ID, { password: "reset-" + Math.random().toString(36) });
  const { data: leftP } = await admin.from("purchases").select("id").in("id", purchases.length ? purchases : [-1]);
  const { data: leftObjs } = await admin.storage.from("receipts").list(String(CLIENT_ID), { limit: 200 });
  const leftNames = (leftObjs ?? []).map((o) => `${CLIENT_ID}/${o.name}`).filter((n) => objects.includes(n));
  const { count: leftMeter } = await admin.from("receipt_scans")
    .select("*", { count: "exact", head: true }).eq("client_id", CLIENT_ID);
  check("zero residue (purchases, storage objects, meter rows)",
    (leftP ?? []).length === 0 && leftNames.length === 0 && (leftMeter ?? 0) === 0,
    `p=${(leftP ?? []).length} obj=${leftNames.length} meter=${leftMeter}`);
  const refTenantAfter = await refTenantSnapshot();
  check("reference tenant untouched: identical to the snapshot taken before this run",
    refTenantAfter === refTenantBefore,
    refTenantAfter === refTenantBefore
      ? `${JSON.parse(refTenantAfter).length} purchases, unchanged`
      : `before ${refTenantBefore} / after ${refTenantAfter}`);
}

function countSignCalls(logPath) {
  try {
    const log = readFileSync(logPath, "utf8");
    return (log.match(/\/storage\/v1\/object\/sign/g) ?? []).length;
  } catch {
    return 0;
  }
}

process.exit(summary());
