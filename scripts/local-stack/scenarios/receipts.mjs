// Receipts v2 (v100): save first, scan second. The photo saves at once, the
// read runs on its own and waits as "Check this"; failures keep the photo as
// "Needs entry"; Scan again on a saved receipt compares before changing
// anything. Also: the travel line is gone from the estimate builder.
// The scanner talks to anthropic-mock.mjs (no key, no cost). Run on a stack
// with every migration (receipts.sh rebuilds it).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { APP, PHONE, check, launch, login } from "./browser.mjs";
import { adminCall, adminGet, session } from "./api.mjs";

const MOCK = "http://127.0.0.1:12113";
const mock = {
  reset: () => fetch(`${MOCK}/__mock/reset`, { method: "POST" }),
  script: (replies) => fetch(`${MOCK}/__mock/script`, { method: "POST", body: JSON.stringify({ replies }) }),
  requests: async () => (await fetch(`${MOCK}/__mock/requests`)).json(),
};
const env = Object.fromEntries(readFileSync(new URL("../../../.env.local", import.meta.url), "utf8")
  .split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const storageGet = (path) => fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/receipts/${path}`, {
  headers: { authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
});

const GOOD = {
  vendor: "Home Depot", date: "2026-10-12", subtotal: 42.5, tax: 3.06, total: 45.56,
  items: [
    { description: "Kilz 2 primer, 1 gal", sku: "GRT 1G KILZ2 PRIMER", qty: 1, unit_price: 24.98, amount: 24.98 },
    { description: "9 in roller covers, 3 pack", sku: "WOOSTER 9IN 3PK", qty: 1, unit_price: 17.52, amount: 17.52 },
  ],
};
const OFF = { ...GOOD, items: [GOOD.items[0], { ...GOOD.items[1], amount: 10, unit_price: 10 }] }; // 34.98 vs 42.50
const text = (o) => ({ text: JSON.stringify(o) });

// --- Files ---------------------------------------------------------------------------------------------
const dir = mkdtempSync(join(tmpdir(), "receipts-"));
const im = (out, ...args) => { execFileSync("convert", [...args, join(dir, out)]); return join(dir, out); };
const label = ["-fill", "black", "-pointsize", "48", "-annotate", "+60+120", "HOME DEPOT"];
const photo = im("photo.jpg", "-size", "1200x1600", "xc:white", ...label);
const tall = im("tall.jpg", "-size", "900x6000", "xc:white", ...label, "-annotate", "+60+5800", "TOTAL 45.56");
// Taken sideways: stored landscape, EXIF says turn it upright (portrait).
const sideways = join(dir, "sideways.jpg");
execFileSync("python3", ["-c", `
from PIL import Image, ImageDraw
im = Image.new("RGB", (1600, 1200), "white")
ImageDraw.Draw(im).text((60, 60), "HOME DEPOT", fill="black")
exif = Image.Exif()
exif[274] = 6  # Orientation: rotate 90 CW to view
im.save(${JSON.stringify(sideways)}, exif=exif.tobytes())
`]);
const HEIC = process.env.HEIC_SAMPLE ?? "";
const dims = (buf) => {
  const f = join(dir, `dl-${Date.now()}`);
  writeFileSync(f, buf);
  return execFileSync("identify", ["-format", "%w %h", f]).toString().trim().split(" ").map(Number);
};

const owner = await session("owner@cascade.test");
await adminCall("PATCH", "Clients?id=eq.8", { feature_receipt_ai_enabled: true });
const latest = async () => (await adminGet("purchases?client_id=eq.8&order=id.desc&limit=1&select=*"))[0];
const row = async (id) => (await adminGet(`purchases?id=eq.${id}&select=*`))[0];
const meters = async (id) => adminGet(`receipt_scans?purchase_id=eq.${id}&order=id&select=*`);
const items = async (id) => adminGet(`expenses?purchase_id=eq.${id}&order=id&select=*`);
/** Wait for the scan to finish; `since`: one asked for after that time. */
async function settled(id, since = null, ms = 40_000) {
  const until = Date.now() + ms;
  for (;;) {
    const p = await row(id);
    const fresh = !since || (p?.scan_requested_at && p.scan_requested_at > since);
    if (p && fresh && !["queued", "scanning"].includes(p.scan_status)) return p;
    if (Date.now() > until) return p;
    await new Promise((r) => setTimeout(r, 400));
  }
}

const browser = await launch();
const page = await login(browser, "owner@cascade.test", PHONE);

/** Pick files in a capture (Expenses page by default); returns the new purchase once saved. */
async function capture(files, { at = "/app/estimator/purchases", scope = page } = {}) {
  const before = (await latest())?.id ?? 0;
  await scope.goto(`${APP}${at}`);
  await scope.waitForLoadState("networkidle");
  await scope.locator('input[aria-label="Choose receipt photos or a PDF"]').first().setInputFiles(files);
  await scope.getByText(/Saved\. Reading it now|Receipt saved/).first().waitFor({ timeout: 60_000 });
  const p = await latest();
  return p.id > before ? p : null;
}

// --- 1. Save first, scan second -------------------------------------------------------------------------
await mock.reset();
await mock.script([{ ...text(GOOD), delayMs: 2500 }]); // slow read: prove nothing waits on it
let p = await capture([photo]);
const atSave = await row(p.id);
check("the photo is saved before the read finishes", atSave.receipt_paths.length === 1 && ["queued", "scanning"].includes(atSave.scan_status),
  `status ${atSave.scan_status}`);
check("…with no vendor yet, never a made-up one", atSave.vendor === null);
await page.goto(`${APP}/app/jobs`); // leave right away
p = await settled(p.id);
check("the read finishes on its own after leaving the page", p.scan_status === "ready" && p.scan_result?.vendor === "Home Depot");
check("…and is only a read: the purchase still has no vendor or items", p.vendor === null && (await items(p.id)).length === 0);

const reqs = await mock.requests();
const req = reqs.at(-1);
check("the scan asks Sonnet 5.5 at low effort, with server-side fallbacks",
  req.body.model === "claude-sonnet-5-5" && req.body.output_config?.effort === "low" && req.body.fallbacks === "default" &&
  String(req.beta).includes("server-side-fallback-2026-07-01") && req.body.thinking === undefined && req.apiKey === "set",
  JSON.stringify({ model: req.body.model, oc: req.body.output_config, fb: req.body.fallbacks, beta: req.beta }));
check("…with the one photo as one image", req.body.messages[0].content.filter((b) => b.type === "image").length === 1);

await page.goto(`${APP}/app`);
const homeRow = page.getByTestId("receipts-to-check").locator(`li[data-receipt="${p.id}"]`);
check("Home lists it under Receipts to check as Check this", (await homeRow.getByText("Check this").count()) === 1);
await homeRow.getByRole("button", { name: "Check" }).click();
const form = homeRow.getByTestId("confirm-scan");
const val = (l) => form.getByLabel(l, { exact: true }).inputValue();
check("the check screen starts filled in: vendor, date, tax, total",
  (await val("Vendor")) === "Home Depot" && (await val("Date")) === "2026-10-12" && (await val("Receipt tax")) === "3.06" &&
  (await val("Receipt total")) === "45.56");
check("…with the items folded underneath", (await form.getByRole("button", { name: /^2 items/ }).getAttribute("aria-expanded")) === "false" &&
  (await form.getByLabel("Item", { exact: true }).count()) === 0);
check("…and says the items add up", (await form.getByText("Items add up to the receipt before tax").count()) === 1);
await form.getByRole("button", { name: "Save", exact: true }).click();
await page.getByTestId("receipts-to-check").locator(`li[data-receipt="${p.id}"]`).waitFor({ state: "detached" }).catch(() => {});
p = await row(p.id);
const saved = await items(p.id);
check("one tap saves it: vendor, date, totals and both items", p.vendor === "Home Depot" && p.purchase_date === "2026-10-12" &&
  Number(p.total) === 45.56 && saved.length === 2 && saved.every((i) => i.assignment === "unassigned"));
check("…and the read is used up (leaves Receipts to check)", p.scan_status === null && p.scan_result === null);
const m1 = await meters(p.id);
check("one meter row: ok, the model that answered, its tokens", m1.length === 1 && m1[0].status === "ok" &&
  m1[0].model === "claude-sonnet-5-5" && m1[0].input_tokens > 0 && m1[0].output_tokens > 0, JSON.stringify(m1));

// --- 2. Self-check --------------------------------------------------------------------------------------
await mock.reset();
await mock.script([text(OFF), text(GOOD)]);
p = await settled((await capture([photo])).id);
const sc = await mock.requests();
const recheck = JSON.stringify(sc[1]?.body.messages.at(-1));
check("items that don't add up get one automatic rescan, with the numbers",
  sc.length === 2 && recheck.includes("add up to 34.98") && recheck.includes("total minus tax, 42.50"), recheck.slice(0, 200));
check("…and the corrected read is kept, without a warning", p.scan_status === "ready" && p.scan_result.check.mismatch === false &&
  p.scan_result.check.rescanned === true && p.scan_result.items[1].amount === 17.52);
check("…still one meter row for the scan, with both calls' tokens", (await meters(p.id)).length === 1 &&
  (await meters(p.id))[0].input_tokens > sc.length * 1000);

await mock.reset();
await mock.script([text(OFF), text(OFF)]);
const offId = (await capture([photo])).id;
p = await settled(offId);
check("still off after the rescan: the read is kept and marked", p.scan_status === "ready" && p.scan_result.check.mismatch === true &&
  (await mock.requests()).length === 2);
await page.goto(`${APP}/app/estimator/purchases`);
const offRow = page.getByTestId("receipts-to-check").locator(`li[data-receipt="${offId}"]`);
await offRow.getByRole("button", { name: "Check" }).click();
check("…and the check screen says so, plainly",
  (await offRow.getByTestId("scan-mismatch").getByText("Items don't add up to the total, check the numbers.").count()) === 1);

// --- 3. Failures ----------------------------------------------------------------------------------------
await mock.reset();
await mock.script([{ status: 500 }, { status: 500 }, { status: 500 }]);
const failId = (await capture([photo])).id;
p = await settled(failId);
check("an API failure: Needs entry, the photo kept, no vendor", p.scan_status === "needs_entry" && p.receipt_paths.length === 1 &&
  p.vendor === null && /service error \(500\)/.test(p.scan_error ?? ""), `${p.scan_status} ${p.scan_error}`);
check("…metered as api_error, not parse_failed", (await meters(failId)).map((m) => m.status).join() === "api_error");
await page.goto(`${APP}/app/estimator/purchases`);
const failRow = page.getByTestId("receipts-to-check").locator(`li[data-receipt="${failId}"]`);
check("…and the list says it the agreed way",
  (await failRow.getByText("Needs entry", { exact: true }).count()) === 1 &&
  (await failRow.getByText("Couldn't read this receipt right now. Your photo is saved. Type it in or tap Scan again later.").count()) === 1 &&
  (await failRow.getByRole("button", { name: "Type it in" }).count()) === 1);
await mock.reset();
const failAsked = (await row(failId)).scan_requested_at;
await failRow.getByRole("button", { name: "Scan again" }).click();
p = await settled(failId, failAsked);
check("Scan again reads it, and it moves to Check this", p.scan_status === "ready");
await page.reload();
check("…on the page too", (await page.getByTestId("receipts-to-check").locator(`li[data-receipt="${failId}"]`).getByText("Check this").count()) === 1);

await mock.reset();
await mock.script([{ text: "Sorry, I can't make that out." }, { text: "still not json" }]);
p = await settled((await capture([photo])).id);
check("an unreadable reply (twice): Needs entry, metered parse_failed", p.scan_status === "needs_entry" &&
  (await meters(p.id)).map((m) => m.status).join() === "parse_failed" && (await mock.requests()).length === 2);

await mock.reset();
await mock.script([{ refusal: true }]);
p = await settled((await capture([photo])).id);
check("a refusal: Needs entry, never a guess", p.scan_status === "needs_entry" && /declined/.test(p.scan_error ?? "") && p.vendor === null);

await mock.reset();
await mock.script([{ rejectFallbacks: true }]);
p = await settled((await capture([photo])).id);
const fb = await mock.requests();
check("if the API won't take fallbacks, it asks again without and reads it", p.scan_status === "ready" && fb.length === 2 &&
  fb[0].body.fallbacks === "default" && fb[1].body.fallbacks === undefined);

// A scan that died (still "scanning" after 4 minutes).
const stale = (await adminCall("POST", "purchases", {
  client_id: 8, vendor: null, purchase_date: "2026-10-18", source: "scan", receipt_paths: atSave.receipt_paths,
  scan_status: "scanning", scan_requested_at: new Date(Date.now() - 4 * 60_000).toISOString(),
})).body[0];
await page.goto(`${APP}/app/estimator/purchases`);
const staleRow = page.getByTestId("receipts-to-check").locator(`li[data-receipt="${stale.id}"]`);
check("a scan that died shows as Needs entry, with Scan again", (await staleRow.getByText("Needs entry", { exact: true }).count()) === 1 &&
  (await staleRow.getByRole("button", { name: "Scan again" }).count()) === 1);
await mock.reset();
await staleRow.getByRole("button", { name: "Scan again" }).click();
check("…and Scan again starts it over", (await settled(stale.id, stale.scan_requested_at)).scan_status === "ready");

// --- 4. Files: PDF, tall receipts, rotation, HEIC -------------------------------------------------------
const pdfPage = await browser.newPage();
await pdfPage.setContent("<h1>THE HOME DEPOT</h1><p>Order 12345</p><p>Kilz 2 primer 24.98</p><p>Total 45.56</p>");
const pdf = join(dir, "receipt.pdf");
writeFileSync(pdf, await pdfPage.pdf({ format: "Letter" }));
await pdfPage.close();
await mock.reset();
p = await settled((await capture([pdf])).id);
const pdfReq = (await mock.requests())[0];
const docs = pdfReq.body.messages[0].content.filter((b) => b.type === "document");
check("an emailed PDF receipt is accepted and stored as a PDF", p.receipt_paths.length === 1 && p.receipt_paths[0].endsWith(".pdf"));
check("…and goes to the model as a document", docs.length === 1 && docs[0].source.media_type === "application/pdf" &&
  pdfReq.body.messages[0].content.filter((b) => b.type === "image").length === 0 && p.scan_status === "ready");
await mock.reset();
await mock.script([text(GOOD)]);
const pdfId = p.id;
await page.goto(`${APP}/app/estimator/purchases`);
await page.getByTestId("receipts-to-check").locator(`li[data-receipt="${pdfId}"]`).getByRole("button", { name: "Check" }).click();
await page.getByTestId("receipts-to-check").locator(`li[data-receipt="${pdfId}"]`).getByRole("button", { name: "Save", exact: true }).click();
await page.waitForTimeout(1500);
await page.goto(`${APP}/app/estimator/purchases/${pdfId}`);
check("…and its page opens it as a PDF, not a broken image", (await page.getByText("Open the PDF receipt").count()) === 1);

await mock.reset();
p = await settled((await capture([tall])).id);
const tallReq = (await mock.requests())[0];
const tallImages = tallReq.body.messages[0].content.filter((b) => b.type === "image").length;
check("a receipt too tall to read whole is cut into overlapping pieces", p.receipt_paths.length === 1 && p.scan_paths.length === 3 &&
  p.scan_paths.every((x) => x.startsWith("8/") && x.includes("-piece")), JSON.stringify(p.scan_paths));
check("…which the model reads instead, told they overlap", tallImages === 3 &&
  JSON.stringify(tallReq.body.messages[0].content.at(-1)).includes("overlapping pieces of ONE long receipt"));
const [tw, th] = dims(Buffer.from(await (await storageGet(p.receipt_paths[0])).arrayBuffer()));
check("…while the photo people see stays one image, full width", tw === 900 && th === 6000, `${tw}x${th}`);
check("ordinary photos are never cut", atSave.scan_paths.length === 0 &&
  reqs.at(-1).body.messages[0].content.filter((b) => b.type === "image").length === 1);

await mock.reset();
p = await settled((await capture([sideways])).id);
const [sw, sh] = dims(Buffer.from(await (await storageGet(p.receipt_paths[0])).arrayBuffer()));
check("a photo taken sideways is stored upright", sw === 1200 && sh === 1600, `${sw}x${sh}`);

if (HEIC && existsSync(HEIC)) {
  await mock.reset();
  p = await settled((await capture([HEIC])).id);
  const heicPath = p.receipt_paths[0] ?? "";
  const stored = join(dir, "stored-heic");
  writeFileSync(stored, Buffer.from(await (await storageGet(heicPath)).arrayBuffer()));
  const kind = execFileSync("file", ["-b", stored]).toString();
  check("an iPhone HEIC photo is converted to JPEG on the phone", heicPath.endsWith(".jpg") && kind.startsWith("JPEG") && p.scan_status === "ready", kind.slice(0, 40));
} else {
  console.log("SKIP  HEIC conversion — set HEIC_SAMPLE to a .heic file to run it");
}

// --- 5. From a job, as a member -------------------------------------------------------------------------
const job = (await owner.post("jobs", { client_id: 8, name: "Rita Receipt", status: "in_progress", source: "manual", address: "12 Receipt Rd" })).body[0];
const mp = await login(browser, "member@cascade.test", PHONE);
await mock.reset();
await mp.goto(`${APP}/app/jobs/${job.id}`);
await mp.waitForLoadState("networkidle");
p = await capture([photo], { at: `/app/jobs/${job.id}`, scope: mp });
check("a member's scan from a job is saved against that job", p.scan_job_id === job.id && p.created_by !== null);
p = await settled(p.id);
await mp.reload();
const jobRow = mp.getByTestId("receipts-to-check").locator(`li[data-receipt="${p.id}"]`);
check("the job page lists it to check", (await mp.getByText("Receipts from this job to check").count()) === 1 &&
  (await jobRow.getByText("Check this").count()) === 1);
await jobRow.getByRole("button", { name: "Check" }).click();
const jobForm = jobRow.getByTestId("confirm-scan");
check("…the check screen starts on this job", (await jobForm.getByRole("button", { name: "A job" }).getAttribute("aria-pressed")) === "true" &&
  (await jobForm.getByLabel("Job", { exact: true }).inputValue()) === String(job.id));
check("…and offers members no photo link or Bill as extra", (await jobRow.getByRole("link", { name: "View photo" }).count()) === 0 &&
  (await jobForm.getByRole("button", { name: "Bill as extra" }).count()) === 0);
await jobForm.getByRole("button", { name: "Save", exact: true }).click();
await mp.waitForTimeout(1500);
const jobItems = await items(p.id);
check("one tap saves it onto the job", jobItems.length === 2 && jobItems.every((i) => i.job_id === job.id && i.assignment === "job_in_bid"));

// --- 6. Scan again on a saved receipt: compare first ------------------------------------------------------
const savedId = m1[0].purchase_id;
const before = { p: await row(savedId), items: await items(savedId) };
const NEW = { ...GOOD, vendor: "The Home Depot", total: 48.56, subtotal: 45.5, items: [...GOOD.items, { description: "Painter's tape", sku: null, qty: 1, unit_price: 3, amount: 3 }] };
await mock.reset();
await mock.script([text(NEW)]);
await page.goto(`${APP}/app/estimator/purchases/${savedId}`);
let asked = (await row(savedId)).scan_requested_at ?? "";
await page.getByTestId("scan-panel").getByRole("button", { name: "Scan again" }).click();
await settled(savedId, asked);
await page.reload();
const cmp = page.getByTestId("scan-compare");
const cell = async (r, i) => cmp.locator(`tr[data-row="${r}"] td`).nth(i).textContent();
check("Scan again on a saved receipt shows the new read next to what was saved",
  (await cell("Vendor", 1)) === "Home Depot" && (await cell("Vendor", 2)) === "The Home Depot" &&
  (await cell("Total", 1)) === "$45.56" && (await cell("Total", 2)) === "$48.56" && (await cell("Items", 2)) === "3 · $45.50");
const during = { p: await row(savedId), items: await items(savedId) };
check("…and changes nothing yet", during.p.vendor === before.p.vendor && Number(during.p.total) === Number(before.p.total) &&
  JSON.stringify(during.items.map((i) => i.id)) === JSON.stringify(before.items.map((i) => i.id)));
await cmp.getByRole("button", { name: "Keep what I saved" }).click();
await page.waitForTimeout(1000);
const kept = await row(savedId);
check("Keep what I saved drops the read, nothing else", kept.scan_status === null && kept.scan_result === null && kept.vendor === "Home Depot" &&
  (await items(savedId)).length === 2);

await mock.reset();
await mock.script([text(NEW)]);
await page.reload();
asked = (await row(savedId)).scan_requested_at ?? "";
await page.getByTestId("scan-panel").getByRole("button", { name: "Scan again" }).click();
await settled(savedId, asked);
await page.reload();
await page.getByTestId("scan-compare").getByRole("button", { name: "Use the new read" }).click();
await page.getByTestId("scan-compare").getByRole("button", { name: "Save the new read" }).click();
await page.waitForTimeout(1500);
const replaced = { p: await row(savedId), items: await items(savedId) };
check("Use the new read, then Save: header and items replaced", replaced.p.vendor === "The Home Depot" && Number(replaced.p.total) === 48.56 &&
  replaced.items.length === 3 && !replaced.items.some((i) => before.items.some((b) => b.id === i.id)) && replaced.p.scan_status === null);

// Lock: an item on an invoice can't be swapped out.
const inv = (await owner.post("rpc/invoice_create_from_job", { p: {
  client_id: 8, job_id: job.id, billing_entity_id: (await adminGet("billing_entities?client_id=eq.8&select=id"))[0].id,
  customer_name: "Rita", line_items: [{ description: "Work", qtyLabel: null, amount: 100 }], subtotal_cents: 10000,
  tax_rate_pct: 0, tax_cents: 0, total_cents: 10000,
} })).body.invoice_id;
await adminCall("PATCH", `expenses?id=eq.${replaced.items[0].id}`, { invoiced_on: Number(inv) });
await mock.reset();
await mock.script([text(GOOD)]);
await page.reload();
asked = (await row(savedId)).scan_requested_at ?? "";
await page.getByTestId("scan-panel").getByRole("button", { name: "Scan again" }).click();
await settled(savedId, asked);
await page.reload();
await page.getByTestId("scan-compare").getByRole("button", { name: "Use the new read" }).click();
await page.getByTestId("scan-compare").getByRole("button", { name: "Save the new read" }).click();
await page.getByText(/on an invoice, so its items can't be replaced/).waitFor({ timeout: 10_000 }).catch(() => {});
check("…refused while an item is on an invoice, nothing changed",
  (await page.getByText(/on an invoice, so its items can't be replaced/).count()) === 1 && (await items(savedId)).length === 3 &&
  (await row(savedId)).vendor === "The Home Depot");

// --- 7. Gates -------------------------------------------------------------------------------------------
await adminCall("PATCH", "Clients?id=eq.8", { feature_receipt_ai_enabled: false });
const gate = await page.request.post(`${APP}/api/estimator/purchases/${failId}/scan`);
check("scanning switched off: refused and metered rejected", gate.status() === 403 &&
  (await meters(failId)).at(-1).status === "rejected");
await adminCall("PATCH", "Clients?id=eq.8", { feature_receipt_ai_enabled: true });
const op = await login(browser, "owner@other.test", PHONE);
check("another tenant can't scan Cascade's receipt", (await op.request.post(`${APP}/api/estimator/purchases/${failId}/scan`)).status() === 404);

// The Netlify background function, bundled the way Netlify bundles it.
const { build } = await import("esbuild");
const fnOut = join(dir, "scan-receipt-background.mjs");
await build({
  entryPoints: [new URL("../../../netlify/functions/scan-receipt-background.mts", import.meta.url).pathname],
  bundle: true, platform: "node", format: "esm", outfile: fnOut, logLevel: "error",
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
Object.assign(process.env, {
  NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
  ANTHROPIC_BASE_URL: env.ANTHROPIC_BASE_URL, ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
});
const fn = (await import(fnOut)).default;
const { createHmac } = await import("node:crypto");
const queuedRow = async () => (await adminCall("POST", "purchases", {
  client_id: 8, vendor: null, purchase_date: "2026-10-18", source: "scan", receipt_paths: atSave.receipt_paths,
  scan_status: "queued", scan_requested_at: new Date().toISOString(),
})).body[0];
const call = (body) => fn(new Request("http://fn.local/", { method: "POST", body: JSON.stringify(body) }));
const q1 = await queuedRow();
const ts = Date.now();
await call({ purchaseId: q1.id, ts, sig: "00".repeat(32) });
check("the background function refuses a bad signature", (await row(q1.id)).scan_status === "queued");
await mock.reset();
await call({ purchaseId: q1.id, ts, sig: createHmac("sha256", env.SUPABASE_SERVICE_ROLE_KEY).update(`scan.${q1.id}.${ts}`).digest("hex") });
check("…and reads a receipt the route signed for", (await row(q1.id)).scan_status === "ready" && (await mock.requests()).length === 1);
await call({ purchaseId: q1.id, ts, sig: createHmac("sha256", env.SUPABASE_SERVICE_ROLE_KEY).update(`scan.${q1.id}.${ts}`).digest("hex") });
check("…once: a repeat delivery finds it already read", (await mock.requests()).length === 1 && (await meters(q1.id)).length === 1);

// --- 8. No travel line on estimates ---------------------------------------------------------------------
await adminCall("POST", "travel_zones", { client_id: 8, label: "15–30 mi", flat_fee: 35, active: true });
await page.goto(`${APP}/app/estimator/settings`);
await page.waitForLoadState("networkidle");
check("Pricing has no Travel zones section", (await page.getByText("Travel zones").count()) === 0);
await page.goto(`${APP}/app/estimator/new?job=1`);
await page.getByPlaceholder("Search catalog…").waitFor();
check("the estimate builder has no travel zone", (await page.getByText(/Travel zone/i).count()) === 0);
await page.getByRole("button", { name: "Toilet swap" }).click();
await page.locator('input[placeholder="0"]').nth(0).fill("1");
await Promise.all([page.waitForURL(/\/app\/estimator\/\d+$/), page.getByRole("button", { name: "Save estimate" }).click()]);
const est = (await adminGet(`estimates?id=eq.${page.url().split("/").pop()}&select=travel_zone_id,resolved_travel_fee`))[0];
check("…and a new estimate carries no travel fee, even with a zone on file", est.travel_zone_id === null && Number(est.resolved_travel_fee) === 0,
  JSON.stringify(est));
check("…nor a Travel line", (await page.getByText(/^Travel/).count()) === 0);

await browser.close();
