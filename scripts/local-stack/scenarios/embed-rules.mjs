// PostgREST embeds across a composite same-tenant foreign key must name the
// constraint (`table!constraint(...)`): a second foreign key between the
// same tables would otherwise make the embed ambiguous, or bind it to the
// wrong one (v096 broke the Expenses item list this way). Shared by
// embed-check.mjs (the source) and query-errors.mjs (every request a page
// actually makes).
import { execFileSync } from "node:child_process";

const LIB = new URL("../lib.sh", import.meta.url).pathname;

/** Every foreign key in public: { name, child, parent, columns[] }. */
export function loadForeignKeys() {
  const out = execFileSync("bash", ["-c", `source "${LIB}"; psql_pg -tA -F'|' -c "
    select c.conname, c.conrelid::regclass::text, c.confrelid::regclass::text,
           (select string_agg(a.attname, ',' order by k.n)
              from unnest(c.conkey) with ordinality k(attnum, n)
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)
      from pg_constraint c
     where c.contype = 'f' and c.connamespace = 'public'::regnamespace"`], { encoding: "utf8" });
  return out.trim().split("\n").filter(Boolean).map((l) => {
    const [name, child, parent, cols] = l.split("|");
    const unq = (t) => t.replace(/^public\./, "").replace(/^"|"$/g, "");
    return { name, child: unq(child), parent: unq(parent), columns: cols.split(",") };
  });
}

/** Split a select list at top-level commas. */
function topLevel(list) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const ch of list) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** The embeds in a select: [{ name, hints[], inner }], nested. */
export function parseEmbeds(select) {
  const embeds = [];
  for (const item of topLevel(select)) {
    const open = item.indexOf("(");
    if (open < 0 || !item.endsWith(")")) continue; // a column (or a cast/aggregate without an embed)
    let head = item.slice(0, open).trim().replace(/^\.\.\./, "");
    if (head.includes(":")) head = head.slice(head.indexOf(":") + 1);
    const [name, ...hints] = head.split("!").map((s) => s.trim());
    if (!/^[A-Za-z_][\w]*$/.test(name)) continue; // count(), sum() …
    embeds.push({ name, hints: hints.filter((h) => h !== "inner" && h !== "left"), inner: item.slice(open + 1, -1) });
  }
  return embeds;
}

/**
 * Embeds in `select` (on `table`) that cross a composite foreign key without
 * naming it. Returns [{ path, constraint, embed }].
 */
export function unnamedCompositeEmbeds(table, select, fks, path = table) {
  const tables = new Set(fks.flatMap((f) => [f.child, f.parent]));
  const out = [];
  for (const e of parseEmbeds(select)) {
    // What the embed goes to, and which foreign keys it could be using.
    let target = null;
    let candidates = [];
    const viaColumn = (col) => fks.filter((f) => f.child === table && f.columns.includes(col));
    const named = e.hints.find((h) => fks.some((f) => f.name === h));
    if (tables.has(e.name)) {
      target = e.name;
      candidates = fks.filter((f) => (f.child === table && f.parent === target) || (f.child === target && f.parent === table));
      const colHint = e.hints.find((h) => !fks.some((f) => f.name === h));
      if (colHint) candidates = candidates.filter((f) => f.columns.includes(colHint));
    } else {
      candidates = viaColumn(e.name);
      target = candidates[0]?.parent ?? null;
    }
    const composite = candidates.filter((f) => f.columns.length > 1);
    if (composite.length > 0 && !composite.some((f) => f.name === named)) {
      out.push({ path: `${path} → ${e.name}`, constraint: composite.map((f) => f.name).join(" or "), embed: e.name });
    }
    if (target) out.push(...unnamedCompositeEmbeds(target, e.inner, fks, `${path} → ${e.name}`));
  }
  return out;
}
