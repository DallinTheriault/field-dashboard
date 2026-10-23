// Owner-only content stays hidden from a member after the speed batch, where
// pages run their queries alongside the role lookup. Renders each page as the
// member and as the owner on two builds (before and after) and requires the
// same page text, and checks the member's page data carries no owner-only
// fields. Usage: node role-gating.mjs <beforeUrl> <afterUrl> [jobId]
import { launch, check, PASSWORD } from "./browser.mjs";
import { session } from "./api.mjs";

const [BEFORE, AFTER, JOB = "3"] = process.argv.slice(2);
const owner = await session("owner@cascade.test");

// Money on the job: hours, materials billed to the customer, a priced line, an estimate.
await owner.post("time_entries", { client_id: 8, job_id: Number(JOB), entry_date: "2026-10-20", hours: 2.5, note: "gating check" });
await owner.post("expenses", {
  client_id: 8, job_id: Number(JOB), description: "Gating check valve", amount: 42.5, qty: 1, unit_price: 42.5,
  assignment: "job_extra", category: "Materials & supplies", expense_date: "2026-10-20",
});
await owner.post("tasks", { client_id: 8, job_id: Number(JOB), title: "Gating check line", status: "done", qty: 1, unit: "each", unit_price: 333, billable: true, sort_order: 9 });

const PAGES = ["/app", "/app/jobs", `/app/jobs/${JOB}`, "/app/estimator/invoices", "/app/estimator/expenses", "/app/estimator/mileage", "/app/calendar", "/app/contacts", "/app/settings", "/app/estimator"];
// Fields only owners and managers may receive.
const OWNER_ONLY = ["default_hourly_rate", "skilled_hourly_rate", "material_markup_pct", "ready_count", "Gating check valve", "gating check", "2.5", "total_cents", "Ready to invoice", "Owed"];

const browser = await launch();
async function view(base, email) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);
  await page.goto(`${base}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await Promise.all([page.waitForURL((u) => new URL(u).pathname.startsWith("/app")), page.keyboard.press("Enter")]);
  const out = {};
  for (const p of PAGES) {
    await page.goto(`${base}${p}`);
    await page.waitForLoadState("networkidle");
    // The old job page loaded its hours panel after showing; let both settle.
    await page.waitForTimeout(1500);
    const where = new URL(page.url()).pathname;
    const text = (await page.locator("main").innerText().catch(() => "")).replace(/\d+ (s|m|h)(ec)? ago|just now/g, "").replace(/\s+/g, " ").trim();
    const rsc = await (await page.request.get(`${base}${p}${p.includes("?") ? "&" : "?"}_rsc=g`, { headers: { RSC: "1" } })).text();
    out[p] = { where, text, rsc };
  }
  await ctx.close();
  return out;
}

for (const email of ["member@cascade.test", "owner@cascade.test"]) {
  const before = await view(BEFORE, email);
  const after = await view(AFTER, email);
  for (const p of PAGES) {
    const b = before[p];
    const a = after[p];
    // The calendar's Google Calendar card and Settings' removed section are the only intended differences.
    const same = a.where === b.where && (a.text === b.text || (p === "/app/settings" && b.text.includes("Google Calendar") && !a.text.includes("Google Calendar")));
    check(`${email.split("@")[0]} ${p}: lands on ${a.where}, same page as before`, same, same ? "" : `before ${b.where} [${b.text.slice(0, 160)}] after ${a.where} [${a.text.slice(0, 160)}]`);
    if (email.startsWith("member")) {
      const leaked = OWNER_ONLY.filter((f) => a.rsc.includes(f) && !b.rsc.includes(f));
      check(`member ${p}: page data carries nothing owner-only that it didn't before`, leaked.length === 0, leaked.join(", "));
    }
  }
}
await browser.close();
