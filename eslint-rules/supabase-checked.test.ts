import { RuleTester, type Rule } from "eslint";
import { describe, it } from "vitest";
import supabaseChecked from "./supabase-checked.mjs";

const rule = supabaseChecked as unknown as Rule.RuleModule;

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: "module" } });
const wrap = (body: string) => `async function f(supabase, admin) { ${body} }`;

tester.run("field/supabase-checked", rule, {
  valid: [
    wrap(`const { data } = await supabase.from("jobs").select("id").throwOnError();`),
    wrap(`const { data, error } = await supabase.from("jobs").select("id"); if (error) throw error;`),
    wrap(`const { error: e } = await supabase.from("jobs").update({ a: 1 }).eq("id", 1); if (e) return e.message;`),
    wrap(`const r = await supabase.rpc("invoice_void", { p: 1 }); if (r.error) return r.error.message;`),
    wrap(`const [{ data: a, error: ea }, { data: b }] = await Promise.all([supabase.from("a").select(), supabase.from("b").select().throwOnError()]); if (ea) throw ea;`),
    wrap(`let q = supabase.from("contacts").select("id"); if (x) q = q.eq("a", 1); const [t, { data, error }] = await Promise.all([g(), q]); if (error) throw error;`),
    wrap(`let q = supabase.from("contacts").select("id"); q = q.eq("a", 1); const { data } = await q.throwOnError();`),
    wrap(`supabase.from("t").select("id").then(({ data, error }) => { if (error) console.error(error); });`),
    wrap(`const { error } = await admin.storage.from("receipts").remove(["a"]); if (error) throw error;`),
    wrap(`const xs = Array.from("abc"); const b = Buffer.from("x");`),
  ],
  invalid: [
    { code: wrap(`await supabase.from("jobs").update({ a: 1 }).eq("id", 1);`), errors: [{ messageId: "unchecked" }] },
    { code: wrap(`const { data } = await supabase.from("jobs").select("id");`), errors: [{ messageId: "unchecked" }] },
    { code: wrap(`const { data, error } = await supabase.from("jobs").select("id"); return data;`), errors: [{ messageId: "unused" }] },
    { code: wrap(`await admin.rpc("create_notification", { p: 1 });`), errors: [{ messageId: "unchecked" }] },
    { code: wrap(`const [{ data: a }] = await Promise.all([supabase.from("a").select()]);`), errors: [{ messageId: "unchecked" }] },
    { code: wrap(`let m = supabase.from("p").select("id"); m = m.eq("a", 1); const { data } = await m.maybeSingle();`), errors: [{ messageId: "unchecked" }] },
    { code: wrap(`return supabase.from("jobs").select("id");`), errors: [{ messageId: "unchecked" }] },
    { code: wrap(`await admin.storage.from("receipts").remove(["a"]);`), errors: [{ messageId: "unchecked" }] },
    { code: wrap(`supabase.from("t").select("id").then(({ data }) => use(data));`), errors: [{ messageId: "unchecked" }] },
  ],
});
