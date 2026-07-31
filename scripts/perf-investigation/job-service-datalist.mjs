/**
 * Service-input autocomplete — datalist wiring + multi-tenant containment.
 * Seeds its own preconditions, cleans by captured ids only, harness tallies.
 * Usage: node job-service-datalist.mjs [baseUrl]
 */
import {
  admin, anonClient, SUPABASE_REF, baseUrlFrom,
  CLIENT_ID, SMOKE_ID, SMOKE_EMAIL, loadPlaywright,
} from "./_config.mjs";
const { chromium } = loadPlaywright();
import { createHarness } from "./_harness.mjs";

const { check, summary, note, capture } = createHarness("service-datalist");
const BASE = baseUrlFrom(process.argv[2]);
const host = new URL(BASE).hostname;
const RID = Math.random().toString(36).slice(2, 6);

// the smoke tenant's vocabulary, deliberately nothing to do with painting: the list is
// built from tenant data, so a non-painting tenant must see non-painting words.
const SVC_COMMON = `Furnace tune-up ${RID}`;   // seeded twice -> must rank first
const SVC_RARE = `Duct cleaning ${RID}`;       // seeded once
const SVC_NEW = `Boiler swap ${RID}`;          // never seeded -> free text must still save
// Values belonging to OTHER tenants and to no smoke-tenant job — derived, never
// hardcoded: a guessed list silently passes when the guess is wrong, and
// wrongly fails when the other tenant happens to share a word.
const { data: allSvc } = await admin.from("jobs").select("client_id, service").not("service", "is", null);
const mine = new Set(allSvc.filter((r) => r.client_id === CLIENT_ID).map((r) => r.service.trim().toLowerCase()));
const FOREIGN = [...new Set(
  allSvc.filter((r) => r.client_id !== CLIENT_ID)
    .map((r) => r.service.trim())
    .filter((s) => !mine.has(s.toLowerCase())),
)];
if (FOREIGN.length === 0) throw new Error("precondition: no foreign service values exist to test containment against");

const PW = "svc-" + Math.random().toString(36).slice(2, 10) + "-S1!";
await admin.auth.admin.updateUserById(SMOKE_ID, { password: PW });

const made = [];
async function seedJob(service) {
  const { data } = await admin.from("jobs").insert({
    client_id: CLIENT_ID, name: `Svc Probe ${RID} ${made.length}`, status: "lead",
    address: "1 Probe St", source: "manual", service,
  }).select("id").single();
  made.push(capture("jobs", data.id));
  return data.id;
}
const editTarget = await seedJob(SVC_COMMON);
await seedJob(SVC_COMMON);
await seedJob(SVC_RARE);

const browser = await chromium.launch();
try {
  const anon = anonClient();
  const { data: si } = await anon.auth.signInWithPassword({ email: SMOKE_EMAIL, password: PW });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([{
    name: `sb-${SUPABASE_REF}-auth-token`,
    value: "base64-" + Buffer.from(JSON.stringify(si.session), "utf8").toString("base64url"),
    domain: host, path: "/",
  }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app/jobs/${editTarget}/edit`, { waitUntil: "domcontentloaded" });
  const input = page.locator('input[list="job-service-options"]');
  await input.waitFor({ timeout: 25000 });

  check("service input is wired to the datalist", (await input.count()) === 1);
  check("input is still free text (no select, no readonly/pattern constraint)",
    (await input.evaluate((el) => el.tagName)) === "INPUT" &&
    !(await input.evaluate((el) => el.hasAttribute("readonly") || el.hasAttribute("pattern"))));
  check("the input still holds the job's current value",
    (await input.inputValue()) === SVC_COMMON);

  const options = await page.locator("#job-service-options option").evaluateAll(
    (els) => els.map((e) => e.value));
  note(`datalist (${options.length}): ${options.slice(0, 8).join(" | ")}`);
  check("suggestions include the tenant's own seeded values",
    options.includes(SVC_COMMON) && options.includes(SVC_RARE));
  check("most-used value ranks above the rarer one",
    options.indexOf(SVC_COMMON) < options.indexOf(SVC_RARE),
    `${options.indexOf(SVC_COMMON)} < ${options.indexOf(SVC_RARE)}`);
  check("no value never typed by this tenant is suggested",
    !options.includes(SVC_NEW));
  check("no other tenant's service values leak in (multi-tenant containment)",
    FOREIGN.every((f) => !options.some((o) => o.toLowerCase() === f.toLowerCase())),
    FOREIGN.join(", "));
  check("suggestions are deduped", new Set(options).size === options.length);
  check("no empty suggestion", options.every((o) => o.trim().length > 0));

  // Free text must still win: type a value that is in no list and save it.
  await input.fill(SVC_NEW);
  await page.getByRole("button", { name: "Save changes" }).click();
  // Wait for the form's own "Saved" confirmation — a fixed timeout races the
  // dev-mode round trip and reads the pre-save value.
  await page.getByText("Saved", { exact: true }).waitFor({ timeout: 20000 });
  const { data: after } = await admin.from("jobs").select("service").eq("id", editTarget).single();
  check("a value not in the list still saves (free text preserved)",
    after.service === SVC_NEW, String(after.service));

  // ...and having been typed once, it is now offered back.
  await page.goto(`${BASE}/app/jobs/${editTarget}/edit`, { waitUntil: "domcontentloaded" });
  await input.waitFor({ timeout: 20000 });
  const options2 = await page.locator("#job-service-options option").evaluateAll(
    (els) => els.map((e) => e.value));
  check("a newly typed value joins the tenant's own suggestions",
    options2.includes(SVC_NEW));

  await ctx.close();
} catch (e) {
  check("run completed without exception", false, String(e).slice(0, 300));
} finally {
  await browser.close();
  for (const id of made) {
    await admin.from("job_status_log").delete().eq("job_id", id);
    await admin.from("jobs").delete().eq("id", id);
  }
  await admin.auth.admin.updateUserById(SMOKE_ID, { password: "reset-" + Math.random().toString(36) });
  const { data: left } = await admin.from("jobs").select("id").in("id", made);
  check("zero residue (captured ids only)", (left ?? []).length === 0);
}

process.exit(summary());
