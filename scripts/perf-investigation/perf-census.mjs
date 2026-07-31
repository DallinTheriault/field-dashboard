/**
 * Phase 0.2b: per-page Supabase round-trip census on local dev (PERF_TRACE).
 * Seeds a realistic job (tasks+photos rows, estimate, actuals, extras),
 * requests each page in a known time window, then buckets [PERFRT] log
 * lines to produce: count, sequential-vs-parallel shape, fetch wall-clock.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  admin, anonClient, SUPABASE_REF, CLIENT_ID, SMOKE_ID, SMOKE_EMAIL,
} from "./_config.mjs";
import { createManifest } from "./_harness.mjs";

const BASE = process.argv[2];
const LOG = process.argv[3];
// Fail BEFORE seeding when the run can't possibly finish: a missing arg used to
// crash after the inserts, orphaning every seeded row (the manifest now makes
// those recoverable, but not seeding them at all is better).
if (!LOG) {
  console.error("usage: node perf-census.mjs <baseUrl> <path-to-dev-server-log>");
  console.error("  the dev server must run with PERF_TRACE=1 and its output tee'd to that file");
  process.exit(2);
}
const { capture, done: manifestDone } = createManifest("perf-census");
const PASSWORD = "cen-" + Math.random().toString(36).slice(2, 12) + "-N4!";
await admin.auth.admin.updateUserById(SMOKE_ID, { password: PASSWORD });

// realistic the reference tenant-shaped job: estimate, 2 tasks w/ photo rows, actuals, extra
const { data: entity } = await admin.from("billing_entities").select("id").eq("client_id", CLIENT_ID).limit(1).single();
const { data: job } = await admin.from("jobs")
  .insert({ client_id: CLIENT_ID, name: "CENSUS job", phone: "+18015550101", address: "1 Census Ln", status: "in_progress", source: "manual" })
  .select("id, contact_id").single();
capture("jobs", job.id);
capture("contacts", job.contact_id); // trigger-created on every job insert
const jobRow = job;
const { data: est } = await admin.from("estimates")
  .insert({ client_id: CLIENT_ID, job_id: job.id, version: 1, status: "accepted", computed_price: 500, billing_entity_id: entity.id })
  .select("id").single();
await admin.from("estimate_line_items").insert({
  client_id: CLIENT_ID, estimate_id: est.id, description: "Work", type: "TASK", qty: 1,
  resolved_labor_hours: 5, resolved_client_amount: 500, sort_order: 0,
});
const { data: t1 } = await admin.from("tasks").insert({ client_id: CLIENT_ID, job_id: job.id, title: "Task A", sort_order: 1 }).select("id").single();
await admin.from("tasks").insert({ client_id: CLIENT_ID, job_id: job.id, title: "Task B", sort_order: 2 });
await admin.from("task_photos").insert([
  { client_id: CLIENT_ID, task_id: t1.id, storage_path: `${CLIENT_ID}/x/1.jpg` },
  { client_id: CLIENT_ID, task_id: t1.id, storage_path: `${CLIENT_ID}/x/2.jpg` },
]);
const { data: seedTime } = await admin.from("time_entries").insert({ client_id: CLIENT_ID, job_id: job.id, entry_date: "2026-07-15", hours: 3 }).select("id").single();
capture("time_entries", seedTime?.id);
const { data: seedExpenses } = await admin.from("expenses").insert([
  { client_id: CLIENT_ID, job_id: job.id, category: "Materials & supplies", description: "Paint", amount: 76, assignment: "job_in_bid" },
  { client_id: CLIENT_ID, job_id: job.id, category: "Materials & supplies", description: "Lock", amount: 24, assignment: "job_extra" },
]).select("id");
for (const r of seedExpenses ?? []) capture("expenses", r.id);

const anon = anonClient();
const { data: si } = await anon.auth.signInWithPassword({ email: SMOKE_EMAIL, password: PASSWORD });
const COOKIE = `sb-${SUPABASE_REF}-auth-token=base64-` + Buffer.from(JSON.stringify(si.session), "utf8").toString("base64url");

const pages = [
  ["jobs list", "/app/jobs"],
  ["job detail", `/app/jobs/${job.id}`],
  ["estimator hub", "/app/estimator"],
  ["money", "/app/estimator/expenses"],
  ["expenses intake", "/app/estimator/purchases"],
  ["overview", "/app"],
];

// robust fetch: dev server can reset connections under compile load
async function get(path) {
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(BASE + path, { headers: { cookie: COOKIE } });
      await res.text();
      return res;
    } catch {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error("fetch failed 4x: " + path);
}

// warm compile pass (Next dev compiles per-route on first hit) — twice,
// so the census pass measures warm renders, not compilation.
for (const [, path] of pages) { await get(path); await new Promise((r) => setTimeout(r, 500)); }
for (const [, path] of pages) { await get(path); }
await new Promise((r) => setTimeout(r, 2500));

const windows = [];
for (const [label, path] of pages) {
  await new Promise((r) => setTimeout(r, 1500)); // gap between buckets
  const start = Date.now();
  const t0 = performance.now();
  await get(path);
  const wall = performance.now() - t0;
  const end = Date.now();
  windows.push({ label, start, end, wall });
}
await new Promise((r) => setTimeout(r, 1500));

// parse the dev-server log
const log = readFileSync(LOG, "utf8");
const lines = [...log.matchAll(/\[PERFRT\] (\d+) (\d+) (\d+)ms (.*)/g)].map((m) => ({
  t0: Number(m[1]), t1: Number(m[2]), ms: Number(m[3]), url: m[4].trim(),
}));

console.log("\n=== ROUND-TRIP CENSUS (warm dev render) ===");
for (const w of windows) {
  const rts = lines.filter((l) => l.t0 >= w.start - 50 && l.t0 <= w.end + 50);
  rts.sort((a, b) => a.t0 - b.t0);
  // sequential chains: count RTs whose start is after every earlier RT's end (no overlap)
  let maxConcurrent = 0;
  let chainDepth = 0;
  let lastEnd = 0;
  for (const r of rts) {
    const concurrent = rts.filter((o) => o.t0 < r.t1 && o.t1 > r.t0).length;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    if (r.t0 >= lastEnd) chainDepth++;
    lastEnd = Math.max(lastEnd, r.t1);
  }
  const fetchSpan = rts.length ? Math.max(...rts.map((r) => r.t1)) - Math.min(...rts.map((r) => r.t0)) : 0;
  const totalRtMs = rts.reduce((s, r) => s + r.ms, 0);
  console.log(`\n${w.label}: wall ${Math.round(w.wall)}ms | ${rts.length} round trips | fetch span ${fetchSpan}ms | serial chain depth ~${chainDepth} | max concurrency ${maxConcurrent} | sum RT ${totalRtMs}ms`);
  for (const r of rts) {
    console.log(`  +${r.t0 - w.start}ms ${String(r.ms).padStart(4)}ms ${r.url.slice(0, 90)}`);
  }
}

// cleanup
await admin.from("job_status_log").delete().eq("job_id", job.id);
await admin.from("jobs").delete().eq("id", job.id); // cascades estimate/tasks/photos rows
// Captured IDs only — never a scope predicate (standing rule 2026-07-30).
await admin.from("expenses").delete().in("id", (seedExpenses ?? []).map((r) => r.id));
if (seedTime) await admin.from("time_entries").delete().eq("id", seedTime.id);
if (jobRow?.contact_id) await admin.from("contacts").delete().eq("id", jobRow.contact_id);
await admin.auth.admin.updateUserById(SMOKE_ID, { password: "reset-" + Math.random().toString(36) });
console.log("\ncleanup done");
manifestDone();
