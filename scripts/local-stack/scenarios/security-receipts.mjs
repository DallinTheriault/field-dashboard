// Receipt files are read and deleted with the admin storage client, which
// skips storage policies. A user can write a purchase's or expense's stored
// path, so each route must refuse a path outside the row's tenant folder.
import { readFileSync } from "node:fs";
import { APP, check, launch, login } from "./browser.mjs";
import { session } from "./api.mjs";

const env = Object.fromEntries(readFileSync(new URL("../../../.env.local", import.meta.url), "utf8")
  .split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const storage = (method, path, body) => fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/receipts/${path}`, {
  method,
  headers: { authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "image/jpeg", "x-upsert": "true" },
  body,
});
const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");

// Another tenant's receipt, and Cascade rows that point at it.
const SECRET = "9/purchase-1-other-tenant.jpg";
await storage("POST", SECRET, jpeg);
const owner = await session("owner@cascade.test");
const purchase = (await owner.post("purchases", {
  client_id: 8, vendor: "Probe", purchase_date: "2026-10-14", subtotal: 1, tax: 0, total: 1, receipt_paths: [SECRET],
})).body?.[0];
const expense = (await owner.post("expenses", {
  client_id: 8, expense_date: "2026-10-14", category: "Materials & supplies", description: "Probe",
  amount: 1, qty: 1, unit_price: 1, assignment: "stock", customer_notified: false, receipt_path: SECRET,
})).body?.[0];
check("setup: Cascade rows that point at another tenant's receipt", !!(purchase && expense), JSON.stringify({ purchase, expense }).slice(0, 200));

const browser = await launch();
const page = await login(browser, "owner@cascade.test");
const get = async (url) => (await page.request.get(`${APP}${url}`, { maxRedirects: 0 })).status();
check("purchase receipt view refuses the other tenant's file", (await get(`/api/estimator/purchases/${purchase.id}/receipt`)) === 404);
check("expense receipt view refuses the other tenant's file", (await get(`/api/estimator/expenses/${expense.id}/receipt`)) === 404);
await page.request.delete(`${APP}/api/estimator/expenses/${expense.id}/receipt`);
check("removing the expense's receipt leaves the other tenant's file", (await storage("GET", SECRET)).status === 200);

// The owner's own receipt still works.
const OWN = "8/purchase-own.jpg";
await storage("POST", OWN, jpeg);
await owner.patch(`purchases?id=eq.${purchase.id}`, { receipt_paths: [OWN] });
check("a receipt in the tenant's own folder still opens", (await get(`/api/estimator/purchases/${purchase.id}/receipt`)) === 307);
await browser.close();
