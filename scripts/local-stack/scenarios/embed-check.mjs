// Every embed the app asks PostgREST for still resolves: each literal
// .from("table").select("… other(…) …") in app/ and lib/ is run once as
// Cascade's owner (limit 1), and any error fails. Catches a schema change
// that makes an embed ambiguous or breaks it (v096's composite foreign key
// broke the Expenses item list this way) on pages a scenario doesn't open.
// Usage: node embed-check.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { check } from "./browser.mjs";
import { session } from "./api.mjs";

const ROOT = new URL("../../../", import.meta.url).pathname;
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "node_modules" && !name.startsWith(".")) walk(p);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(p);
  }
};
walk(join(ROOT, "app"));
walk(join(ROOT, "lib"));

// .from("t") then .select("…") (a plain string, no interpolation) within the same chain.
const QUERY = /\.from\(\s*"([\w]+)"\s*\)\s*\.select\(\s*(?:"([^"]*)"|`([^`$]*)`)/g;
const seen = new Map();
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(QUERY)) {
    const cols = (m[2] ?? m[3]).replace(/\s+/g, " ").trim();
    if (!cols.includes("(")) continue; // no embed
    const key = `${m[1]}?${cols}`;
    if (!seen.has(key)) seen.set(key, f.slice(ROOT.length));
  }
}

const owner = await session("owner@cascade.test");
let failed = 0;
for (const [key, file] of seen) {
  const [table, cols] = [key.slice(0, key.indexOf("?")), key.slice(key.indexOf("?") + 1)];
  const r = await owner.get(`${table}?select=${encodeURIComponent(cols)}&limit=1`);
  if (r.status >= 400) {
    failed++;
    check(`${table} embed in ${file}`, false, `${r.status} ${JSON.stringify(r.body).slice(0, 200)} — ${cols.slice(0, 120)}`);
  }
}
check(`every embed in the app resolves (${seen.size} queries)`, failed === 0, failed ? `${failed} failed` : "");
