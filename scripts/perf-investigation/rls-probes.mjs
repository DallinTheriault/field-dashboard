/**
 * RLS regression probes for migration v086 (PERF_SPEC Phase 3 — the six
 * rewritten policies). House rules: the smoke tenant (the smoke tenant) probes only as the
 * designated smoke user, the reference tenant untouched, zero residue.
 * Usage: node rls-probes.mjs
 */
import {
  admin, anonClient, CLIENT_ID, REF_CLIENT_ID, SMOKE_ID, SMOKE_EMAIL,
} from "./_config.mjs";

import { createHarness } from "./_harness.mjs";
const { check, notRun, summary, capture } = createHarness("rls-probes");
const createdTemplateIds = [];
const createdScheduledIds = [];
let seededThreadId = null;

// -- setup ------------------------------------------------------------------
const PASSWORD = "rls-" + Math.random().toString(36).slice(2, 12) + "-Q9!";
await admin.auth.admin.updateUserById(SMOKE_ID, { password: PASSWORD });

// capture the smoke membership row for the restore plan (delete-guard probe)
const { data: ownRow } = await admin.from("client_users").select("*")
  .eq("client_id", CLIENT_ID).eq("auth_user_id", SMOKE_ID).single();
const { data: smokeOwners } = await admin.from("client_users").select("auth_user_id")
  .eq("client_id", CLIENT_ID).eq("role", "owner");
console.log(`setup: smoke role=${ownRow.role}, smoke tenant owners=${smokeOwners.length}`);

// SEED the precondition rather than depending on ambient tenant data.
const { data: threads } = await admin.from("sms_threads").select("id").eq("client_id", CLIENT_ID).limit(1);
let smokeThread = threads?.[0]?.id ?? null;
if (!smokeThread) {
  const { data: t } = await admin.from("sms_threads")
    .insert({ client_id: CLIENT_ID, tenant_phone: "+18015550940", contact_phone: "+18015550941" })
    .select("id").maybeSingle();
  if (t) { smokeThread = t.id; seededThreadId = capture("sms_threads", t.id); }
}

// sign in as smoke user
const user = anonClient();
const { data: si, error: siErr } = await user.auth.signInWithPassword({
  email: SMOKE_EMAIL, password: PASSWORD,
});
if (siErr) throw siErr;
await user.auth.setSession(si.session);

try {
  // -- client_users ----------------------------------------------------------
  const { data: cuRows } = await user.from("client_users").select("client_id");
  check("client_users select: rows visible", (cuRows ?? []).length > 0);
  check("client_users select: tenant-isolated (all client_id=8)",
    (cuRows ?? []).every((r) => r.client_id === CLIENT_ID));

  const { data: updOwn, error: updOwnErr } = await user.from("client_users")
    .update({ role: "owner" }) // no-op value on own row
    .eq("client_id", CLIENT_ID).eq("auth_user_id", SMOKE_ID).select();
  check("client_users update: own row allowed", !updOwnErr && (updOwn ?? []).length === 1,
    updOwnErr?.message);

  const { data: updX } = await user.from("client_users")
    .update({ role: "manager" }).eq("client_id", REF_CLIENT_ID).select();
  check("client_users update: cross-tenant blocked (0 rows)", (updX ?? []).length === 0);

  // v087 additions — user-path writes must work (no policy recursion) and
  // cross-tenant membership writes must be impossible.
  const probeRow = { ...ownRow };
  for (const k of ["id", "created_at", "updated_at"]) delete probeRow[k];
  probeRow.auth_user_id = crypto.randomUUID();
  probeRow.role = "member";
  if ("email" in probeRow) probeRow.email = "rls-probe@example.invalid";
  const { data: cuIns, error: cuInsErr } = await user.from("client_users")
    .insert(probeRow).select().maybeSingle();
  // Success or FK-on-auth.users failure both prove the policy admitted the
  // row; 42P17 (recursion) or 42501 (denied) would be regressions.
  check("client_users insert: own tenant passes RLS (no recursion)",
    !cuInsErr || cuInsErr.code === "23503", cuInsErr?.code);
  if (cuIns?.id) capture("client_users", cuIns.id);
  if (cuIns) await admin.from("client_users").delete()
    .eq("client_id", CLIENT_ID).eq("auth_user_id", probeRow.auth_user_id);

  const { error: cuInsXErr } = await user.from("client_users")
    .insert({ ...probeRow, client_id: REF_CLIENT_ID, auth_user_id: crypto.randomUUID() });
  check("client_users insert: cross-tenant blocked", cuInsXErr?.code === "42501", cuInsXErr?.code);

  const { data: cuDelX } = await user.from("client_users")
    .delete().eq("client_id", REF_CLIENT_ID).select();
  check("client_users delete: cross-tenant blocked (0 rows)", (cuDelX ?? []).length === 0);

  if (ownRow.role === "owner" && smokeOwners.length === 1) {
    const { data: delOwn } = await user.from("client_users")
      .delete().eq("client_id", CLIENT_ID).eq("auth_user_id", SMOKE_ID).select();
    const deleted = (delOwn ?? []).length > 0;
    check("client_users delete: last-owner guard holds (0 rows)", !deleted);
    if (deleted) { // restore immediately
      await admin.from("client_users").insert(ownRow);
      console.log("  !! restored deleted membership row");
    }
  } else {
    notRun(
      "client_users delete: last-owner guard",
      `the smoke tenant has ${smokeOwners.length} owners; the guard needs exactly 1 and this suite must not remove a real owner. Verified separately by the rolled-back DO-block in the v087 check.`,
    );
  }

  // -- sms_reply_templates ---------------------------------------------------
  const { data: tpl, error: tplErr } = await user.from("sms_reply_templates")
    .insert({ client_id: CLIENT_ID, label: "RLS probe", body: "probe" }).select().single();
  if (tpl?.id) createdTemplateIds.push(capture("sms_reply_templates", tpl.id));
  check("sms_reply_templates insert: own tenant allowed", !tplErr && !!tpl, tplErr?.message);

  const { data: tplSel } = await user.from("sms_reply_templates").select("id").eq("id", tpl?.id ?? -1);
  check("sms_reply_templates select: sees own row (select policy intact)", (tplSel ?? []).length === 1);

  const { error: tplUpdErr } = await user.from("sms_reply_templates")
    .update({ body: "probe2" }).eq("id", tpl?.id ?? -1);
  check("sms_reply_templates update: own tenant allowed", !tplUpdErr, tplUpdErr?.message);

  const { error: tplXErr } = await user.from("sms_reply_templates")
    .insert({ client_id: REF_CLIENT_ID, label: "X", body: "X" });
  check("sms_reply_templates insert: cross-tenant blocked", !!tplXErr, tplXErr?.code);

  const { data: tplDel } = await user.from("sms_reply_templates")
    .delete().eq("id", tpl?.id ?? -1).select();
  check("sms_reply_templates delete: own tenant allowed", (tplDel ?? []).length === 1);

  // -- sms_scheduled ---------------------------------------------------------
  const { error: schedXErr } = await user.from("sms_scheduled").insert({
    client_id: REF_CLIENT_ID, thread_id: 999999, tenant_phone: "+10000000000",
    contact_phone: "+10000000001", body: "X", scheduled_for: new Date(1893456000000).toISOString(),
  });
  check("sms_scheduled insert: cross-tenant blocked (RLS, not FK)",
    schedXErr?.code === "42501", schedXErr?.code);

  const threadForInsert = smokeThread ?? 999999;
  const { data: sched, error: schedErr } = await user.from("sms_scheduled").insert({
    client_id: CLIENT_ID, thread_id: threadForInsert, tenant_phone: "+10000000000",
    contact_phone: "+10000000001", body: "RLS probe", scheduled_for: new Date(1893456000000).toISOString(),
  }).select().maybeSingle();
  // Passing RLS is the point: success (real thread) or FK violation 23503
  // (dummy thread) both prove the WITH CHECK admitted the row.
  const schedRlsPassed = !schedErr || schedErr.code === "23503";
  check("sms_scheduled insert: own tenant passes RLS", schedRlsPassed, schedErr?.code);

  if (sched?.id) {
    createdScheduledIds.push(capture("sms_scheduled", sched.id));
    const { error: schedUpdErr } = await user.from("sms_scheduled")
      .update({ status: "cancelled" }).eq("id", sched.id);
    check("sms_scheduled update: own tenant allowed", !schedUpdErr, schedUpdErr?.message);
    await admin.from("sms_scheduled").delete().eq("id", sched.id);
  } else {
    notRun("sms_scheduled update: own tenant allowed", "no sms_thread available to attach the row to");
  }

  // -- team_audit_log ---------------------------------------------------------
  const { data: audit, error: auditErr } = await user.from("team_audit_log").select("client_id");
  check("team_audit_log select: readable, tenant-isolated",
    !auditErr && (audit ?? []).every((r) => r.client_id === CLIENT_ID),
    auditErr?.message ?? `${(audit ?? []).length} rows`);
} finally {
  // -- cleanup / zero residue -------------------------------------------------
  // Captured ids only (standing rule 2026-07-30) — never a label/body pattern.
  if (createdTemplateIds.length) {
    await admin.from("sms_reply_templates").delete().in("id", createdTemplateIds);
  }
  if (createdScheduledIds.length) {
    await admin.from("sms_scheduled").delete().in("id", createdScheduledIds);
  }
  if (seededThreadId) await admin.from("sms_threads").delete().eq("id", seededThreadId);
  if (seededThreadId) await admin.from("sms_threads").delete().eq("id", seededThreadId);
  await admin.auth.admin.updateUserById(SMOKE_ID, { password: "reset-" + Math.random().toString(36) });
  const { data: r1 } = await admin.from("sms_reply_templates").select("id").eq("client_id", CLIENT_ID).eq("label", "RLS probe");
  const { data: r2 } = await admin.from("sms_scheduled").select("id").eq("client_id", CLIENT_ID).eq("body", "RLS probe");
  const { data: r3 } = await admin.from("client_users").select("role").eq("client_id", CLIENT_ID).eq("auth_user_id", SMOKE_ID);
  check("zero residue + membership intact",
    (r1 ?? []).length === 0 && (r2 ?? []).length === 0 && (r3 ?? []).length === 1 && r3[0].role === ownRow.role);
}

process.exit(summary());
