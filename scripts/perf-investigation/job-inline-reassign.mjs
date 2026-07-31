/**
 * Inline reassignment on the job page + actuals-row legibility, at 390px.
 * Seeds its own preconditions, cleans by captured ids only, harness tallies.
 * Usage: node job-inline-reassign.mjs [baseUrl]
 */
import {
  admin, anonClient, url, env, SUPABASE_REF, OUT_DIR, baseUrlFrom,
  CLIENT_ID, REF_CLIENT_ID, SMOKE_ID, SMOKE_EMAIL, FIXTURES, loadPlaywright,
} from "./_config.mjs";
const { chromium } = loadPlaywright();
import { createHarness } from "./_harness.mjs";

const { check, summary, note, capture } = createHarness("inline-reassign");
const BASE = baseUrlFrom(process.argv[2]);
const OUT = OUT_DIR;
const host = new URL(BASE).hostname;
const RID = Math.random().toString(36).slice(2, 6);
const usd = (n) => `$${n.toFixed(2)}`;

const PW = "inl-" + Math.random().toString(36).slice(2, 10) + "-R1!";
await admin.auth.admin.updateUserById(SMOKE_ID, { password: PW });

// Captured ids. capture() journals each one to disk the moment the row exists,
// so a crash between an insert and the cleanup block still leaves an id-based
// recovery path instead of orphans that can only be reported.
const created = { jobs: [], expenses: [], invoices: [] };
const track = (table, id) => { created[table].push(capture(table, id)); return id; };

let job, inv, stockItem, inBidItem, lockedItem;
const browser = await chromium.launch();
try {
  ({ data: job } = await admin.from("jobs").insert({
    client_id: CLIENT_ID, name: `Reassign Probe ${RID}`, status: "in_progress",
    address: "5 Ledger Ln", source: "manual",
  }).select("id").single());
  track("jobs", job.id);

  // The architect's named case: an item sitting in STOCK that must move to IN
  // BID on a job that already has items. Seeded with job_id set so it renders
  // in the job's list while still carrying assignment 'stock'.
  const seedExpense = async (description, amount, assignment) => {
    const { data, error } = await admin.from("expenses").insert({
      client_id: CLIENT_ID, job_id: job.id, expense_date: "2026-07-31",
      category: "Materials & supplies", description, amount, assignment,
    }).select("id").single();
    if (error) throw new Error(`seed expense: ${error.message}`);
    return track("expenses", data.id);
  };
  stockItem = await seedExpense(`Ladder rental ${RID}`, 40, "stock");
  inBidItem = await seedExpense(`Primer 5gal ${RID}`, 100, "job_in_bid");
  await seedExpense(`Wasted caulk ${RID}`, 25, "job_internal");

  // An item frozen onto a FINALIZED invoice — must show locked, not a control.
  const { data: invRow, error: invErr } = await admin.from("invoices").insert({
    client_id: CLIENT_ID, job_id: job.id, invoice_number: `INV-${RID}`, status: "sent",
    customer_name: `Reassign Probe ${RID}`,
  }).select("id, invoice_number").single();
  if (invErr) throw new Error(`seed invoice: ${invErr.message}`);
  inv = invRow;
  track("invoices", inv.id);
  lockedItem = await seedExpense(`Billed trim ${RID}`, 60, "job_extra");
  const { data: stamped, error: stampErr } = await admin
    .from("expenses").update({ invoiced_on: inv.id }).eq("id", lockedItem)
    .select("id, invoiced_on");
  if (stampErr) throw new Error(`stamp invoice: ${stampErr.message}`);
  // An unchecked write here would silently turn the lock probes into a test of
  // an unlocked row that still "passes" for the wrong reason.
  check("precondition: the locked item really is stamped onto the invoice",
    (stamped ?? []).length === 1 && stamped[0].invoiced_on === inv.id,
    JSON.stringify(stamped));

  const anon = anonClient();
  const { data: si } = await anon.auth.signInWithPassword({ email: SMOKE_EMAIL, password: PW });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([{
    name: `sb-${SUPABASE_REF}-auth-token`,
    value: "base64-" + Buffer.from(JSON.stringify(si.session), "utf8").toString("base64url"),
    domain: host, path: "/",
  }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app/jobs/${job.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: `Reassign Probe ${RID}` }).waitFor({ timeout: 25000 });

  // --- 2. locked item shows its state, and is not a control ---
  const lockedRow = page.getByText(`Billed trim ${RID}`);
  await lockedRow.waitFor({ timeout: 10000 });
  check("item on a finalized invoice is NOT tappable",
    (await page.getByRole("button", { name: `Reassign Billed trim ${RID}` }).count()) === 0);
  check("locked item explains itself (invoice number + locked)",
    /locked/i.test(await page.locator("li", { hasText: `Billed trim ${RID}` }).first().innerText()) &&
    (await page.locator("li", { hasText: `Billed trim ${RID}` }).first().innerText()).includes(inv.invoice_number));

  // --- 1. inline reassignment: stock -> in bid, the named case ---
  const stockRow = page.getByRole("button", { name: `Reassign Ladder rental ${RID}` });
  check("expense rows are tappable for owner/manager", (await stockRow.count()) === 1);
  check("row starts collapsed", (await stockRow.getAttribute("aria-expanded")) === "false");

  const splitLine = page.getByText("Materials:", { exact: true }).locator("..");
  const beforeSplit = await splitLine.innerText();
  note(`split before: ${beforeSplit.replace(/\s+/g, " ")}`);
  check("absorbed line starts with in-bid 100 / billed 60 / absorbed 25",
    beforeSplit.includes(usd(100)) && beforeSplit.includes(usd(60)) && beforeSplit.includes(usd(25)),
    beforeSplit.replace(/\s+/g, " "));

  await stockRow.click();
  check("tapping expands the assignment control",
    (await stockRow.getAttribute("aria-expanded")) === "true");
  for (const label of ["In bid", "Extra", "Internal", "Stock"]) {
    check(`control offers "${label}"`,
      (await page.getByRole("button", { name: `Assign to ${label}`, exact: true }).count()) === 1);
  }
  const applyBtn = page.getByRole("button", { name: "Apply" });
  check("Apply is disabled until a different destination is chosen",
    await applyBtn.isDisabled());
  await page.getByRole("button", { name: "Assign to In bid", exact: true }).click();
  check("chosen destination is marked pressed",
    (await page.getByRole("button", { name: "Assign to In bid", exact: true }).getAttribute("aria-pressed")) === "true");
  check("Apply becomes available once the choice differs", await applyBtn.isEnabled());
  await applyBtn.click();

  // --- 3/4. toast + immediate recalculation, no reload ---
  await page.getByRole("status").waitFor({ timeout: 10000 });
  const toast = (await page.getByRole("status").innerText()).trim();
  check("a toast confirms the move", /moved to in bid/i.test(toast), toast);

  await splitLine.filter({ hasText: usd(140) }).waitFor({ timeout: 10000 });
  const afterSplit = await splitLine.innerText();
  note(`split after: ${afterSplit.replace(/\s+/g, " ")}`);
  check("in-bid figure recalculates immediately (100 -> 140)",
    afterSplit.includes(usd(140)), afterSplit.replace(/\s+/g, " "));
  const { data: rowNow } = await admin.from("expenses").select("assignment, job_id").eq("id", stockItem).single();
  check("the write landed on the same ledger row (stock -> job_in_bid)",
    rowNow.assignment === "job_in_bid" && rowNow.job_id === job.id,
    `${rowNow.assignment} job=${rowNow.job_id}`);

  // --- 3. moving to stock removes the row, and says so ---
  const inBidRow = page.getByRole("button", { name: `Reassign Primer 5gal ${RID}` });
  await inBidRow.click();
  await page.getByRole("button", { name: "Assign to Stock", exact: true }).click();
  await page.getByRole("button", { name: "Apply" }).click();
  await page.waitForFunction(
    (d) => !document.body.innerText.includes(d), `Primer 5gal ${RID}`, { timeout: 10000 });
  check("moving to stock removes the item from the job list", true);
  const stockToast = (await page.getByRole("status").innerText()).trim();
  check("the vanishing row is explained by a toast naming stock",
    /moved to stock/i.test(stockToast), stockToast);
  // The screenshot caught the toast sitting on top of the bottom nav; assert
  // the clearance so it can't drift back.
  const toastBox = await page.getByRole("status").boundingBox();
  const navBox = await page.locator("nav.fixed.bottom-0").first().boundingBox();
  check("the toast clears the mobile nav instead of covering it",
    !!toastBox && !!navBox && toastBox.y + toastBox.height <= navBox.y + 1,
    `toast bottom=${Math.round((toastBox?.y ?? 0) + (toastBox?.height ?? 0))} nav top=${Math.round(navBox?.y ?? 0)}`);
  const { data: stockNow } = await admin.from("expenses").select("assignment, job_id").eq("id", inBidItem).single();
  check("stock detaches the item from the job (job_id null)",
    stockNow.assignment === "stock" && stockNow.job_id === null,
    `${stockNow.assignment} job=${stockNow.job_id}`);

  // --- 5. actuals entry row legibility ---
  const actuals = page.locator("input[type=date]").last();
  await actuals.waitFor({ timeout: 10000 });
  const noteInput = page.getByLabel("Note (optional)");
  check("note field exists with a full, readable placeholder",
    (await noteInput.count()) === 1);
  const noteBox = await noteInput.boundingBox();
  const dateBox = await actuals.boundingBox();
  note(`note ${Math.round(noteBox.width)}px @y${Math.round(noteBox.y)}, date ${Math.round(dateBox.width)}px @y${Math.round(dateBox.y)}`);
  check("note field is on its own row below date/hours",
    noteBox.y > dateBox.y + dateBox.height - 2,
    `note y=${Math.round(noteBox.y)} date bottom=${Math.round(dateBox.y + dateBox.height)}`);
  check("note field is full width, not compressed to a character",
    noteBox.width > 250, `${Math.round(noteBox.width)}px`);
  const bodyText = await page.locator("body").innerText();
  // Plain substring, not a regex: "Note (optional)" as a pattern turns the
  // parentheses into a capture group and silently searches for "Note optional".
  const haystack = bodyText.toLowerCase();
  for (const label of ["Date", "Hours", "Note (optional)"]) {
    check(`"${label}" is labelled visibly`, haystack.includes(label.toLowerCase()));
  }
  check("the Add control names itself",
    (await page.getByRole("button", { name: "Log time" }).innerText()).trim().toLowerCase().includes("log time"));

  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth);
  check("no horizontal overflow at 390px", !overflow);
  await page.screenshot({ path: `${OUT}/inline-reassign-390.png`, fullPage: true });
  note("screenshot: inline-reassign-390.png");

  await ctx.close();
} catch (e) {
  check("run completed without exception", false, String(e).slice(0, 300));
} finally {
  await browser.close();
  for (const id of created.expenses) await admin.from("expenses").delete().eq("id", id);
  for (const id of created.invoices) await admin.from("invoices").delete().eq("id", id);
  for (const id of created.jobs) {
    await admin.from("job_status_log").delete().eq("job_id", id);
    await admin.from("jobs").delete().eq("id", id);
  }
  await admin.auth.admin.updateUserById(SMOKE_ID, { password: "reset-" + Math.random().toString(36) });
  const { data: le } = await admin.from("expenses").select("id").in("id", created.expenses);
  const { data: lj } = await admin.from("jobs").select("id").in("id", created.jobs);
  check("zero residue (captured ids only)",
    (le ?? []).length === 0 && (lj ?? []).length === 0);
}

process.exit(summary());
