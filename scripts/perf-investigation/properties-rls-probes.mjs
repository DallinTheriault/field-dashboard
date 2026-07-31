/**
 * CONTACTS_PROPERTIES_SPEC — RLS second-tenant probe suite for the properties
 * table + contact-search scoping. Runs as the designated smoke user
 * (smoke tenant); the reference tenant (the reference tenant) is the "other tenant" and is only READ for
 * assertion targets, never written. Zero residue. Usage: node properties-rls-probes.mjs
 */
import {
  admin, anonClient, CLIENT_ID, REF_CLIENT_ID, SMOKE_ID, SMOKE_EMAIL,
} from "./_config.mjs";

import { createHarness } from "./_harness.mjs";
const { check, notRun, summary, capture } = createHarness("properties-rls");

const PASSWORD = "prp-" + Math.random().toString(36).slice(2, 12) + "-R3!";
await admin.auth.admin.updateUserById(SMOKE_ID, { password: PASSWORD });

// A smoke-tenant contact to own probe properties; a the reference tenant property/contact as
// cross-tenant targets (read via service role, never modified).
// SEED the precondition: this suite owns the contact its probe properties hang off.
const { data: smokeContact } = await admin.from("contacts").insert({
  client_id: CLIENT_ID, name: "RLS Probe Owner", phone: "+18015550931",
}).select("id").single();
capture("contacts", smokeContact?.id ?? null);
const { data: refProperty } = await admin.from("properties")
  .select("id, contact_id").eq("client_id", REF_CLIENT_ID).limit(1).maybeSingle();
const { data: refContact } = await admin.from("contacts")
  .select("id, name").eq("client_id", REF_CLIENT_ID).limit(1).maybeSingle();

const user = anonClient();
const { data: si, error: siErr } = await user.auth.signInWithPassword({
  email: SMOKE_EMAIL, password: PASSWORD,
});
if (siErr) throw siErr;
await user.auth.setSession(si.session);

let probeProp = null;
try {
  // 1. select is tenant-isolated
  const { data: sel } = await user.from("properties").select("id, client_id");
  check("properties select: rows all the smoke tenant", (sel ?? []).every((r) => r.client_id === CLIENT_ID),
    `${(sel ?? []).length} rows`);

  // 2. cannot see a specific the reference tenant property
  if (refProperty) {
    const { data: x } = await user.from("properties").select("id").eq("id", refProperty.id);
    check("properties select: the reference tenant row invisible", (x ?? []).length === 0);
  } else {
    notRun("properties select: the reference tenant row invisible", "no the reference tenant property exists to target");
  }

  // 3. insert own-tenant property allowed (owner)
  {
    const { data: ins, error: insErr } = await user.from("properties")
      .insert({ client_id: CLIENT_ID, contact_id: smokeContact.id, address: "RLS Probe Addr", unit: "P1" })
      .select("id").maybeSingle();
    check("properties insert: own tenant allowed", !insErr && !!ins, insErr?.message);
    probeProp = capture("properties", ins?.id ?? null);
  }

  // 4. insert cross-tenant property blocked (client_id = 1)
  const { error: xErr } = await user.from("properties")
    .insert({ client_id: REF_CLIENT_ID, contact_id: smokeContact?.id ?? 1, address: "X", unit: null });
  check("properties insert: cross-tenant client_id blocked", xErr?.code === "42501", xErr?.code);

  // 5. contact search scoping — the action's query, run as the smoke user, must
  //    never surface a the reference tenant contact. Search by a the reference tenant contact's name.
  if (refContact?.name) {
    const q = refContact.name.trim().slice(0, 4);
    const { data: hits } = await user.from("contacts")
      .select("id, client_id").is("archived_at", null).ilike("name", `%${q}%`).limit(8);
    const leaked = (hits ?? []).some((h) => h.client_id !== CLIENT_ID);
    check("contact search: no cross-tenant leak", !leaked,
      `${(hits ?? []).length} hits, leaked=${leaked}`);
  } else {
    notRun("contact search: no cross-tenant leak", "no the reference tenant contact exists to search for");
  }

  // 6. cannot update a the reference tenant property
  if (refProperty) {
    const { data: upd } = await user.from("properties")
      .update({ label: "hacked" }).eq("id", refProperty.id).select();
    check("properties update: cross-tenant blocked (0 rows)", (upd ?? []).length === 0);
  } else {
    notRun("properties update: cross-tenant blocked", "no the reference tenant property exists to target");
  }
} finally {
  if (probeProp) await admin.from("properties").delete().eq("id", probeProp);
  if (smokeContact?.id) await admin.from("contacts").delete().eq("id", smokeContact.id);
  // probeProp is deleted above by captured id; nothing else to remove.
  await admin.auth.admin.updateUserById(SMOKE_ID, { password: "reset-" + Math.random().toString(36) });
  const { data: residue } = await admin.from("properties").select("id").eq("client_id", CLIENT_ID).eq("address", "RLS Probe Addr");
  check("zero residue", (residue ?? []).length === 0);
}

process.exit(summary());
