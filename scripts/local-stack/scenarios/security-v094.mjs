// v094 checks: the anon key can't execute any of the seven functions, and
// everything that relies on them still works for real users and triggers.
// Run once before v094 (BEFORE=1, prints only) and once after (asserts).
import { readFileSync } from "node:fs";
import { check } from "./browser.mjs";
import { adminGet, session } from "./api.mjs";

const before = process.env.BEFORE === "1";
const env = Object.fromEntries(
  readFileSync(new URL("../../../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const base = env.NEXT_PUBLIC_SUPABASE_URL;

async function rpcAs(key, fn, args = {}) {
  const r = await fetch(`${base}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  return { status: r.status, body: await r.text() };
}

const calls = [
  ["user_can_write_client", { target_client_id: 8 }],
  ["client_owner_count", { target_client_id: 8 }],
  ["is_platform_admin", {}],
  ["log_job_status_change", {}],
  ["set_job_number", {}],
  ["trg_client_users_role_change_guard", {}],
  ["trg_clients_protect_system_fields", {}],
];
for (const [fn, args] of calls) {
  const r = await rpcAs(env.NEXT_PUBLIC_SUPABASE_ANON_KEY, fn, args);
  const refused = r.status >= 400 && !/^\d|true|false/.test(r.body);
  if (before) console.log(`before  anon ${fn}: ${r.status} ${r.body.slice(0, 90)}`);
  else check(`anon can't execute ${fn}`, refused && r.status !== 200, `${r.status} ${r.body.slice(0, 70)}`);
}
if (before) process.exit(0);

const owner = await session("owner@cascade.test");
const member = await session("member@cascade.test");

// user_can_write_client, through write policies
let r = await owner.post("service_catalog", { client_id: 8, name: "v094 probe", type: "PRICED", unit: "each" });
check("owner can still write (user_can_write_client policy)", r.status === 201, `status ${r.status}`);
r = await member.post("service_catalog", { client_id: 8, name: "v094 member", type: "PRICED", unit: "each" });
check("member still refused by policy, not by a missing grant", r.status === 403 && !/function/.test(r.body.message), r.body?.message);

// set_job_number and log_job_status_change, as triggers
r = await owner.post("jobs", { client_id: 8, name: "v094 job", status: "lead", source: "manual" });
const job = r.body?.[0];
check("job insert still gets a job number (set_job_number trigger)", r.status === 201 && !!job?.job_number, job?.job_number);
r = await owner.patch(`jobs?id=eq.${job.id}`, { status: "scheduled" });
const log = await adminGet(`job_status_log?job_id=eq.${job.id}&select=old_status,new_status`);
check("status change still logged (log_job_status_change trigger)", r.status === 200 && log.length === 1, JSON.stringify(log));

// service_role (n8n / server actions) inserting a job: trigger fires without EXECUTE
const svc = await fetch(`${base}/rest/v1/jobs`, {
  method: "POST",
  headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json", prefer: "return=representation" },
  body: JSON.stringify({ client_id: 8, name: "v094 svc job", status: "lead", source: "phone-call" }),
});
const svcJob = (await svc.json())[0];
check("service-role job insert still numbered", svc.status === 201 && !!svcJob?.job_number, svcJob?.job_number);

// trg_clients_protect_system_fields (calls is_platform_admin as its owner)
r = await owner.patch("Clients?id=eq.8", { is_test: false });
check("owner still blocked from system fields", r.status >= 400 && /platform-admin only/.test(r.body?.message), r.body?.message);
r = await owner.patch("Clients?id=eq.8", { owner_first_name: "Casey" });
check("owner can still edit allowed fields", r.status === 200 && r.body.length === 1, `status ${r.status}`);

// trg_client_users_role_change_guard
const [mem] = await adminGet("client_users?client_id=eq.8&role=eq.member&select=id,auth_user_id");
r = await member.patch(`client_users?id=eq.${mem.id}`, { role: "owner" });
check("member can't promote themselves (role guard trigger)", r.status >= 400 || r.body.length === 0, r.body?.message ?? "0 rows");
r = await owner.patch(`client_users?id=eq.${mem.id}`, { role: "manager" });
check("owner can still change a role", r.status === 200 && r.body[0]?.role === "manager", `status ${r.status}`);

// client_owner_count, through the client_users delete policy
r = await owner.del(`client_users?id=eq.${mem.id}`);
check("owner can still remove a team member (client_owner_count policy)", r.status === 200 && r.body.length === 1, `status ${r.status} ${JSON.stringify(r.body).slice(0, 80)}`);
