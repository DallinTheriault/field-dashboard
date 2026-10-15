// Step 3: simple pricing. Four rates on screen, price-book work priced from
// typical hours × general or skilled, the skilled hourly line, and "Save to
// price book" from an hourly job line. Run through step3.sh (fresh stack at
// v097, a Sharpline stand-in, then v098).
import { APP, PHONE, check, launch, login } from "./browser.mjs";
import { adminCall, adminGet, session } from "./api.mjs";

const owner = await session("owner@cascade.test");
const member = await session("member@cascade.test");
let r;

// --- v098 on existing data ------------------------------------------------------------------
const [sharp] = await adminGet("pricing_settings?client_id=eq.1&select=default_hourly_rate,skilled_hourly_rate,minimum_job_charge,material_markup_pct,desired_annual_owner_pay,margin_pct");
check("Sharpline gets general $95, skilled $125, minimum $150, markup 0%; its old calculator values stay",
  Number(sharp.default_hourly_rate) === 95 && Number(sharp.skilled_hourly_rate) === 125 &&
  Number(sharp.minimum_job_charge) === 150 && Number(sharp.material_markup_pct) === 0 &&
  Number(sharp.desired_annual_owner_pay) === 60000 && Number(sharp.margin_pct) === 0.4, JSON.stringify(sharp));
const [cas] = await adminGet("pricing_settings?client_id=eq.8&select=default_hourly_rate,skilled_hourly_rate,minimum_job_charge,material_markup_pct");
check("other tenants' rates are untouched", cas.default_hourly_rate === null && cas.skilled_hourly_rate === null &&
  Number(cas.material_markup_pct) === 0.15, JSON.stringify(cas));
const oldRows = await adminGet("service_catalog?client_id=eq.8&select=rate_type");
check("existing price book rows bill at the general rate", oldRows.length > 0 && oldRows.every((x) => x.rate_type === "general"));
r = await owner.patch("pricing_settings?client_id=eq.8", { skilled_hourly_rate: -1 });
check("a negative skilled rate is refused", r.status === 400 && /skilled_hourly_rate_check/.test(r.body.message));
r = await owner.post("service_catalog", { client_id: 8, name: "Bad", type: "PRICED", unit: "each", rate_type: "expert" });
check("rate type is general or skilled", r.status === 400 && /rate_type_check/.test(r.body.message));
r = await member.patch("pricing_settings?client_id=eq.8", { skilled_hourly_rate: 1 });
check("a member can't change rates", r.status === 200 && r.body.length === 0);

const before = (await adminGet("pricing_settings?client_id=eq.8&select=desired_annual_owner_pay,hours_worked_per_week,utilization_pct,margin_pct,rounding_increment"))[0];

// --- Your rates, on a phone --------------------------------------------------------------------
const browser = await launch();
const page = await login(browser, "owner@cascade.test", PHONE);
await page.goto(`${APP}/app/estimator/settings`);
const rates = page.locator("#pricing");
await rates.getByLabel("General hourly rate").waitFor();
const labels = (await rates.locator(".field-label").allTextContents()).map((t) => t.trim());
check("Your rates has exactly four inputs: general, skilled, minimum, markup",
  (await rates.locator("input").count()) === 4 &&
  labels.join("|") === "General hourly rate|Skilled hourly rate|Minimum job charge|Material markup", labels.join("|"));
const pageText = await page.locator("main").innerText();
check("no pay, hours, utilization, margin or overhead calculator on screen",
  !/utilization|margin %|overhead|loaded rate|sell rate|pays you/i.test(pageText));
check("plain-English headings", /^Pricing$/m.test(pageText) && /Your rates/.test(pageText) && /Old estimate builder only/.test(pageText));
check("markup shows as a percent", (await rates.getByLabel("Material markup").inputValue()) === "15");

await rates.getByLabel("General hourly rate").fill("abc");
await rates.getByRole("button", { name: "Save rates" }).click();
await rates.getByText("General rate must be a number").waitFor();
check("a bad rate is refused on screen and nothing is saved",
  (await adminGet("pricing_settings?client_id=eq.8&select=default_hourly_rate"))[0].default_hourly_rate === null);

await rates.getByLabel("General hourly rate").fill("95");
await rates.getByLabel("Skilled hourly rate").fill("125");
await rates.getByLabel("Minimum job charge").fill("150");
await rates.getByLabel("Material markup").fill("0");
await rates.getByRole("button", { name: "Save rates" }).click();
await rates.getByText("Saved.").waitFor();
const after = (await adminGet("pricing_settings?client_id=eq.8&select=default_hourly_rate,skilled_hourly_rate,minimum_job_charge,material_markup_pct,desired_annual_owner_pay,hours_worked_per_week,utilization_pct,margin_pct,rounding_increment"))[0];
check("saving writes the four rates",
  Number(after.default_hourly_rate) === 95 && Number(after.skilled_hourly_rate) === 125 &&
  Number(after.minimum_job_charge) === 150 && Number(after.material_markup_pct) === 0, JSON.stringify(after));
check("…and leaves the old calculator's columns alone",
  Object.keys(before).every((k) => Number(before[k]) === Number(after[k])), JSON.stringify(before));
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check("no sideways scroll on Pricing at 390 px", overflow <= 0, `${overflow}px`);
await rates.screenshot({ path: "/opt/fieldstack/e2e/step3-rates.png" });

// --- Price book work priced from hours × rate --------------------------------------------------
const entry = async (row) => (await owner.post("service_catalog", { client_id: 8, type: "PRICED", ...row })).body[0];
await entry({ name: "Hang door", unit: "each", typical_hours: 2 });
await entry({ name: "Cabinet spray", unit: "each", typical_hours: 4, rate_type: "skilled" });
await entry({ name: "Haul away", unit: "each", unit_price: 60 });

const job = (await owner.post("jobs", { client_id: 8, name: "Rates Rita", status: "scheduled", source: "manual", address: "1 Rate St" })).body[0];
await page.goto(`${APP}/app/jobs/${job.id}`);
const scope = page.getByTestId("scope");
const picker = scope.getByLabel("Add from price book");
await picker.waitFor();
await page.waitForLoadState("networkidle");
const row = (title) => scope.locator(`li[data-line="${title}"]`);
const pickerPrice = async (query, name) => {
  await picker.click();
  await picker.fill(query);
  const b = scope.getByRole("button", { name: new RegExp(`^${name}`) });
  await b.waitFor();
  return (await b.innerText()).replace(/\s+/g, " ");
};
check("the picker offers Labor, hourly at $95/hr", (await pickerPrice("labor", "Labor, hourly")).includes("$95.00/hr"));
check("…and Skilled labor, hourly at $125/hr", (await pickerPrice("skilled", "Skilled labor, hourly")).includes("$125.00/hr"));
check("work priced from hours: 2 hr × $95 general", (await pickerPrice("hang", "Hang door")).includes("$190.00/ea"));
check("…4 hr × $125 skilled", (await pickerPrice("cabinet", "Cabinet spray")).includes("$500.00/ea"));
check("…and your own price wins", (await pickerPrice("haul", "Haul away")).includes("$60.00/ea"));

const pick = async (query, name) => {
  await picker.click();
  await picker.fill(query);
  await scope.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await row(name).waitFor();
};
await pick("hang", "Hang door");
await pick("skilled", "Skilled labor, hourly");
const lines = await adminGet(`tasks?job_id=eq.${job.id}&select=title,qty,unit,unit_price&order=id`);
check("picked lines copy the price: Hang door $190 each, Skilled labor $125/hr",
  lines.length === 2 && Number(lines[0].unit_price) === 190 && lines[0].unit === "each" &&
  lines[1].title === "Skilled labor, hourly" && Number(lines[1].unit_price) === 125 && lines[1].unit === "hour", JSON.stringify(lines));

// --- Save to price book --------------------------------------------------------------------------
const skilledRow = row("Skilled labor, hourly");
// Hours step by half an hour: 1 → 3.
for (let i = 0; i < 4; i++) await skilledRow.getByRole("button", { name: "More" }).click();
await skilledRow.getByText("$375.00").waitFor();
await page.waitForTimeout(800);
check("an each line has no Save to price book",
  await (async () => {
    await row("Hang door").locator("button[aria-expanded]").click();
    const n = await row("Hang door").getByRole("button", { name: "Save to price book" }).count();
    await row("Hang door").locator("button[aria-expanded]").click();
    return n === 0;
  })());
// One line opens at a time, so open the skilled line after that check.
await skilledRow.locator("button[aria-expanded]").click();
await skilledRow.getByRole("button", { name: "Save to price book" }).click();
const form = skilledRow.getByTestId("save-to-price-book");
check("the form starts with the line's hours and its skilled rate, and no built-in name",
  (await form.getByLabel("Name in the price book").inputValue()) === "" &&
  (await form.getByLabel("Typical hours").inputValue()) === "3" &&
  (await form.getByLabel("Skilled").isChecked()));
check("it shows the price it will have", (await form.getByTestId("save-price").innerText()).includes("$375.00 each (3 hr × $125.00/hr)"),
  await form.getByTestId("save-price").innerText());
await form.getByRole("button", { name: "Save", exact: true }).click();
await form.getByText("Give it a name").waitFor();
check("a name is required", true);
await form.getByLabel("Name in the price book").fill("Hang door");
await form.getByRole("button", { name: "Save", exact: true }).click();
await form.getByText("already in the price book").waitFor();
check("a name already in the price book is refused", true);
await form.getByLabel("Name in the price book").fill("Spray cabinet doors");
await form.getByRole("button", { name: "Save", exact: true }).click();
await skilledRow.getByText('Saved "Spray cabinet doors" to the price book at $375.00 each.').waitFor();
const [saved] = await adminGet("service_catalog?client_id=eq.8&name=eq.Spray%20cabinet%20doors&select=type,unit,typical_hours,rate_type,unit_price,active");
check("it becomes a price book entry: each, 3 hr, skilled, priced from hours",
  saved && saved.type === "PRICED" && saved.unit === "each" && Number(saved.typical_hours) === 3 &&
  saved.rate_type === "skilled" && saved.unit_price === null && saved.active, JSON.stringify(saved));
const [skilledLine] = await adminGet(`tasks?job_id=eq.${job.id}&title=eq.Skilled%20labor%2C%20hourly&select=qty,unit,unit_price,service_id`);
check("the job line itself is unchanged", Number(skilledLine.qty) === 3 && skilledLine.unit === "hour" &&
  Number(skilledLine.unit_price) === 125 && skilledLine.service_id === null, JSON.stringify(skilledLine));
const overflowJob = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check("no sideways scroll on the job at 390 px", overflowJob <= 0, `${overflowJob}px`);
await page.screenshot({ path: "/opt/fieldstack/e2e/step3-job.png", fullPage: true });

// A custom hours line can be saved too, named after the line.
await scope.getByLabel("Custom line title").fill("Prep trim");
await scope.getByRole("button", { name: "Hours", exact: true }).click();
await scope.getByLabel("Line hours").fill("1.5");
await scope.getByRole("button", { name: "Add", exact: true }).click();
await row("Prep trim").waitFor();
await page.waitForTimeout(500);
await row("Prep trim").locator("button[aria-expanded]").click();
await row("Prep trim").getByRole("button", { name: "Save to price book" }).click();
const form2 = row("Prep trim").getByTestId("save-to-price-book");
check("a custom hours line starts with its own name and the general rate",
  (await form2.getByLabel("Name in the price book").inputValue()) === "Prep trim" && (await form2.getByLabel("General").isChecked()));
await form2.getByRole("button", { name: "Save", exact: true }).click();
await row("Prep trim").getByText("to the price book at $142.50 each").waitFor();

// --- Rates change prices going forward, never existing lines -------------------------------------
await page.goto(`${APP}/app/estimator/settings`);
await page.locator("#pricing").getByLabel("General hourly rate").fill("100");
await page.locator("#pricing").getByRole("button", { name: "Save rates" }).click();
const book = page.locator("#catalog");
await book.locator("li", { hasText: "Prep trim" }).getByText("$150.00").waitFor();
check("a new general rate reprices general work in the price book (1.5 hr × $100)", true);
check("…but not skilled work", (await book.locator("li", { hasText: "Spray cabinet doors" }).innerText()).includes("$375.00"));
const linesAfter = await adminGet(`tasks?job_id=eq.${job.id}&select=title,unit_price&order=id`);
check("lines already on the job keep their prices", Number(linesAfter[0].unit_price) === 190 && Number(linesAfter[2].unit_price) === 95,
  JSON.stringify(linesAfter));

// --- Members ---------------------------------------------------------------------------------------
const mp = await login(browser, "member@cascade.test", PHONE);
await mp.goto(`${APP}/app/jobs/${job.id}`);
await mp.getByTestId("scope").waitFor();
await mp.getByTestId("scope").locator(`li[data-line="Skilled labor, hourly"] button[aria-expanded]`).click();
check("members don't get Save to price book", (await mp.getByRole("button", { name: "Save to price book" }).count()) === 0);
await browser.close();
