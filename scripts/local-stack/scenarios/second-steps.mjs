// A save's second step that fails is said on screen ("Saved, but … didn't:
// …"), and the save itself stands (no failure, no duplicate on retry).
// Run by second-steps.sh with the gateway failing one table's PATCHes:
//   jobs      saving an estimate (the job's price and status), accepting it
//             (the job's status), making a draft (the job's letterhead)
//   contacts  marking an invoice sent (the customer's card-link choice)
// Usage: node second-steps.mjs jobs|contacts
import { APP, PHONE, check, launch, login } from "./browser.mjs";
import { adminCall, adminGet, session } from "./api.mjs";

const phase = process.argv[2];
const owner = await session("owner@cascade.test");
const RUN = Date.now().toString(36);
const browser = await launch();
const page = await login(browser, "owner@cascade.test", PHONE);
const note = page.getByTestId("second-step-warning");

if (phase === "jobs") {
  await owner.patch("pricing_settings?client_id=eq.8", { default_hourly_rate: 110, skilled_hourly_rate: 125 });
  const job = (await owner.post("jobs", { client_id: 8, name: `Second ${RUN}`, status: "lead", source: "manual" })).body[0];

  // Estimate saved; the job's quoted price and status can't follow.
  await page.goto(`${APP}/app/estimator/new?job=${job.id}`);
  await page.getByPlaceholder("Search catalog…").waitFor();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Service (hours)" }).click();
  await page.getByPlaceholder("Describe the work…").fill("Second step check");
  await page.locator('input[placeholder="0"]').last().fill("2");
  await Promise.all([page.waitForURL(/\/app\/estimator\/\d+\?warn=/), page.getByRole("button", { name: "Save estimate" }).click()]);
  const estimateId = Number(new URL(page.url()).pathname.split("/").pop());
  await note.waitFor();
  const ests = await adminGet(`estimates?job_id=eq.${job.id}&select=id,computed_price`);
  const jobAfter = (await adminGet(`jobs?id=eq.${job.id}&select=quoted_price`))[0];
  check("saving an estimate whose job can't follow: saved once, and the page says the job didn't update",
    /^Saved, but the job's quoted price and status didn't update: /.test(await note.innerText()) &&
    ests.length === 1 && ests[0].id === estimateId && jobAfter.quoted_price === null,
    `${await note.innerText()} | ${ests.length} estimate(s)`);

  // Accepted; the job's status can't move.
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Accepted" }).click();
  const acceptNote = page.getByTestId("second-step-warning").filter({ hasText: "Marked accepted" });
  await acceptNote.waitFor({ timeout: 15_000 }).catch(() => {});
  const est = (await adminGet(`estimates?id=eq.${estimateId}&select=status`))[0];
  check("accepting it: accepted, and the page says the job's status didn't move",
    est.status === "accepted" && (await acceptNote.count()) === 1 &&
    /^Marked accepted, but the job's status didn't move to Accepted: /.test(await acceptNote.innerText()),
    `${est.status} | ${(await acceptNote.count()) ? await acceptNote.innerText() : "no note"}`);

  // A draft made; the job can't keep its letterhead.
  await page.goto(`${APP}/app/jobs/${job.id}/invoice`);
  await page.getByTestId("invoice-preview").waitFor();
  await page.waitForLoadState("networkidle");
  await Promise.all([page.waitForURL(/\/app\/estimator\/invoices\/\d+\?warn=/), page.getByRole("button", { name: "Create draft" }).click()]);
  await note.waitFor();
  const drafts = await adminGet(`invoices?job_id=eq.${job.id}&select=id,status`);
  check("making a draft whose job can't keep its letterhead: one draft, and the page says so",
    drafts.length === 1 && /^Draft made, but the job didn't keep this letterhead for next time: /.test(await note.innerText()),
    `${drafts.length} draft(s) | ${await note.innerText()}`);
}

if (phase === "contacts") {
  await page.addInitScript(() => {
    navigator.canShare = () => true;
    navigator.share = async () => {};
  });
  const contact = (await owner.post("contacts", { client_id: 8, name: `Payer ${RUN}`, email: `payer-${RUN}@example.com` })).body[0];
  const job = (await owner.post("jobs", { client_id: 8, name: `Sent ${RUN}`, status: "completed", source: "manual", contact_id: contact.id })).body[0];
  const entity = (await adminGet("billing_entities?client_id=eq.8&active=is.true&select=id&order=id&limit=1"))[0].id;
  const created = (await owner.post("rpc/invoice_create_from_job", { p: {
    client_id: 8, job_id: job.id, billing_entity_id: entity, bill_to_contact_id: contact.id, customer_name: contact.name,
    line_items: [{ description: "Second step check", qtyLabel: null, amount: 75 }],
    subtotal_cents: 7500, tax_rate_pct: 0, tax_cents: 0, total_cents: 7500,
  } })).body;
  await page.goto(`${APP}/app/estimator/invoices/${created.invoice_id}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Share invoice" }).click();
  await page.getByText("Shared. Did it go out?").waitFor();
  await Promise.all([page.waitForURL(/\?warn=/), page.getByRole("button", { name: "Mark as sent" }).click()]);
  await note.waitFor();
  const inv = (await adminGet(`invoices?id=eq.${created.invoice_id}&select=status`))[0];
  check("marking it sent when the card-link choice can't be saved: sent, and the page says the choice wasn't saved",
    inv.status === "sent" && /^Marked sent, but the customer's card-link choice wasn't saved for next time: /.test(await note.innerText()),
    `${inv.status} | ${await note.innerText()}`);
}

await browser.close();
