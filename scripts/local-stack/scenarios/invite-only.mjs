// Invite-only: no public sign-up, no /onboard; an owner adding someone new
// makes their login, and they get in through "Forgot password?".
import { readdirSync, readFileSync } from "node:fs";
import { APP, PHONE, check, launch, login } from "./browser.mjs";
import { adminCall, adminGet } from "./api.mjs";

const MAIL = `${process.env.FIELDSTACK ?? "/opt/fieldstack"}/mail`;
const env = Object.fromEntries(
  readFileSync(new URL("../../../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const AUTH = `${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const NEW_EMAIL = `crew-${Date.now()}@cascade.test`;

const mailsTo = (email) => readdirSync(MAIL).sort()
  .map((f) => readFileSync(`${MAIL}/${f}`, "utf8"))
  .filter((m) => m.startsWith(`X-To: ${email}`));
// Quoted-printable: undo soft breaks and =3D, then take the reset link.
const resetLink = (mail) => {
  const html = mail.replace(/=\r?\n/g, "").replace(/=3D/g, "=");
  return html.match(/href="([^"]+)"/)[1].replace(/&amp;/g, "&");
};
const eventually = async (fn, ms = 15000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > end) return v;
    await new Promise((r) => setTimeout(r, 300));
  }
};

// --- Nobody can sign themselves up -------------------------------------------------------
const signup = await fetch(`${AUTH}/signup`, {
  method: "POST", headers: { apikey: ANON, "content-type": "application/json" },
  body: JSON.stringify({ email: "rando@nowhere.test", password: "long-enough-password" }),
});
check("the auth service refuses public sign-up (as prod will once the switch is off)", signup.status === 422, String(signup.status));

const browser = await launch();
const anon = await (await browser.newContext({ viewport: PHONE })).newPage();
for (const path of ["/signup", "/onboard"]) {
  check(`${path} is gone (signed out)`, (await anon.request.get(`${APP}${path}`, { maxRedirects: 0 })).status() === 404);
}
check("POST /api/onboard is gone", (await anon.request.post(`${APP}/api/onboard`, { data: {} })).status() === 404);
await anon.goto(`${APP}/login`);
const loginText = await anon.locator("main").innerText();
check("sign-in has no Create account or Request setup links",
  (await anon.locator('a[href="/signup"], a[href="/onboard"]').count()) === 0 && /invite-only/i.test(loginText), loginText.slice(-160).replace(/\n/g, " "));

// --- Owner adds someone with no login --------------------------------------------------------
const owner = await login(browser, "owner@cascade.test", PHONE);
check("/signup is gone (signed in)", (await owner.request.get(`${APP}/signup`, { maxRedirects: 0 })).status() === 404);
await owner.goto(`${APP}/app/settings`);
await owner.waitForLoadState("networkidle");
await owner.getByRole("button", { name: "Add team member" }).click();
await owner.fill('input[placeholder="member@example.com"]', NEW_EMAIL);
await owner.getByRole("button", { name: "Add member", exact: true }).click();
const msg = await eventually(async () => {
  const t = await owner.locator("body").innerText();
  return /added as member/.test(t) ? t : null;
});
check("adding a new email makes their login and says how to get in",
  !!msg && /Forgot password\?/.test(msg), (msg ?? "").match(/[^\n]*added as[^\n]*/)?.[0] ?? "no message");
const users = await (await fetch(`${AUTH}/admin/users?per_page=1000`, {
  headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
})).json();
const crew = users.users.find((u) => u.email === NEW_EMAIL);
const membership = crew ? await adminGet(`client_users?auth_user_id=eq.${crew.id}&select=client_id,role`) : [];
check("their login exists and they're a member of Cascade only",
  !!crew && membership.length === 1 && membership[0].client_id === 8 && membership[0].role === "member", JSON.stringify(membership));
const noPassword = await fetch(`${AUTH}/token?grant_type=password`, {
  method: "POST", headers: { apikey: ANON, "content-type": "application/json" },
  body: JSON.stringify({ email: NEW_EMAIL, password: "" }),
});
check("the new login has no password anyone can use", noPassword.status === 400);

// Adding an existing login says nothing about passwords.
await owner.getByRole("button", { name: "Add team member" }).click();
await owner.fill('input[placeholder="member@example.com"]', "owner@other.test");
await owner.getByRole("button", { name: "Add member", exact: true }).click();
const msg2 = await eventually(async () => {
  const t = await owner.locator("body").innerText();
  return /owner@other\.test added as member/.test(t) ? t : null;
});
check("adding someone who already has a login just adds them", !!msg2 && !/Forgot password\?" and set one/.test(msg2.match(/[^\n]*owner@other\.test added as[^\n]*/)?.[0] ?? ""));
await adminCall("DELETE", "client_users?client_id=eq.8&auth_user_id=eq." +
  users.users.find((u) => u.email === "owner@other.test").id);

// --- They get in through Forgot password ---------------------------------------------------------
const crewPage = await (await browser.newContext({ viewport: PHONE })).newPage();
crewPage.setDefaultTimeout(60_000);
await crewPage.goto(`${APP}/login`);
await crewPage.getByRole("link", { name: "Forgot password?" }).click();
await crewPage.waitForURL(/\/reset-password/);
await crewPage.fill('input[type="email"]', NEW_EMAIL);
await crewPage.keyboard.press("Enter");
await crewPage.getByText("Reset link sent").waitFor();
const mail = await eventually(() => mailsTo(NEW_EMAIL)[0]);
check("the reset email arrives", !!mail);
await crewPage.goto(resetLink(mail));
await crewPage.waitForURL(/\/reset-password\/update/);
await crewPage.fill("#password", "crew-password-123");
await crewPage.fill("#confirm", "crew-password-123");
await Promise.all([crewPage.waitForURL(/\/app$/), crewPage.keyboard.press("Enter")]);
await crewPage.waitForLoadState("networkidle");
const crewHome = await crewPage.locator("body").innerText();
check("they set a password and land in Cascade's Home", !/not on a team yet/.test(crewHome) && /Open jobs/.test(crewHome));
const pw = await fetch(`${AUTH}/token?grant_type=password`, {
  method: "POST", headers: { apikey: ANON, "content-type": "application/json" },
  body: JSON.stringify({ email: NEW_EMAIL, password: "crew-password-123" }),
});
check("and can sign in with it afterwards", pw.status === 200);

// The callback only follows paths on this site: ask for a reset the way the
// app does (so the browser holds the code verifier), then point the emailed
// link's next at "@example.com".
await crewPage.context().clearCookies();
await crewPage.goto(`${APP}/reset-password`);
await crewPage.fill('input[type="email"]', NEW_EMAIL);
await crewPage.keyboard.press("Enter");
await crewPage.getByText("Reset link sent").waitFor();
const mail2 = await eventually(() => mailsTo(NEW_EMAIL)[1]);
const link2 = new URL(resetLink(mail2));
const back = new URL(link2.searchParams.get("redirect_to"));
back.searchParams.set("next", "@example.com");
link2.searchParams.set("redirect_to", back.toString());
await crewPage.goto(link2.toString());
await crewPage.waitForLoadState("networkidle");
check("a next of @example.com stays on Field, signed in", new URL(crewPage.url()).host === new URL(APP).host && /\/app/.test(crewPage.url()), crewPage.url());

// --- Admin console still works ---------------------------------------------------------------------
await adminCall("PATCH", "Clients?id=eq.8", { is_active: true });
await adminCall("PATCH", "Clients?id=eq.9", { is_active: false });
const ap = await login(browser, "admin@other.test", PHONE);
await ap.goto(`${APP}/admin/clients`);
await ap.waitForLoadState("networkidle");
const adminText = await ap.locator("main").innerText();
const [activePart, inactivePart] = adminText.split(/\nInactive\n/);
check("admin clients: Cascade under Active, Other under Inactive, no intake queue",
  /Cascade/.test(activePart) && /Other Tenant/.test(inactivePart ?? "") && !/Other Tenant/.test(activePart) &&
  !/Pending intake|Reject/i.test(adminText), adminText.slice(0, 240).replace(/\n/g, " "));
await ap.goto(`${APP}/admin/clients/8`);
await ap.waitForLoadState("networkidle");
check("admin client page still opens", /Estimator/.test(await ap.locator("body").innerText()));
await adminCall("PATCH", "Clients?id=eq.9", { is_active: true });
await browser.close();
