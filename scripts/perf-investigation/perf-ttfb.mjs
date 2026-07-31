/** Phase 0.2a: prod TTFB per page, N samples, via authenticated fetch. */
import {
  admin, anonClient, SUPABASE_REF, CLIENT_ID, SMOKE_ID, SMOKE_EMAIL, prodBaseUrl,
} from "./_config.mjs";
import { createManifest } from "./_harness.mjs";

const { capture, done: manifestDone } = createManifest("perf-ttfb");
const PASSWORD = "prf-" + Math.random().toString(36).slice(2, 12) + "-M3!";
await admin.auth.admin.updateUserById(SMOKE_ID, { password: PASSWORD });

// seed one job so job-detail has a real target
const { data: job } = await admin.from("jobs")
  .insert({ client_id: CLIENT_ID, name: "PERF probe job", phone: "+18015550202", address: "1 Perf Ln", status: "in_progress", source: "manual" })
  .select("id, contact_id").single();
capture("jobs", job.id);
// The BEFORE INSERT trigger creates/links a contact on every job insert.
capture("contacts", job.contact_id);

const anon = anonClient();
const { data: si } = await anon.auth.signInWithPassword({ email: SMOKE_EMAIL, password: PASSWORD });
const COOKIE = `sb-${SUPABASE_REF}-auth-token=base64-` + Buffer.from(JSON.stringify(si.session), "utf8").toString("base64url");

const BASE = prodBaseUrl();
const pages = [
  ["static /login (edge cache ref)", "/login"],
  ["overview /app", "/app"],
  ["jobs list", "/app/jobs"],
  ["job detail", `/app/jobs/${job.id}`],
  ["estimator hub", "/app/estimator"],
  ["money", "/app/estimator/expenses"],
  ["expenses intake", "/app/estimator/purchases"],
];

async function ttfb(path) {
  const t0 = performance.now();
  const res = await fetch(BASE + path, { headers: { cookie: COOKIE } });
  const reader = res.body.getReader();
  await reader.read(); // first byte
  const t1 = performance.now();
  // drain fully + total time
  let bytes = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; bytes += value.length; }
  const t2 = performance.now();
  return { ttfb: t1 - t0, total: t2 - t0, bytes, status: res.status };
}

console.log("page | samples ms (ttfb) | median ttfb | median total | KB");
for (const [label, path] of pages) {
  const runs = [];
  for (let i = 0; i < 5; i++) runs.push(await ttfb(path));
  const ttfbs = runs.map((r) => Math.round(r.ttfb)).sort((a, b) => a - b);
  const totals = runs.map((r) => Math.round(r.total)).sort((a, b) => a - b);
  console.log(`${label} | [${ttfbs.join(", ")}] | ${ttfbs[2]}ms | ${totals[2]}ms | ${Math.round(runs[0].bytes / 1024)}KB | status ${runs[0].status}`);
}

// cleanup — ids journaled at creation, so a crash still leaves a manifest
await admin.from("job_status_log").delete().eq("job_id", job.id);
await admin.from("jobs").delete().eq("id", job.id);
if (job?.contact_id) await admin.from("contacts").delete().eq("id", job.contact_id);
await admin.auth.admin.updateUserById(SMOKE_ID, { password: "reset-" + Math.random().toString(36) });
manifestDone();
console.log("cleanup done");
