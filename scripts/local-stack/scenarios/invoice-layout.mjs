// v104 invoice layout and the minimal calendar: Bill To is the payer only,
// the service address is where the work was, a draft follows the bill-to
// contact until it's sent, a sent one never changes; Scheduled asks When,
// and the calendar shows a job on every day it covers. Cascade (client 8).
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { APP, PHONE, check, launch, login } from "./browser.mjs";
import { adminCall, adminGet, session } from "./api.mjs";

const owner = await session("owner@cascade.test");
const eventually = async (fn, ms = 15_000) => {
  for (const end = Date.now() + ms; ; await new Promise((ok) => setTimeout(ok, 250))) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) return null;
  }
};
const inv = async (id) => (await adminGet(`invoices?id=eq.${id}&select=*`))[0];
const job = async (id) => (await adminGet(`jobs?id=eq.${id}&select=*`))[0];
const ISO_DAY = /\b\d{4}-\d{2}-\d{2}\b/;
const LONG_DAY = /\b[A-Z][a-z]{2} \d{1,2}, \d{4}\b/;
const dir = mkdtempSync(join(tmpdir(), "inv-layout-"));

const flag = await adminCall("PATCH", "Clients?id=eq.8", { feature_calendar_enabled: true });
if (flag.status !== 200) throw new Error(`calendar flag: ${flag.status} ${JSON.stringify(flag.body)}`);

// TPS-2026-006's shape: Josh (a property manager) pays for work at Ronny's house.
const josh = (await owner.post("contacts", {
  client_id: 8, name: "Josh Ellis", company: "Vista Ventures Realty LLC", phone: "+18018976545", is_property_manager: true,
})).body[0];
const ronny = (await owner.post("contacts", { client_id: 8, name: "Ronny Tester", phone: "+18015550110", email: "ronny@resident.test" })).body[0];
const prop = (await owner.post("properties", { client_id: 8, contact_id: ronny.id, address: "2830 E Willow Hills Dr, Sandy UT 84093" })).body[0];
const j = (await owner.post("jobs", {
  client_id: 8, name: "Ronny Tester", phone: ronny.phone, email: ronny.email, contact_id: ronny.id, property_id: prop.id,
  bill_to_contact_id: josh.id, address: prop.address, status: "completed", source: "manual",
})).body[0];
await owner.post("tasks", { client_id: 8, job_id: j.id, title: "Replace fill valve", status: "done", qty: 1, unit: "each", unit_price: 150, billable: true, sort_order: 1 });

const browser = await launch();
const page = await login(browser, "owner@cascade.test", PHONE);
await page.addInitScript(() => {
  navigator.canShare = () => true;
  navigator.share = async () => {};
});
page.on("dialog", (d) => d.accept());
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const go = async (path) => {
  await page.goto(`${APP}${path}`);
  await page.waitForLoadState("networkidle");
};
const pdfText = async (id, name) => {
  const res = await page.request.get(`${APP}/api/estimator/invoices/${id}/pdf`);
  const file = join(dir, `${name}.pdf`);
  writeFileSync(file, await res.body());
  return execFileSync("pdftotext", ["-layout", file, "-"]).toString();
};

// --- A draft: Bill To is the payer, the service address is the resident's house -----------------------
await go(`/app/jobs/${j.id}/invoice`);
await page.getByRole("button", { name: "Create draft" }).click();
await page.waitForURL(/\/app\/estimator\/invoices\/\d+$/);
const id = Number(page.url().split("/").pop());
await page.waitForLoadState("networkidle");
let row = await inv(id);
check("the draft takes the payer's details from Josh's contact, never the resident's email or phone",
  row.customer_name === "Josh Ellis" && row.customer_company === "Vista Ventures Realty LLC" &&
  row.customer_phone === "+18018976545" && row.customer_email === null && row.bill_to_contact_id === josh.id,
  JSON.stringify([row.customer_name, row.customer_company, row.customer_phone, row.customer_email]));

const billTo = () => page.getByTestId("bill-to").innerText();
const service = () => page.getByTestId("service-address").innerText();
let bt = await billTo();
let sv = await service();
check("screen Bill to: Josh, his company and his phone as (801) 897-6545; nothing of Ronny's",
  bt.includes("Josh Ellis") && bt.includes("Vista Ventures Realty LLC") && bt.includes("(801) 897-6545") &&
  !bt.includes("+1801") && !bt.includes("Willow") && !bt.includes("Ronny") && !bt.includes("ronny@"), bt.replace(/\n/g, " / "));
check("screen Service address: the property, then Resident: Ronny (first name only, no phone)",
  sv.includes("2830 E Willow Hills Dr, Sandy UT 84093") && sv.includes("Resident: Ronny") && !sv.includes("Tester") && !sv.includes("555"),
  sv.replace(/\n/g, " / "));
check("the job number sits next to the invoice number",
  (await page.getByTestId("invoice-job-number").innerText()).trim() === `· ${j.job_number}`);
const header = await page.getByTestId("invoice-header").innerText();
check("screen dates print like Oct 22, 2026", LONG_DAY.test(header) && !ISO_DAY.test(header), header.replace(/\n/g, " / "));

let pdf = await pdfText(id, "draft");
check("PDF: Bill to and Service address are separate blocks; Ronny's address isn't under Josh",
  // pdftotext spaces out the letter-spaced headings ("B I L L TO").
  /BILLTO\s*SERVICEADDRESS/.test(pdf.replace(/ /g, "")) && /Josh Ellis\s+2830 E Willow/.test(pdf) && pdf.includes("Resident: Ronny") && pdf.includes("(801) 897-6545") &&
  !pdf.includes("+1801"), pdf.slice(0, 600));
const [entity] = await adminGet(`billing_entities?id=eq.${row.billing_entity_id}&select=name,logo_path`);
check("PDF: with no logo the business name prints once, as the letterhead",
  !entity.logo_path && pdf.split(entity.name).length - 1 === 1, `${pdf.split(entity.name).length - 1}×`);
check("PDF: the invoice number with the job number, and dates like Oct 22, 2026",
  pdf.includes(`${row.invoice_number} · ${j.job_number}`) && LONG_DAY.test(pdf) && !ISO_DAY.test(pdf));

// --- Until it's sent, the draft follows the contact ---------------------------------------------------
await owner.patch(`contacts?id=eq.${josh.id}`, {
  company: "Vista Ventures Property Mgmt", address: "PO Box 9, Sandy UT 84091", email: "josh@vista.test",
});
await go(`/app/estimator/invoices/${id}`);
bt = await billTo();
check("a draft shows the contact as it is now (company, mailing address, email)",
  bt.includes("Vista Ventures Property Mgmt") && bt.includes("PO Box 9, Sandy UT 84091") && bt.includes("josh@vista.test") &&
  !bt.includes("Realty LLC"), bt.replace(/\n/g, " / "));
await go("/app/estimator/invoices?tab=drafts");
const listed = await page.locator(`[data-invoice="${row.invoice_number}"]`).innerText();
check("…and so does the invoices list", listed.includes("Vista Ventures Property Mgmt") && !listed.includes("Realty LLC"), listed.replace(/\n/g, " / "));
pdf = await pdfText(id, "draft-renamed");
check("…and so does its PDF", pdf.includes("Vista Ventures Property Mgmt") && pdf.includes("PO Box 9") && !pdf.includes("Realty LLC"));
await owner.patch(`invoices?id=eq.${id}`, { due_terms: "Net 15" });
row = await inv(id);
check("saving the draft takes the contact's details onto it",
  row.customer_company === "Vista Ventures Property Mgmt" && row.customer_address === "PO Box 9, Sandy UT 84091" && row.customer_email === "josh@vista.test");

// --- Work order # on the job ----------------------------------------------------------------------------
await go(`/app/jobs/${j.id}/edit`);
await page.getByLabel("Work order #").fill("4417");
await page.getByRole("button", { name: "Save changes" }).click();
check("the job form saves a work order number", !!(await eventually(async () => (await job(j.id)).work_order_number === "4417")));
await page.waitForURL(new RegExp(`/app/jobs/${j.id}(\\?|$)`));
await go(`/app/estimator/invoices/${id}`);
check("…and it prints under the service address", (await service()).includes("Work order #4417"));
check("…on the PDF too", (await pdfText(id, "wo")).includes("Work order #4417"));

// --- Sent: frozen ---------------------------------------------------------------------------------------
await page.getByRole("button", { name: "Share invoice" }).click();
await page.getByText("Shared. Did it go out?").waitFor();
await page.getByRole("button", { name: "Mark as sent" }).click();
await page.getByText("Share PDF again").waitFor();
row = await inv(id);
check("sending stamps the service block and job number as they were",
  row.status === "sent" && row.service_address === "2830 E Willow Hills Dr, Sandy UT 84093" && row.service_resident === "Ronny" &&
  row.work_order_number === "4417" && row.job_number === j.job_number && row.customer_company === "Vista Ventures Property Mgmt",
  JSON.stringify([row.status, row.service_address, row.service_resident, row.work_order_number, row.job_number]));
await owner.patch(`contacts?id=eq.${josh.id}`, { company: "Renamed After Sending LLC", address: null });
await owner.patch(`jobs?id=eq.${j.id}`, { work_order_number: "9999" });
await go(`/app/estimator/invoices/${id}`);
bt = await billTo();
sv = await service();
check("a sent invoice shows what it went out with, not the contact or job now",
  bt.includes("Vista Ventures Property Mgmt") && bt.includes("PO Box 9") && !bt.includes("Renamed") &&
  sv.includes("Work order #4417") && !sv.includes("9999"), `${bt} | ${sv}`.replace(/\n/g, " / "));
pdf = await pdfText(id, "sent");
check("…and so does its PDF", pdf.includes("Vista Ventures Property Mgmt") && !pdf.includes("Renamed") && pdf.includes("Work order #4417"));
const tamper = await owner.patch(`invoices?id=eq.${id}`, { customer_company: "Edited LLC" });
check("who a sent invoice bills can't be edited", tamper.status >= 400 && /went out/.test(JSON.stringify(tamper.body)), String(tamper.status));
const service2 = await owner.patch(`invoices?id=eq.${id}`, { service_address: "Elsewhere" });
check("…nor where the work was", service2.status >= 400);
check("…and the row didn't change", (await inv(id)).customer_company === "Vista Ventures Property Mgmt");

// The payer is the job's own contact: no Resident line when it goes out.
const own = (await owner.post("jobs", {
  client_id: 8, name: "Ronny Tester", contact_id: ronny.id, property_id: prop.id, address: prop.address, status: "completed", source: "manual",
})).body[0];
const ownInv = (await adminCall("POST", "invoices", {
  client_id: 8, job_id: own.id, bill_to_contact_id: ronny.id, customer_name: "x", status: "draft",
  billing_entity_id: row.billing_entity_id, line_items: [], subtotal_cents: 0, tax_cents: 0, total_cents: 0,
})).body[0];
await adminCall("PATCH", `invoices?id=eq.${ownInv.id}`, { status: "sent", sent_at: new Date().toISOString() });
const ownRow = await inv(ownInv.id);
check("when the resident pays, the sent invoice has no Resident line, and the name came from the contact",
  ownRow.service_resident === null && ownRow.service_address === prop.address && ownRow.customer_name === "Ronny Tester" &&
  ownRow.customer_email === "ronny@resident.test", JSON.stringify([ownRow.service_resident, ownRow.customer_name]));

// --- Calendar: Scheduled asks When ---------------------------------------------------------------------
const mk = async (name, extra = {}) =>
  (await owner.post("jobs", { client_id: 8, name, status: "estimated", source: "manual", address: `${name} St, Provo UT`, ...extra })).body[0];
const multi = await mk("Mona Multiday");
await go(`/app/jobs/${multi.id}`);
await page.getByRole("button", { name: "Change status" }).click();
await page.getByRole("button", { name: "scheduled" }).click();
const dlg = page.getByRole("dialog", { name: "When?" });
await dlg.waitFor();
check("choosing Scheduled in the status picker asks When?", (await dlg.getByLabel("Date", { exact: true }).count()) === 1);
await dlg.getByLabel("Date", { exact: true }).fill("2026-10-28");
await dlg.getByLabel("End date").fill("2026-10-30");
await dlg.getByRole("button", { name: "Schedule" }).click();
let m = await eventually(async () => {
  const r = await job(multi.id);
  return r.status === "scheduled" && r.start_datetime ? r : null;
});
check("…and saves the status and the days together: all day, Oct 28 to Oct 30, Mountain",
  !!m && new Date(m.start_datetime).toISOString() === "2026-10-28T06:00:00.000Z" &&
  new Date(m.end_datetime).toISOString() === "2026-10-30T06:00:00.000Z" && m.all_day === true,
  JSON.stringify([m?.start_datetime, m?.end_datetime, m?.all_day]));

const later = await mk("Nate Nodate");
await go(`/app/jobs/${later.id}`);
await page.getByRole("button", { name: "Change status" }).click();
await page.getByRole("button", { name: "scheduled" }).click();
await page.getByRole("dialog", { name: "When?" }).getByRole("button", { name: "No date yet" }).click();
const n = await eventually(async () => {
  const r = await job(later.id);
  return r.status === "scheduled" ? r : null;
});
check("No date yet is allowed: Scheduled, no date", !!n && n.start_datetime === null);

// Job form: Scheduled needs a date or No date yet; a date and time save in the business's zone.
const formJob = await mk("Fran Form");
await go(`/app/jobs/${formJob.id}/edit`);
await page.locator("form select").first().selectOption("scheduled");
await page.getByRole("button", { name: "Save changes" }).click();
check("the job form won't leave a scheduled job without a date by accident",
  (await page.getByText("When? Pick a date for this scheduled job, or tick No date yet.").count()) === 1 &&
  (await job(formJob.id)).status === "estimated");
const when = page.getByTestId("job-when");
await when.getByLabel("Date", { exact: true }).fill("2026-10-29");
await when.getByLabel("Time").fill("09:30");
await page.getByRole("button", { name: "Save changes" }).click();
const f = await eventually(async () => {
  const r = await job(formJob.id);
  return r.status === "scheduled" ? r : null;
});
check("…with a date and time it saves both (9:30 AM Mountain), not all day",
  !!f && new Date(f.start_datetime).toISOString() === "2026-10-29T15:30:00.000Z" && f.all_day === false && f.end_datetime === null,
  JSON.stringify([f?.start_datetime, f?.all_day]));

// A same-day end time the form can't show survives an unrelated edit.
const timed = await mk("Tia Timed", { status: "scheduled", start_datetime: "2026-10-27T15:00:00Z", end_datetime: "2026-10-27T17:00:00Z" });
await go(`/app/jobs/${timed.id}/edit`);
await page.locator("form textarea").first().fill("gate code 4417");
await page.getByRole("button", { name: "Save changes" }).click();
const t = await eventually(async () => {
  const r = await job(timed.id);
  return r.notes === "gate code 4417" ? r : null;
});
check("editing something else keeps a same-day end time",
  !!t && new Date(t.end_datetime).toISOString() === "2026-10-27T17:00:00.000Z", t?.end_datetime);

// New job: Scheduled asks When and saves it with the job.
await go("/app/jobs");
await page.getByRole("button", { name: "Add job" }).first().click();
const newJob = page.getByRole("dialog");
await newJob.getByPlaceholder("Search or type a new name…").fill("Ned Newjob");
await newJob.getByPlaceholder("(801) 555-1234").fill("8015550123");
await newJob.getByPlaceholder("e.g. 123 Main St, Provo UT").fill("5 New Job Way, Provo UT");
await newJob.locator("select").last().selectOption("scheduled");
const nj = page.getByTestId("new-job-when");
check("New job: Scheduled shows When?", (await nj.count()) === 1);
await newJob.getByRole("button", { name: "Create job" }).click();
check("…and won't create it undated by accident", (await newJob.getByText("When? Pick a date, or tick No date yet.").count()) === 1);
await nj.getByLabel("Date", { exact: true }).fill("2026-11-02");
await nj.getByLabel("Time").fill("08:00");
await newJob.getByRole("button", { name: "Create job" }).click();
await page.waitForURL(/\/app\/jobs\/\d+$/);
const nid = Number(page.url().split("/").pop());
const nr = await job(nid);
check("…and the new job is created dated, in one save",
  nr.status === "scheduled" && new Date(nr.start_datetime).toISOString() === "2026-11-02T15:00:00.000Z", nr.start_datetime);

// --- The calendar reads jobs and shows each on every day it covers ------------------------------------
await mk("Otto Overmonth", { status: "scheduled", start_datetime: "2026-10-30T13:00:00Z", end_datetime: "2026-11-02T13:00:00Z" });
await go("/app/calendar?m=2026-10");
const cell = (day) => page.locator(`[data-day="${day}"]`).innerText();
const oct = await Promise.all(["2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"].map(cell));
check("a three-day job shows on each of its days, as All day",
  [oct[1], oct[2], oct[3]].every((c) => c.includes("All day") && c.includes("Mona Multiday")) && !oct[0].includes("Mona") && !oct[4].includes("Mona"),
  oct.map((c) => c.replace(/\n/g, " ")).join(" | "));
check("a timed job shows its time on day one and cont. after",
  oct[3].includes("7:00 AM") && oct[3].includes("Otto Overmonth") && oct[4].includes("cont.") && oct[4].includes("Otto"));
check("a timed one-day job shows its time", oct[0].includes("9:00 AM") && oct[0].includes("Tia Timed"));
await go("/app/calendar?m=2026-11");
const nov = await Promise.all(["2026-11-01", "2026-11-02", "2026-11-03"].map(cell));
check("a job that started last month still shows on this month's days",
  nov[0].includes("Otto") && nov[1].includes("Otto") && !nov[2].includes("Otto"), nov.map((c) => c.replace(/\n/g, " ")).join(" | "));

// Adding from the calendar makes one job, dated, in one call.
await go("/app/calendar?m=2026-11");
const before = (await adminGet("jobs?client_id=eq.8&select=id")).length;
await page.locator('[data-day="2026-11-05"]').click();
await page.getByRole("button", { name: "Schedule a job" }).click();
await page.getByRole("button", { name: "New job" }).click();
await page.getByPlaceholder("e.g. Brie Anderson").fill("Cal Calendar");
await page.getByPlaceholder("(801) 555-1234").fill("8015550188");
await page.getByPlaceholder("e.g. Interior paint").fill("Faucet");
await page.getByPlaceholder("e.g. 123 Main St, Provo UT").fill("9 Calendar Ct, Provo UT");
await page.getByRole("button", { name: "Create & book" }).click();
const cal = await eventually(async () => (await adminGet("jobs?client_id=eq.8&name=eq.Cal%20Calendar&select=*"))[0]);
check("the calendar's New job creates a job (one record), dated 9:00 AM–11:00 AM with its service",
  !!cal && cal.status === "scheduled" && new Date(cal.start_datetime).toISOString() === "2026-11-05T16:00:00.000Z" &&
  new Date(cal.end_datetime).toISOString() === "2026-11-05T18:00:00.000Z" && cal.service === "Faucet" &&
  (await adminGet("jobs?client_id=eq.8&select=id")).length === before + 1,
  JSON.stringify([cal?.start_datetime, cal?.end_datetime, cal?.service]));

check("no page errors", errors.length === 0, errors.join(" | "));
await browser.close();
