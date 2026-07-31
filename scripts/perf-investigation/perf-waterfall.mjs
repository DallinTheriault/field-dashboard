/**
 * Phase 0.3: client-side waterfall on PROD — jobs-list → job-detail tap,
 * desktop + throttled-mobile profiles. Seeds a realistic job (2 tasks,
 * 3 real photos, estimate, actuals, extra) so /api/task-photos and the
 * client-side JobActuals fetches are exercised like the owner's real jobs.
 */
import {
  admin, anonClient, SUPABASE_REF, CLIENT_ID, SMOKE_ID, SMOKE_EMAIL, prodBaseUrl, loadPlaywright,
} from "./_config.mjs";
const { chromium } = loadPlaywright();
import { createManifest } from "./_harness.mjs";

const BASE = prodBaseUrl();
const { capture, done: manifestDone } = createManifest("perf-waterfall");
const PASSWORD = "wtf-" + Math.random().toString(36).slice(2, 12) + "-P5!";
await admin.auth.admin.updateUserById(SMOKE_ID, { password: PASSWORD });

// tiny real JPEG (1x1) so storage serves actual images
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);

const { data: entity } = await admin.from("billing_entities").select("id").eq("client_id", CLIENT_ID).limit(1).single();
const { data: job } = await admin.from("jobs")
  .insert({ client_id: CLIENT_ID, name: "WATERFALL job", phone: "+18015550606", address: "1 Waterfall Ln", status: "in_progress", source: "manual" })
  .select("id, contact_id").single();
capture("jobs", job.id);
capture("contacts", job.contact_id); // trigger-created on every job insert
const { data: est } = await admin.from("estimates")
  .insert({ client_id: CLIENT_ID, job_id: job.id, version: 1, status: "accepted", computed_price: 500, billing_entity_id: entity.id })
  .select("id, contact_id").single();
await admin.from("estimate_line_items").insert({
  client_id: CLIENT_ID, estimate_id: est.id, description: "Work", type: "TASK", qty: 1,
  resolved_labor_hours: 5, resolved_client_amount: 500, sort_order: 0,
});
const { data: t1 } = await admin.from("tasks").insert({ client_id: CLIENT_ID, job_id: job.id, title: "Task A", sort_order: 1 }).select("id").single();
await admin.from("tasks").insert({ client_id: CLIENT_ID, job_id: job.id, title: "Task B", sort_order: 2 });
const photoPaths = [];
for (let i = 0; i < 3; i++) {
  const p = `8/${job.id}/${t1.id}/wf-${i}.jpg`;
  await admin.storage.from("job-photos").upload(p, JPEG, { contentType: "image/jpeg" });
  await admin.from("task_photos").insert({ client_id: CLIENT_ID, task_id: t1.id, storage_path: p });
  photoPaths.push(p);
}
const { data: seedTime } = await admin.from("time_entries").insert({ client_id: CLIENT_ID, job_id: job.id, entry_date: "2026-07-15", hours: 3 }).select("id").single();
const createdTimeIds = seedTime ? [capture("time_entries", seedTime.id)] : [];
const { data: seedExpenses } = await admin.from("expenses").insert([
  { client_id: CLIENT_ID, job_id: job.id, category: "Materials & supplies", description: "Paint", amount: 76, assignment: "job_in_bid" },
  { client_id: CLIENT_ID, job_id: job.id, category: "Materials & supplies", description: "Lock", amount: 24, assignment: "job_extra" },
]).select("id"); // .select is REQUIRED: without it seedExpenses is null and the
// cleanup below deletes .in("id", []) — i.e. nothing — orphaning both rows.
for (const r of seedExpenses ?? []) capture("expenses", r.id);

async function profileRun(label, throttle) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(
    throttle ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15" } : {},
  );
  const page = await ctx.newPage();
  if (throttle) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  page.setDefaultTimeout(90000);

  const reqs = [];
  page.on("requestfinished", async (req) => {
    try {
      const timing = req.timing();
      const res = await req.response();
      reqs.push({
        url: req.url(), started: timing.startTime,
        dur: timing.responseEnd >= 0 ? timing.responseEnd : 0,
        size: Number((await res?.headerValue("content-length")) ?? 0),
        type: req.resourceType(),
      });
    } catch { /* ignore */ }
  });

  // login
  await page.goto(`${BASE}/login`);
  await page.fill("#email", SMOKE_EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => new URL(u).pathname.startsWith("/app"), { timeout: 90000 });

  // jobs list full load
  reqs.length = 0;
  const t0 = Date.now();
  await page.goto(`${BASE}/app/jobs`, { waitUntil: "networkidle" });
  const jobsListMs = Date.now() - t0;
  const jobsReqs = reqs.length;
  const jobsBytes = reqs.reduce((s, r) => s + r.size, 0);
  const jobsTop = [...reqs].sort((a, b) => b.dur - a.dur).slice(0, 8);

  // job detail HARD load (fresh document, like the owner opening cold)
  reqs.length = 0;
  const th = Date.now();
  await page.goto(`${BASE}/app/jobs/${job.id}`, { waitUntil: "networkidle" });
  const hardMs = Date.now() - th;
  const hardReqs = reqs.length;
  const hardBytes = reqs.reduce((s, r) => s + r.size, 0);
  const hardTop = [...reqs].sort((a, b) => b.dur - a.dur).slice(0, 8);
  await page.goto(`${BASE}/app/jobs`, { waitUntil: "networkidle" });

  // THE TAP: jobs list -> job detail
  reqs.length = 0;
  const t1c = Date.now();
  // desktop renders a ClickableTableRow, mobile an <a> card — click the
  // VISIBLE instance of the text (the other layout variant is hidden)
  await page.locator(`text=WATERFALL job >> visible=true`).first().click();
  await page.waitForURL(new RegExp(`/app/jobs/${job.id}$`));
  const urlMs = Date.now() - t1c;
  // content visible = task card heading present
  await page.locator("text=Task A").waitFor();
  const contentMs = Date.now() - t1c;
  // client-side follow-on fetches (JobActuals etc.) — settle window
  await page.waitForTimeout(4000);
  const followOn = reqs.filter((r) => /supabase\.co|\/api\//.test(r.url));
  const idleMs = Date.now() - t1c;

  console.log(`\n--- ${label} ---`);
  console.log(`jobs list FULL load: ${jobsListMs}ms | ${jobsReqs} req | ${Math.round(jobsBytes / 1024)}KB`);
  for (const r of jobsTop.slice(0, 6))
    console.log(`    ${String(Math.round(r.dur)).padStart(6)}ms ${String(Math.round(r.size / 1024)).padStart(5)}KB ${r.type.padEnd(8)} ${r.url.replace(BASE, "").split("?")[0].slice(0, 78)}`);
  console.log(`job detail HARD load: ${hardMs}ms | ${hardReqs} req | ${Math.round(hardBytes / 1024)}KB`);
  for (const r of hardTop.slice(0, 6))
    console.log(`    ${String(Math.round(r.dur)).padStart(6)}ms ${String(Math.round(r.size / 1024)).padStart(5)}KB ${r.type.padEnd(8)} ${r.url.replace(BASE, "").split("?")[0].slice(0, 78)}`);
  console.log(`SPA tap: URL ${urlMs}ms | content visible ${contentMs}ms`);
  console.log(`follow-on client fetches after tap: ${followOn.length}`);
  for (const r of followOn.slice(0, 8))
    console.log(`    ${String(Math.round(r.dur)).padStart(6)}ms ${r.url.replace("https://", "").split("?")[0].slice(0, 82)}`);
  await browser.close();
}

try {
  await profileRun("DESKTOP (unthrottled)", false);
  await profileRun("MOBILE (150ms RTT, 1.6Mbps down, 4x CPU)", true);
} finally {
  await admin.storage.from("job-photos").remove(photoPaths);
  await admin.from("job_status_log").delete().eq("job_id", job.id);
  await admin.from("jobs").delete().eq("id", job.id);
  // Captured IDs only — never a scope predicate (standing rule 2026-07-30).
  await admin.from("expenses").delete().in("id", (seedExpenses ?? []).map((r) => r.id));
  await admin.from("time_entries").delete().in("id", createdTimeIds);
  if (job?.contact_id) await admin.from("contacts").delete().eq("id", job.contact_id);
  manifestDone();
  await admin.auth.admin.updateUserById(SMOKE_ID, { password: "reset-" + Math.random().toString(36) });
  console.log("\ncleanup done");
}
