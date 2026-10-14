// Create an estimate through the estimate builder UI, as Cascade's owner:
// 400 sqft of "Walls - 2 coats" + one "Toilet swap" on job 1. Run before a
// migration to have real pre-migration data to check afterwards.
import { APP, launch, login } from "./browser.mjs";

const browser = await launch();
const page = await login(browser, "owner@cascade.test");
await page.goto(`${APP}/app/estimator/new?job=1`);
await page.getByPlaceholder("Search catalog…").waitFor();
await page.getByRole("button", { name: "Walls - 2 coats" }).click();
await page.getByRole("button", { name: "Toilet swap" }).click();
const qty = page.locator('input[placeholder="0"]');
await qty.nth(0).fill("400");
await qty.nth(1).fill("1");
await Promise.all([
  page.waitForURL(/\/app\/estimator\/\d+$/),
  page.getByRole("button", { name: "Save estimate" }).click(),
]);
console.log(`estimate ${page.url().split("/").pop()} saved`);
await browser.close();
