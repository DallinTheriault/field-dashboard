// Create the local test logins through the Auth admin API, so they sign in
// exactly like real users. Owners are linked to their tenant by the
// handle_auth_user_link trigger (owner_email); the member is linked here.
// Env: SUPABASE_URL (the gateway), SERVICE_KEY.
const url = process.env.SUPABASE_URL;
const key = process.env.SERVICE_KEY;
export const PASSWORD = "local-stack-only";

const users = [
  { email: "owner@cascade.test" },
  { email: "member@cascade.test", clientId: 8, role: "member" },
  { email: "owner@other.test" },
  // Platform admin (ADMIN_EMAILS in the stack's .env.local), for /admin checks.
  { email: "admin@other.test", clientId: 9, role: "manager" },
];

const headers = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };

for (const u of users) {
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email: u.email, password: PASSWORD, email_confirm: true }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`create ${u.email}: ${res.status} ${JSON.stringify(body)}`);
  if (u.clientId) {
    const link = await fetch(`${url}/rest/v1/client_users`, {
      method: "POST",
      headers,
      body: JSON.stringify({ auth_user_id: body.id, client_id: u.clientId, role: u.role }),
    });
    if (!link.ok) throw new Error(`link ${u.email}: ${link.status} ${await link.text()}`);
  }
  console.log(`user ${u.email}`);
}
