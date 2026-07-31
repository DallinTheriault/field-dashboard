/**
 * Authenticated smoke for the getClaims() auth path (perf re-plan step 3,
 * architect-approved 2026-07-16). Standard smoke-user pattern: service-role
 * password rotation on the designated smoke user ONLY, then:
 *   1. fresh sign-in → authenticated warm renders (jobs list → job detail)
 *   2. RSC navigation fetch (the soft-nav path)
 *   3. sign-out via /auth/logout → no-session bounce to /login
 *   4. tampered + garbage token → clean 307 to /login, never an error page
 * Seeds one smoke-tenant job, cleans it (incl. the trigger-created contact),
 * re-scrambles the smoke password. Usage: node smoke-auth.mjs [base-url]
 */
import {
  admin, anonClient, url, env, SUPABASE_REF, baseUrlFrom,
  CLIENT_ID, SMOKE_ID, SMOKE_EMAIL,
} from "./_config.mjs";

const BASE = baseUrlFrom(process.argv[2]);
const SMOKE_PHONE = "+18015550177"; // unique — must not collide with demo contacts

import { createHarness } from "./_harness.mjs";
const { check, note, summary, capture } = createHarness("smoke-auth");

const PASSWORD = "smk-" + Math.random().toString(36).slice(2, 12) + "-K7!";
await admin.auth.admin.updateUserById(SMOKE_ID, { password: PASSWORD });

const { data: job, error: jobErr } = await admin.from("jobs")
  .insert({ client_id: CLIENT_ID, name: "SMOKE AUTH job", phone: SMOKE_PHONE, address: "9 Smoke Ct", status: "lead", source: "manual" })
  .select("id, contact_id").single();
if (jobErr) throw jobErr;
capture("jobs", job?.id ?? null);
capture("contacts", job?.contact_id ?? null); // trigger-created contact

try {
  const anon = anonClient();
  const { data: si, error: siErr } = await anon.auth.signInWithPassword({
    email: SMOKE_EMAIL, password: PASSWORD,
  });
  check("fresh sign-in succeeds", !siErr, siErr?.message);

    const cookieFor = (session) =>
    `sb-${SUPABASE_REF}-auth-token=base64-` + Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  const COOKIE = cookieFor(si.session);
  const get = (path, cookie) =>
    fetch(BASE + path, { headers: cookie ? { cookie } : {}, redirect: "manual" });

  // Warm pass (dev compiles per-route on first hit)
  await (await get("/app/jobs", COOKIE)).text();
  await (await get(`/app/jobs/${job.id}`, COOKIE)).text();

  // 1. authenticated warm renders
  let res = await get("/app/jobs", COOKIE);
  const listHtml = await res.text();
  check("jobs list authenticated 200", res.status === 200, "status " + res.status);
  check("jobs list shows seeded job", listHtml.includes("SMOKE AUTH job"));

  res = await get(`/app/jobs/${job.id}`, COOKIE);
  const detailHtml = await res.text();
  check("job detail authenticated 200", res.status === 200, "status " + res.status);
  check("job detail shows job name", detailHtml.includes("SMOKE AUTH job"));

  // 2. RSC navigation fetch — the soft-nav (tap) path
  res = await fetch(BASE + `/app/jobs/${job.id}`, { headers: { cookie: COOKIE, RSC: "1" }, redirect: "manual" });
  check("RSC soft-nav fetch 200", res.status === 200, "status " + res.status);

  // 3. sign-out via the app route, then no-session bounce
  res = await fetch(BASE + "/auth/logout", { method: "POST", headers: { cookie: COOKIE }, redirect: "manual" });
  check("logout responds with redirect", res.status >= 300 && res.status < 400, "status " + res.status);
  res = await get("/app/jobs", null);
  check("no-session bounces to /login",
    res.status === 307 && (res.headers.get("location") || "").includes("/login"),
    `status ${res.status} loc ${res.headers.get("location")}`);

  // 4a. tampered signature → clean bounce, not an error page
  const bad = JSON.parse(JSON.stringify(si.session));
  bad.access_token = bad.access_token.slice(0, -6) + "AAAAAA";
  res = await get("/app/jobs", cookieFor(bad));
  check("tampered token bounces to /login (no 500)",
    res.status === 307 && (res.headers.get("location") || "").includes("/login"),
    `status ${res.status}`);

  // 4b. structurally-garbage cookie → clean bounce
  res = await get("/app/jobs",
    `sb-${SUPABASE_REF}-auth-token=base64-` + Buffer.from('{"access_token":"junk","refresh_token":"junk"}').toString("base64url"));
  check("garbage cookie bounces to /login (no 500)",
    res.status === 307 && (res.headers.get("location") || "").includes("/login"),
    `status ${res.status}`);
} finally {
  // cleanup — zero residue, incl. the trigger-created contact
  await admin.from("job_status_log").delete().eq("job_id", job.id);
  await admin.from("jobs").delete().eq("id", job.id);
  if (job?.contact_id) await admin.from("contacts").delete().eq("id", job.contact_id);
  await admin.auth.admin.updateUserById(SMOKE_ID, { password: "reset-" + Math.random().toString(36) });
  const { data: residue } = await admin.from("jobs").select("id").eq("client_id", CLIENT_ID).eq("name", "SMOKE AUTH job");
  const { data: cResidue } = await admin.from("contacts").select("id").eq("client_id", CLIENT_ID).eq("phone", SMOKE_PHONE);
  check("zero residue", (residue ?? []).length === 0 && (cResidue ?? []).length === 0);
}

process.exit(summary());
