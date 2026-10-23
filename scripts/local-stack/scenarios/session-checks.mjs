// Sessions after the speed batch: middleware verifies the session in memory
// (getClaims) instead of asking Supabase Auth. Needs a stack started with
// short sessions: LOCAL_JWT_EXP=180 up.sh (see session-checks.sh); shorter than
// 90 s is below supabase-js' refresh margin, so every request would refresh.
//   - a signed-out visitor lands on login
//   - signing out works, and the app sends you to login afterwards
//   - an expired session is refreshed on the next tap, with no sign-in
//   - signing out on one device leaves another signed in only until its
//     access token expires, then it lands on login
//   - a tampered token is treated as signed out
import { APP, PASSWORD, check, launch } from "./browser.mjs";

const EMAIL = "owner@cascade.test";
const browser = await launch();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function device() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);
  return { ctx, page };
}
async function signIn(page) {
  await page.goto(`${APP}/login`);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await Promise.all([page.waitForURL((u) => new URL(u).pathname.startsWith("/app")), page.keyboard.press("Enter")]);
}
async function tokenOf(ctx) {
  const parts = (await ctx.cookies()).filter((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token")).sort((a, b) => a.name.localeCompare(b.name));
  if (!parts.length) return null;
  let v = decodeURIComponent(parts.map((c) => c.value).join(""));
  if (v.startsWith("base64-")) v = Buffer.from(v.slice(7), "base64url").toString("utf8");
  const session = JSON.parse(v);
  const claims = JSON.parse(Buffer.from(session.access_token.split(".")[1], "base64url").toString("utf8"));
  return { access: session.access_token, exp: claims.exp };
}
const path = (page) => new URL(page.url()).pathname;

// 1. Signed out: every app page lands on login.
{
  const { ctx, page } = await device();
  for (const p of ["/app", "/app/jobs", "/app/jobs/1", "/app/estimator/invoices", "/app/calendar"]) {
    await page.goto(`${APP}${p}`);
    check(`signed out: ${p} lands on login`, path(page) === "/login", path(page));
  }
  await ctx.close();
}

// 2. Sign out works.
{
  const { ctx, page } = await device();
  await signIn(page);
  await page.goto(`${APP}/app/jobs`);
  check("signed in: Jobs opens", path(page) === "/app/jobs");
  const res = await page.request.post(`${APP}/auth/logout`, { maxRedirects: 0 });
  check("sign out answers with a redirect to login", res.status() === 303 && (res.headers().location ?? "").endsWith("/login"), String(res.status()));
  await page.goto(`${APP}/app/jobs`);
  check("after signing out, Jobs lands on login", path(page) === "/login", path(page));
  await ctx.close();
}

// 3. Expired session: the next tap refreshes it.
{
  const { ctx, page } = await device();
  await signIn(page);
  const before = await tokenOf(ctx);
  const left = before.exp * 1000 - Date.now();
  check("sessions are short for this test (LOCAL_JWT_EXP=180)", left > 0 && left <= 181_000, `${Math.round(left / 1000)} s left`);
  await wait(left + 3_000);
  await page.goto(`${APP}/app/jobs`);
  const after = await tokenOf(ctx);
  check("an expired session is refreshed on the next tap, still signed in",
    path(page) === "/app/jobs" && !!after && after.access !== before.access && after.exp * 1000 > Date.now(),
    `${path(page)} new token ${after?.access !== before.access}`);
  await page.locator("main h1").waitFor();
  check("…and the page has its content", (await page.locator("main h1").innerText()).length > 0);
  await ctx.close();
}

// 4. Two devices: sign out on one; the other keeps its access token until it
//    expires, then lands on login (its refresh token was revoked).
{
  const a = await device();
  const b = await device();
  await signIn(a.page);
  await signIn(b.page);
  const bToken = await tokenOf(b.ctx);
  await a.page.request.post(`${APP}/auth/logout`, { maxRedirects: 0 });
  await b.page.goto(`${APP}/app/jobs`);
  check("other device right after the sign-out: still signed in (token not expired yet)", path(b.page) === "/app/jobs", path(b.page));
  await wait(Math.max(0, bToken.exp * 1000 - Date.now()) + 3_000);
  await b.page.goto(`${APP}/app/jobs`);
  check("other device once its token expires: lands on login", path(b.page) === "/login", path(b.page));
  await a.ctx.close();
  await b.ctx.close();
}

// 5. A tampered token is not trusted.
{
  const { ctx, page } = await device();
  await signIn(page);
  const cookies = (await ctx.cookies()).filter((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
  let v = decodeURIComponent(cookies.sort((x, y) => x.name.localeCompare(y.name)).map((c) => c.value).join(""));
  v = Buffer.from(v.slice(7), "base64url").toString("utf8");
  const session = JSON.parse(v);
  const [h, p, s] = session.access_token.split(".");
  const claims = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  claims.sub = "00000000-0000-0000-0000-000000000000";
  session.access_token = [h, Buffer.from(JSON.stringify(claims)).toString("base64url"), s].join(".");
  session.refresh_token = "not-a-real-refresh-token";
  await ctx.clearCookies();
  await ctx.addCookies([{ name: cookies[0].name.replace(/\.\d+$/, ""), value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: APP }]);
  await page.goto(`${APP}/app/jobs`);
  check("a token with a forged user id lands on login", path(page) === "/login", path(page));
  await ctx.close();
}

await browser.close();
