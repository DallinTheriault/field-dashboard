// Every embed the app asks PostgREST for still resolves, and every embed
// across a composite same-tenant foreign key names its constraint. Each
// .from("table").select("… other(…) …") in app/ and lib/ (with ${CONSTANT}
// parts filled in from the source's string constants) is run once as
// Cascade's owner (limit 1): an error fails, and so does an embed like
// `invoices(…)` from expenses where `invoices!expenses_invoice_same_tenant(…)`
// is meant. Catches a schema change that makes an embed ambiguous or breaks
// it (v096's composite foreign key broke the Expenses item list this way) on
// pages a scenario doesn't open. query-errors.mjs applies the same rule to
// every request the pages actually make.
// Usage: node embed-check.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { check } from "./browser.mjs";
import { session } from "./api.mjs";
import { loadForeignKeys, unnamedCompositeEmbeds } from "./embed-rules.mjs";

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
walk(join(ROOT, "components"));
const sources = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));

// String constants anywhere in the source (no interpolation of their own).
const constants = new Map();
for (const src of sources.values()) {
  for (const m of src.matchAll(/\bconst ([A-Z][A-Z0-9_]*)\s*=\s*(?:"([^"]*)"|`([^`$]*)`)/g)) constants.set(m[1], m[2] ?? m[3]);
}
const fill = (s) => s.replace(/\$\{\s*([A-Z][A-Z0-9_]*)\s*\}/g, (all, name) => (constants.has(name) ? constants.get(name) : all));

// .from("t") then .select("…") or .select(`…${CONST}…`) within the same chain.
const QUERY = /\.from\(\s*"([\w]+)"\s*\)\s*\.select\(\s*(?:"([^"]*)"|`([^`]*)`)/g;
const seen = new Map();
let unresolved = 0;
for (const [f, src] of sources) {
  for (const m of src.matchAll(QUERY)) {
    const cols = fill((m[2] ?? m[3]).replace(/\s+/g, " ").trim());
    if (cols.includes("${")) { unresolved++; continue; }
    if (!cols.includes("(")) continue; // no embed
    const key = `${m[1]}?${cols}`;
    if (!seen.has(key)) seen.set(key, f.slice(ROOT.length));
  }
}

const fks = loadForeignKeys();
const owner = await session("owner@cascade.test");
let failed = 0;
let unnamed = 0;
for (const [key, file] of seen) {
  const [table, cols] = [key.slice(0, key.indexOf("?")), key.slice(key.indexOf("?") + 1)];
  const r = await owner.get(`${table}?select=${encodeURIComponent(cols)}&limit=1`);
  if (r.status >= 400) {
    failed++;
    check(`${table} embed in ${file}`, false, `${r.status} ${JSON.stringify(r.body).slice(0, 200)} — ${cols.slice(0, 120)}`);
  }
  for (const v of unnamedCompositeEmbeds(table, cols, fks)) {
    unnamed++;
    check(`${file}: ${v.path} names its constraint`, false, `use !${v.constraint}`);
  }
}
check(`every embed in the app resolves (${seen.size} queries)`, failed === 0, failed ? `${failed} failed` : "");
check(`every embed across a composite same-tenant key names it (${fks.filter((f) => f.columns.length > 1).length} such keys)`,
  unnamed === 0, unnamed ? `${unnamed} don't` : "");
if (unresolved) console.log(`(${unresolved} selects built at run time are checked by query-errors instead)`);
