// Slice 1 (price book) scenarios against the local stack. Assumes a fresh seed
// with estimate 1 created before v093 (see README). Run: node <this file>
import { APP, PHONE, check, launch, login } from "./browser.mjs";
import { adminGet, session } from "./api.mjs";

const money = (n) => `$${n.toFixed(2)}`;

// --- Database rules, through the API as real users ----------------------------
const owner = await session("owner@cascade.test");
const member = await session("member@cascade.test");
const other = await session("owner@other.test");

let r = await owner.post("service_catalog", { client_id: 8, name: "Gutter clean", type: "PRICED", unit: "lnft" });
check("owner adds a priced item with no price", r.status === 201 && r.body[0].unit_price === null);
const gutterId = r.body?.[0]?.id;

r = await owner.post("service_catalog", { client_id: 8, name: "Bad", type: "MEASURED", unit: "hour", labor_hours_per_unit: 1 });
check("hour is a priced-only unit", r.status === 400 && /type_shape/.test(r.body.message), r.body.message);
r = await owner.post("service_catalog", { client_id: 8, name: "Bad", type: "PRICED", unit: "each", flat_labor_hours: 1 });
check("priced item can't carry builder hours", r.status === 400 && /type_shape/.test(r.body.message));
r = await owner.post("service_catalog", { client_id: 8, name: "Bad", type: "PRICED", unit: "each", unit_price: -5 });
check("negative price refused", r.status === 400 && /unit_price_check/.test(r.body.message));
r = await owner.patch("pricing_settings?client_id=eq.8", { default_hourly_rate: -1 });
check("negative hourly rate refused", r.status === 400);

r = await owner.post("service_catalog", { client_id: 9, name: "Sneaky", type: "PRICED", unit: "each" });
check("owner can't write another tenant's price book", r.status === 403, `status ${r.status}`);
r = await member.post("service_catalog", { client_id: 8, name: "Member item", type: "PRICED", unit: "each" });
check("member can't write the price book", r.status === 403, `status ${r.status}`);
r = await other.get("service_catalog?select=client_id");
check("other tenant sees only its own rows", r.body.length > 0 && r.body.every((x) => x.client_id === 9));
r = await other.patch(`service_catalog?id=eq.${gutterId}`, { unit_price: 1 });
check("other tenant can't edit Cascade's row", r.status === 200 && r.body.length === 0);
r = await owner.get("service_catalog?select=client_id");
check("Cascade sees only its own rows", r.body.every((x) => x.client_id === 8));

const LINE = "description,qty,resolved_labor_hours,resolved_line_cost,resolved_client_amount";
const before = await adminGet(`estimate_line_items?estimate_id=eq.1&select=${LINE}&order=sort_order`);

// --- Price book on a phone ------------------------------------------------------
const browser = await launch();
const page = await login(browser, "owner@cascade.test", PHONE);
await page.goto(`${APP}/app/estimator/settings`);
const book = page.locator("#catalog");
await book.getByText("Labor, hourly", { exact: true }).waitFor();
check("Labor, hourly and Skilled labor, hourly are built in and need a price until the rates are set",
  (await book.locator("li", { hasText: /^Labor, hourly/ }).innerText()).toLowerCase().includes("needs a price") &&
  (await book.locator("li", { hasText: "Skilled labor, hourly" }).innerText()).toLowerCase().includes("needs a price"));

await book.getByRole("button", { name: "Add item" }).click();
await book.getByLabel("Name", { exact: true }).fill("Patch drywall");
await book.getByLabel("Typical hours each").fill("2");
await book.getByRole("button", { name: "Save item" }).click();
const patchRow = book.locator("li", { hasText: "Patch drywall" });
await patchRow.waitFor();
let text = (await patchRow.innerText()).toLowerCase();
check("new item with hours but no rate set needs a price", text.includes("needs a price"), text.replace(/\n/g, " | "));

const pricing = page.locator("#pricing");
await pricing.getByLabel("General hourly rate").fill("95");
await pricing.getByLabel("Skilled hourly rate").fill("125");
await pricing.getByRole("button", { name: "Save rates" }).click();
await book.locator("li", { hasText: /^Labor, hourly/ }).getByText("$95.00").waitFor();
await book.locator("li", { hasText: "Skilled labor, hourly" }).getByText("$125.00").waitFor();
await patchRow.getByText("$190.00").waitFor();
check("rates show on both built-in lines, and the item becomes 2 hr × $95 = $190.00, without a reload", true);

await book.getByRole("button", { name: /^Patch drywall/ }).click();
await book.getByLabel("Skilled").check();
check("the editor shows the price as hours × rate",
  /\$250\.00 each\s*= 2 hr × \$125\.00\/hr skilled/.test(await book.getByTestId("draft-price").innerText()),
  await book.getByTestId("draft-price").innerText());
await book.getByRole("button", { name: "Save item" }).click();
await patchRow.getByText("$250.00").waitFor();
const [patchDb] = await adminGet("service_catalog?name=eq.Patch%20drywall&client_id=eq.8&select=rate_type,unit_price,typical_hours");
check("switching it to skilled prices it 2 hr × $125 and stores no price of its own",
  patchDb.rate_type === "skilled" && patchDb.unit_price === null && Number(patchDb.typical_hours) === 2, JSON.stringify(patchDb));

await book.getByRole("button", { name: /^Toilet swap/ }).click();
await book.getByRole("button", { name: "Set my own price" }).click();
await book.getByLabel("Your price per each").fill("180");
await book.getByRole("button", { name: "Save item" }).click();
const toiletRow = book.locator("li", { hasText: "Toilet swap" });
await toiletRow.getByText("$180.00").waitFor();
const [toilet] = await adminGet("service_catalog?name=eq.Toilet%20swap&client_id=eq.8&select=type,unit,flat_labor_hours,unit_price");
check("own price on an old-builder row keeps its hours",
  toilet.type === "TASK" && Number(toilet.flat_labor_hours) === 1.5 && Number(toilet.unit_price) === 180, JSON.stringify(toilet));
check("the list says which price is your own", (await toiletRow.innerText()).includes("your own price"));

await book.getByRole("button", { name: /^Toilet swap/ }).click();
await book.getByRole("button", { name: "Use hours × rate" }).click();
await book.getByRole("button", { name: "Save item" }).click();
await toiletRow.getByText("$142.50").waitFor();
check("Use hours × rate goes back to 1.5 hr × $95 = $142.50",
  (await adminGet("service_catalog?name=eq.Toilet%20swap&client_id=eq.8&select=unit_price"))[0].unit_price === null);

const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check("no sideways scroll at 390 px", overflow <= 0, `${overflow}px`);
const clipped = await book.locator("li button > span:first-child > span:first-child").evaluateAll((els) =>
  els.filter((el) => el.scrollWidth > el.clientWidth).map((el) => el.textContent));
check("item names aren't cut off at 390 px", clipped.length === 0, clipped.join(", "));
const short = await book.locator("li > button").evaluateAll((els) => els.filter((el) => el.offsetHeight < 44).length);
check("every item is at least a 44 px tap target", short === 0, `${short} short`);

page.on("dialog", (d) => d.accept());
await book.getByRole("button", { name: /^Gutter clean/ }).click();
await book.getByRole("button", { name: "Delete" }).click();
await book.getByRole("button", { name: "Save item" }).waitFor({ state: "detached" });
check("delete from the editor removes the item",
  (await book.getByRole("button", { name: /^Gutter clean/ }).count()) === 0 &&
    (await adminGet(`service_catalog?id=eq.${gutterId}&select=id`)).length === 0);
await book.screenshot({ path: "/opt/fieldstack/e2e/slice1-price-book.png" });

// --- Old estimates and the estimate builder --------------------------------------
await page.goto(`${APP}/app/estimator/1`);
await page.getByText("$590.00").first().waitFor();
check("estimate made before v093 still shows $590.00", true);
const after = await adminGet(`estimate_line_items?estimate_id=eq.1&select=${LINE}&order=sort_order`);
check("its lines are unchanged by price edits", JSON.stringify(after) === JSON.stringify(before));

await page.goto(`${APP}/app/estimator/new?job=1`);
const search = page.getByPlaceholder("Search catalog…");
await search.waitFor();
await search.fill("Patch");
check("builder doesn't offer priced items", (await page.getByRole("button", { name: "Patch drywall" }).count()) === 0);
await search.fill("Toilet");
await page.getByRole("button", { name: "Toilet swap" }).click();
await page.locator('input[placeholder="0"]').first().fill("1");
await Promise.all([
  page.waitForURL(/\/app\/estimator\/\d+$/),
  page.getByRole("button", { name: "Save estimate" }).click(),
]);
const newId = Number(page.url().split("/").pop());
// Same 1.5 hr and cost as the pre-v093 toilet line; the $180 price-book price
// plays no part. (The client amount differs only by rounding up to $5.)
const [line] = await adminGet(`estimate_line_items?estimate_id=eq.${newId}&select=${LINE}`);
check("builder still prices from hours, not the price-book price",
  Number(line.resolved_labor_hours) === Number(before[1].resolved_labor_hours) &&
    Number(line.resolved_line_cost) === Number(before[1].resolved_line_cost) &&
    Number(line.resolved_client_amount) !== 180,
  `${line.resolved_labor_hours} hr, cost ${line.resolved_line_cost}, charged ${line.resolved_client_amount}`);

const insights = await page.goto(`${APP}/app/estimator/insights`);
check("Insights still loads", insights.status() === 200 && !(await page.getByText("Application error").count()));

// --- Isolation in the UI ----------------------------------------------------------
const otherPage = await login(browser, "owner@other.test", PHONE);
await otherPage.goto(`${APP}/app/estimator/settings`);
const otherBook = otherPage.locator("#catalog");
await otherBook.getByText("Other tenant service").waitFor();
check("other tenant's price book shows none of Cascade's items",
  (await otherBook.getByText("Patch drywall").count()) === 0 && (await otherBook.getByText("Toilet swap").count()) === 0);

await browser.close();
