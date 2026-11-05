// Rows appear: seed one of everything (tagged with this run) and require each
// page and export to show it. A query that fails, or an embed that comes back
// empty, shows up here as a missing row, not as a page that merely loads.
// Pages: Expenses, Jobs, the job, Invoices and an invoice, the invoice PDF,
// the expenses CSV, Money, Mileage and Home. Cascade (client 8), phone width.
// Usage: node rows-appear.mjs (app on :3000 against the local stack)
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { APP, PHONE, check, launch, login } from "./browser.mjs";
import { adminGet, session } from "./api.mjs";

const owner = await session("owner@cascade.test");
const RUN = Date.now().toString(36).toUpperCase();
const DAY = "2026-11-03";
const YEAR = DAY.slice(0, 4);
const ok = (r, what) => {
  if (r.status >= 300) throw new Error(`seed ${what}: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  return Array.isArray(r.body) ? r.body[0] : r.body;
};

// --- Seed ------------------------------------------------------------------------------------------------
const job = ok(await owner.post("jobs", {
  client_id: 8, name: `Rows ${RUN}`, status: "completed", source: "manual", address: `${RUN} Row St, Provo, UT 84601`,
}), "job");
const task = ok(await owner.post("tasks", {
  client_id: 8, job_id: job.id, title: `Line ${RUN}`, status: "done", qty: 1, unit: "each", unit_price: 120, billable: true, sort_order: 1,
}), "task");
const purchase = ok(await owner.post("purchases", {
  client_id: 8, vendor: `Vendor ${RUN}`, purchase_date: DAY, source: "manual", subtotal: 33.33, tax: 0, total: 33.33,
}), "receipt");
const item = ok(await owner.post("expenses", {
  client_id: 8, purchase_id: purchase.id, job_id: job.id, assignment: "job_extra", description: `Item ${RUN}`,
  amount: 33.33, qty: 1, unit_price: 33.33, category: "Materials & supplies", expense_date: DAY,
}), "item");
const fuel = ok(await owner.post("expenses", {
  client_id: 8, description: `Fuel ${RUN}`, amount: 44.44, category: "Vehicle & fuel", expense_date: DAY,
}), "quick expense");
ok(await owner.post("time_entries", { client_id: 8, job_id: job.id, entry_date: DAY, hours: 1.5 }), "hours");
ok(await owner.post("mileage_entries", {
  client_id: 8, trip_date: DAY, kind: "manual", source: "manual", destination: `Trip ${RUN} Ave`, purpose: "Supply run",
  miles: 12.3, miles_status: "ok", round_trip: true,
}), "trip");
const entity = (await adminGet("billing_entities?client_id=eq.8&active=is.true&select=id&order=id&limit=1"))[0].id;
const created = ok(await owner.post("rpc/invoice_create_from_job", { p: {
  client_id: 8, job_id: job.id, billing_entity_id: entity, customer_name: `Rows ${RUN}`,
  line_items: [
    { description: `Line ${RUN}`, qtyLabel: null, amount: 120, task_id: task.id },
    { description: `Item ${RUN}`, qtyLabel: null, amount: 33.33, extra_expense_id: item.id },
  ],
  subtotal_cents: 15333, tax_rate_pct: 0, tax_cents: 0, total_cents: 15333,
} }), "invoice");
const invoiceId = created.invoice_id;
const number = created.invoice_number;
ok(await owner.patch(`invoices?id=eq.${invoiceId}`, { status: "sent", sent_at: `${DAY}T18:00:00Z` }), "send");
ok(await owner.post("payments", { client_id: 8, invoice_id: invoiceId, received_on: DAY, amount_cents: 5000, method: "check" }), "payment");

// --- Pages -----------------------------------------------------------------------------------------------
const browser = await launch();
const page = await login(browser, "owner@cascade.test", PHONE);
async function shows(path, label, needles) {
  await page.goto(`${APP}${path}`);
  await page.waitForLoadState("networkidle").catch(() => {});
  const text = await page.locator("main").innerText();
  const missing = needles.filter((n) => !text.includes(n));
  check(`${label} shows ${needles.join(", ")}`, missing.length === 0, missing.length ? `missing ${missing.join(", ")}` : "");
}

await shows("/app/estimator/purchases", "Expenses", [`Vendor ${RUN}`, `Fuel ${RUN}`]);
await shows(`/app/estimator/purchases/${purchase.id}`, "the receipt", [`Item ${RUN}`]);
await shows("/app/jobs", "Jobs", [`Rows ${RUN}`]);
await shows(`/app/jobs/${job.id}`, "the job", [`Line ${RUN}`, `Item ${RUN}`, number]);
await shows("/app/estimator/invoices", "Invoices", [number, `Rows ${RUN}`]);
await shows(`/app/estimator/invoices/${invoiceId}`, "the invoice", [number, `Line ${RUN}`, `Item ${RUN}`, "$153.33"]);
await shows(`/app/estimator/expenses?y=${YEAR}`, "Money", [`Fuel ${RUN}`, `Item ${RUN}`]);
await shows(`/app/estimator/mileage?y=${YEAR}`, "Mileage", [`Trip ${RUN} Ave`]);
await shows("/app", "Home", [number]);

// --- Exports ---------------------------------------------------------------------------------------------
const pdf = await page.request.get(`${APP}/api/estimator/invoices/${invoiceId}/pdf`);
const dir = mkdtempSync(join(tmpdir(), "rows-"));
writeFileSync(join(dir, "inv.pdf"), await pdf.body());
const pdfText = pdf.status() === 200 ? execFileSync("pdftotext", ["-layout", join(dir, "inv.pdf"), "-"], { encoding: "utf8" }) : "";
const pdfMissing = [number, `Line ${RUN}`, `Item ${RUN}`, "153.33"].filter((n) => !pdfText.includes(n));
check(`the invoice PDF shows ${number}, its lines and total`, pdf.status() === 200 && pdfMissing.length === 0,
  `${pdf.status()} missing ${pdfMissing.join(", ")}`);

const csv = await page.request.get(`${APP}/api/estimator/expenses/csv?y=${YEAR}`);
const csvText = await csv.text();
const csvMissing = [`Fuel ${RUN}`, `Item ${RUN}`, `Vendor ${RUN}`, "44.44", "33.33", number].filter((n) => !csvText.includes(n));
check("the expenses CSV has the receipt item, the quick expense and the payment", csv.status() === 200 && csvMissing.length === 0,
  `${csv.status()} missing ${csvMissing.join(", ")}`);

await browser.close();
console.log(`(seeded: job ${job.id}, receipt ${purchase.id}, quick expense ${fuel.id}, invoice ${number})`);
