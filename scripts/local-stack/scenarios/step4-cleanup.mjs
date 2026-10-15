// Step 4: receptionist, texting and subscription billing removed; new Home
// and phone nav. Run through step4.sh (fresh stack, every migration).
import { APP, PHONE, check, launch, login } from "./browser.mjs";
import { adminCall, adminGet, session } from "./api.mjs";

const owner = await session("owner@cascade.test");
await adminCall("PATCH", "Clients?id=eq.8", { feature_calendar_enabled: true, feature_receipt_ai_enabled: true });
const entityId = (await adminGet("billing_entities?client_id=eq.8&select=id"))[0].id;

// --- Data for Home's lists ----------------------------------------------------------------
const job = async (name, status, extra = {}) =>
  (await owner.post("jobs", { client_id: 8, name, status, source: "manual", address: `${name} St`, ...extra })).body[0];
const openJob = await job("Open Olive", "scheduled", { start_datetime: "2026-11-02T16:00:00Z" });
const linesJob = await job("Lines Larry", "in_progress");
await owner.post("tasks", { client_id: 8, job_id: linesJob.id, title: "Patch", unit: "each", qty: 2, unit_price: 95, billable: true, status: "done", sort_order: 1 });
const doneJob = await job("Done Dana", "completed");
const sentJob = await job("Sent Sam", "completed");
const draftJob = await job("Drafty Drew", "completed");
const invoiceFor = async (jobId, cents) => {
  const r = await owner.post("rpc/invoice_create_from_job", { p: {
    client_id: 8, job_id: jobId, billing_entity_id: entityId, customer_name: "Pat",
    line_items: [{ description: "Work", amount: cents / 100 }], subtotal_cents: cents, tax_rate_pct: 0, tax_cents: 0, total_cents: cents,
  } });
  return Number(r.body.invoice_id);
};
const sentInv = await invoiceFor(sentJob.id, 30000);
await owner.patch(`invoices?id=eq.${sentInv}`, { status: "sent" });
await adminCall("PATCH", `invoices?id=eq.${sentInv}`, { sent_at: "2026-10-01T18:00:00Z" });
await owner.post("payments", { client_id: 8, invoice_id: sentInv, received_on: "2026-10-05", amount_cents: 10000, method: "check" });
const draftInv = await invoiceFor(draftJob.id, 5000);
const draftNumber = (await adminGet(`invoices?id=eq.${draftInv}&select=invoice_number`))[0].invoice_number;
const contact = (await owner.post("contacts", { client_id: 8, name: "Phoebe Phone", phone: "+18015550123" })).body[0];
await adminCall("POST", "notifications", { client_id: 8, kind: "sms_received", title: "Old text", body: "from the receptionist" });
await adminCall("POST", "notifications", { client_id: 8, kind: "invoice_paid", title: "Invoice CAS paid", body: "$1", link_url: `/app/estimator/invoices/${sentInv}` });

const browser = await launch();
const page = await login(browser, "owner@cascade.test", PHONE);
const status = async (path, method = "GET") => (await page.request.fetch(`${APP}${path}`, { method, maxRedirects: 0 })).status();

// --- Gone ------------------------------------------------------------------------------------
for (const path of ["/app/calls", "/app/messages", "/app/billing", "/app/settings/prompt"]) {
  check(`${path} is gone`, (await status(path)) === 404);
}
for (const path of ["/api/twilio/sms/inbound", "/api/twilio/sms/scheduled-tick", "/api/stripe/portal", "/api/stripe/payment-link", "/api/cron/keepwarm"]) {
  check(`${path} is gone`, (await status(path, "POST")) === 404);
}

// --- Home ----------------------------------------------------------------------------------------
await page.goto(`${APP}/app`);
await page.waitForLoadState("networkidle");
const tiles = await page.locator('[aria-label="Start something"] .home-tile').allInnerTexts();
check("Home starts with New job, Scan receipt, New contact", tiles.map((t) => t.trim()).join("|") === "New job|Scan receipt|New contact", tiles.join("|"));
const small = await page.locator(".home-tile").evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 88).length);
check("the three buttons are big", small === 0);
const chooser = page.waitForEvent("filechooser", { timeout: 5000 }).catch(() => null);
await page.locator(".home-tile", { hasText: "Scan receipt" }).click();
check("Scan receipt opens the camera picker in one tap", (await chooser) !== null);
await page.locator(".home-tile", { hasText: "New job" }).click();
check("New job opens the new-job form", await page.getByRole("dialog").getByText("New job").isVisible());
await page.keyboard.press("Escape");
const rows = async (testId) => page.getByTestId(testId).locator("[data-row]").evaluateAll((els) => els.map((e) => e.getAttribute("data-row")));
const openRows = await rows("open-jobs");
check("Open jobs lists jobs not completed or cancelled", openRows.includes("Open Olive") && openRows.includes("Lines Larry") && !openRows.includes("Done Dana"), openRows.join(", "));
const readyText = await page.getByTestId("ready-to-invoice").innerText();
const readyRows = await rows("ready-to-invoice");
check("Ready to invoice: finished priced lines, with their amount", readyRows.includes("Lines Larry") && /\$190\.00/.test(readyText), readyText.replace(/\n/g, " | "));
check("Ready to invoice: a completed job with nothing sent", readyRows.includes("Done Dana") && /completed, nothing sent/.test(readyText));
check("Ready to invoice: a completed job whose invoice went out is left out", !readyRows.includes("Sent Sam"));
check("Ready to invoice: a completed job with an unsent draft points at the draft",
  readyRows.includes("Drafty Drew") &&
  (await page.getByTestId("ready-to-invoice").locator('[data-row="Drafty Drew"]').innerText()).endsWith(`draft ${draftNumber} not sent`) &&
  (await page.getByTestId("ready-to-invoice").locator('[data-row="Drafty Drew"] a').getAttribute("href")) === `/app/estimator/invoices/${draftInv}`);
const unpaidText = await page.getByTestId("unpaid").innerText();
check("Unpaid invoices shows the balance and days since sent", /\$200\.00/.test(unpaidText) && /\d+ days/.test(unpaidText) && /Owed \$200\.00/.test(unpaidText), unpaidText.replace(/\n/g, " | "));
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check("no sideways scroll on Home at 390 px", overflow <= 0, `${overflow}px`);
await page.screenshot({ path: "/opt/fieldstack/e2e/step4-home.png", fullPage: true });

// --- Phone nav ----------------------------------------------------------------------------------
const bar = page.getByRole("navigation", { name: "Main" });
const tabs = (await bar.locator("li").allInnerTexts()).map((t) => t.trim());
check("tab bar: Home, Jobs, Calendar, Invoices, More", tabs.join("|") === "Home|Jobs|Calendar|Invoices|More", tabs.join("|"));
await bar.getByRole("button", { name: "More" }).click();
const more = page.getByRole("dialog", { name: "More" });
const moreItems = (await more.getByRole("link").allInnerTexts()).map((t) => t.trim());
check("More holds Contacts, Business, Settings", moreItems.join("|") === "Contacts|Business|Settings", moreItems.join("|"));
await more.getByRole("link", { name: "Contacts" }).click();
await page.waitForURL(/\/app\/contacts/);
check("More › Contacts goes to Contacts and lights More", (await bar.getByRole("button", { name: "More" }).getAttribute("class")).includes("text-field-500"));
await page.screenshot({ path: "/opt/fieldstack/e2e/step4-more.png" });

// --- Contacts, jobs, settings, bell ---------------------------------------------------------------------
await page.goto(`${APP}/app/contacts/${contact.id}`);
await page.waitForLoadState("networkidle");
check("a contact has no Calls or Voicemails tabs", (await page.getByRole("link", { name: /^Calls|^Voicemails/ }).count()) === 0);
check("Text opens the phone's messaging app", (await page.getByRole("link", { name: "Text" }).getAttribute("href")) === "sms:+18015550123");
await page.goto(`${APP}/app/settings`);
await page.waitForLoadState("networkidle");
const settings = await page.locator("main").innerText();
check("Settings has no receptionist sections", !/Assistant voice|Voice assistant prompt|SMS reply templates|Twilio|Pricing block|Escalation phone/i.test(settings), settings.slice(0, 200));
await page.goto(`${APP}/app`);
await page.waitForLoadState("networkidle");
await page.getByRole("button", { name: /notifications/i }).first().click();
const bell = await page.locator("body").innerText();
check("the bell shows invoice notifications, not the receptionist's", bell.includes("Invoice CAS paid") && !bell.includes("Old text"));
await browser.close();

// --- Admin: flags save, receptionist fields untouched ------------------------------------------------------
await adminCall("PATCH", "Clients?id=eq.8", { twilio_number: "+15550001111", pricing_block: "keep me" });
const admin = await launch();
const ap = await login(admin, "admin@other.test", PHONE);
const res = await ap.request.patch(`${APP}/api/admin/clients/8`, {
  data: { feature_calendar_enabled: false, twilio_number: "+19999999999", pricing_block: null, business_short_name: "Cascade" },
});
const c8 = (await adminGet("Clients?id=eq.8&select=feature_calendar_enabled,twilio_number,pricing_block,business_short_name"))[0];
check("admin saves flags and platform fields; receptionist fields are ignored",
  res.status() === 200 && c8.feature_calendar_enabled === false && c8.business_short_name === "Cascade" &&
  c8.twilio_number === "+15550001111" && c8.pricing_block === "keep me", JSON.stringify(c8));
await ap.goto(`${APP}/admin/clients/8`);
await ap.waitForLoadState("networkidle");
const adminText = await ap.locator("body").innerText();
check("the admin client page has no voice, SMS or billing flags or prompt fields",
  !/Voice receptionist|SMS compliance|Billing page|regenerate prompt|VAPI|Twilio number/i.test(adminText) && /Estimator/.test(adminText));
await admin.close();
