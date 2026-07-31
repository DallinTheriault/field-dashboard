/**
 * Business/job-expense handoff — RLS + member-role probes. Creates a TEMP
 * a temp member user on the smoke tenant via service role (architect-approved),
 * proves the DB boundary, cleans up. the reference tenant (the reference tenant) read-only.
 * Usage: node job-expense-rls-probes.mjs
 */
import {
  admin, anonClient, CLIENT_ID, REF_CLIENT_ID, FIXTURES, TEMP_EMAIL_DOMAIN,
} from "./_config.mjs";

import { createHarness } from "./_harness.mjs";
const { check, notRun, summary, capture } = createHarness("job-expense-rls");

// temp member on the smoke tenant
const email = `member-probe-${Math.random().toString(36).slice(2, 8)}@${TEMP_EMAIL_DOMAIN}`;
const password = "mbr-" + Math.random().toString(36).slice(2, 12) + "-Z9!";
const { data: mk, error: mkErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (mkErr) throw mkErr;
const memberId = capture("auth_users", mk.user.id);
await admin.from("client_users").insert({ client_id: CLIENT_ID, auth_user_id: memberId, role: "member" });

// SEED the precondition rather than depending on ambient tenant data: this
// probe needs one smoke-tenant expense to attempt a member UPDATE against.
const { data: seedPurchase } = await admin.from("purchases").insert({
  client_id: CLIENT_ID, vendor: "RLS probe seed", purchase_date: "2026-07-30", source: "manual",
}).select("id").single();
capture("purchases", seedPurchase?.id ?? null);
// customer_notified only exists on job_extra items, so the probe needs a job
// and a job_extra row — otherwise it tests the flag outside its real context.
const { data: seedJob } = await admin.from("jobs").insert({
  client_id: CLIENT_ID, name: "RLS probe job", phone: "+18015550932",
  address: "1 Probe Way", status: "in_progress", source: "manual",
}).select("id, contact_id").single();
capture("jobs", seedJob?.id ?? null);
capture("contacts", seedJob?.contact_id ?? null); // trigger-created contact
const { data: smokeExpense } = await admin.from("expenses").insert({
  client_id: CLIENT_ID, purchase_id: seedPurchase.id, job_id: seedJob.id,
  expense_date: "2026-07-30", category: "Materials & supplies",
  description: "rls probe extra item", amount: 1,
  assignment: "job_extra", customer_notified: false,
}).select("id").single();
capture("expenses", smokeExpense?.id ?? null);
const { data: refPurchase } = await admin.from("purchases").select("id").eq("client_id", REF_CLIENT_ID).limit(1).maybeSingle();

const member = anonClient();
const { data: si, error: siErr } = await member.auth.signInWithPassword({ email, password });
if (siErr) throw siErr;
await member.auth.setSession(si.session);

try {
  // membership role really is 'member'
  const { data: mrow } = await member.from("client_users").select("role").eq("auth_user_id", memberId).maybeSingle();
  check("temp user role is member", mrow?.role === "member", mrow?.role);

  // member CANNOT insert expenses directly (RLS = owner/manager) — any assignment
  for (const a of ["job_in_bid", "job_extra", "stock"]) {
    const { error } = await member.from("expenses").insert({
      client_id: CLIENT_ID, category: "Materials & supplies", description: `probe-${a}`, amount: 1, assignment: a,
    });
    check(`member direct expenses insert (${a}) blocked by RLS`, error?.code === "42501", error?.code);
  }

  // member CANNOT insert a purchase directly
  const { error: pErr } = await member.from("purchases").insert({
    client_id: CLIENT_ID, vendor: "probe", purchase_date: "2026-07-22", source: "manual",
  });
  check("member direct purchases insert blocked by RLS", pErr?.code === "42501", pErr?.code);

  // member CANNOT edit customer_notified on an existing expense (update → 0 rows)
  {
    // The live route: PostgREST with a member JWT — the surface an actual
    // member (or anyone holding their token) can reach.
    const { data: upd } = await member.from("expenses")
      .update({ customer_notified: true }).eq("id", smokeExpense.id).select("id");
    check("member cannot set customer_notified on a job_extra item (0 rows)",
      (upd ?? []).length === 0);
    const { data: after } = await admin.from("expenses")
      .select("customer_notified").eq("id", smokeExpense.id).single();
    check("customer_notified is still false after the member's attempt",
      after.customer_notified === false, String(after.customer_notified));

    // And the member may not reassign it away from job_extra either.
    const { data: reassign } = await member.from("expenses")
      .update({ assignment: "job_in_bid" }).eq("id", smokeExpense.id).select("id");
    check("member cannot reassign a job_extra item (0 rows)", (reassign ?? []).length === 0);
  }

  // member CANNOT see the reference tenant rows (cross-tenant read)
  const { data: sj } = await member.from("jobs").select("id").eq("id", FIXTURES.refJobId);
  check("member cannot read the reference tenant job 126", (sj ?? []).length === 0);
  if (refPurchase) {
    const { data: sp } = await member.from("purchases").select("id").eq("id", refPurchase.id);
    check("member cannot read a the reference tenant purchase", (sp ?? []).length === 0);
  } else {
    notRun("member cannot read a the reference tenant purchase", "no the reference tenant purchase exists to target");
  }

  // member CAN read the smoke tenant expenses (select is tenant-wide) — capture list works
  const { data: ce, error: ceErr } = await member.from("expenses").select("id").eq("client_id", CLIENT_ID).limit(1);
  check("member can read own-tenant expenses (for the read-only list)", !ceErr, ceErr?.message);
} finally {
  // Captured ids only: the probe inserts are expected to be BLOCKED by RLS,
  // so there is normally nothing to remove. Anything that did land is reported.
  const { data: strays } = await admin.from("expenses")
    .select("id, description").eq("client_id", CLIENT_ID).like("description", "probe-%");
  if ((strays ?? []).length) {
    console.log("ORPHANS (not deleted — report only):", JSON.stringify(strays));
  }
  await admin.from("expenses").delete().eq("id", smokeExpense.id);
  await admin.from("purchases").delete().eq("id", seedPurchase.id);
  await admin.from("job_status_log").delete().eq("job_id", seedJob.id);
  await admin.from("jobs").delete().eq("id", seedJob.id);
  if (seedJob?.contact_id) await admin.from("contacts").delete().eq("id", seedJob.contact_id);
  await admin.from("client_users").delete().eq("auth_user_id", memberId);
  await admin.auth.admin.deleteUser(memberId);
  const { data: leftUser } = await admin.from("client_users").select("auth_user_id").eq("auth_user_id", memberId);
  const { data: leftExp } = await admin.from("expenses").select("id").eq("client_id", CLIENT_ID).like("description", "probe-%");
  check("zero residue (temp user + probe rows gone)", (leftUser ?? []).length === 0 && (leftExp ?? []).length === 0);
}

process.exit(summary());
