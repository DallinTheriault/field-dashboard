// Shared browser helpers for scenario scripts. playwright-core is installed
// next to the stack (fetch.sh), not as an app dependency.
import { createRequire } from "node:module";

const FIELDSTACK = process.env.FIELDSTACK ?? "/opt/fieldstack";
const { chromium } = createRequire(`${FIELDSTACK}/e2e/`)("playwright-core");

export const APP = process.env.APP_URL ?? "http://localhost:3000";
export const PASSWORD = "local-stack-only";
export const PHONE = { width: 390, height: 844 };

export async function launch() {
  return chromium.launch({
    executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });
}

export async function login(browser, email, viewport = PHONE) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);
  await page.goto(`${APP}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await Promise.all([page.waitForURL(/\/app/), page.keyboard.press("Enter")]);
  return page;
}

export function check(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}
