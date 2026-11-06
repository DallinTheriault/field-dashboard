/**
 * field/supabase-checked: every Supabase call checks its error.
 *
 * A call is `<x>.from("table")…`, `<x>.rpc("fn")…` or `<x>.storage.from(…)…`.
 * It's checked when its chain has `.throwOnError()`, or when the awaited
 * result's `error` is read: destructured and used (directly, from a
 * `Promise.all([...])` element, or in a `.then(({ error }) => …)` callback),
 * or read as `result.error`, or passed to logIfFailed() (a best-effort write
 * after one that already happened). A query kept in a variable is judged
 * where it's used. Anything else (a bare `await`, `{ data }` only, a query returned
 * unchecked) fails: a failed query must never look like "no rows".
 */

const NOT_A_CLIENT = /^[A-Z]/; // Array.from, Buffer.from, Object.…

function isStringArg(node) {
  return node && (node.type === "Literal" ? typeof node.value === "string" : node.type === "TemplateLiteral");
}

/** The start of a Supabase chain: .from("t"), .rpc("f"), .storage.from(…). */
function isRoot(node) {
  if (node.type !== "CallExpression" || node.callee.type !== "MemberExpression" || node.callee.computed) return false;
  const name = node.callee.property.name;
  const obj = node.callee.object;
  if (obj.type === "Identifier" && NOT_A_CLIENT.test(obj.name)) return false;
  if (name === "rpc") return isStringArg(node.arguments[0]);
  if (name !== "from") return false;
  const storage = obj.type === "MemberExpression" && !obj.computed && obj.property.name === "storage";
  return storage || isStringArg(node.arguments[0]);
}

/** Climb a call chain to its last link; collect the member names on the way. */
function chainTop(node) {
  const names = [];
  let top = node;
  for (;;) {
    const p = top.parent;
    if (p && p.type === "MemberExpression" && p.object === top) {
      if (!p.computed) names.push(p.property.name);
      top = p;
    } else if (p && p.type === "CallExpression" && p.callee === top) {
      top = p;
    } else if (p && (p.type === "TSNonNullExpression" || p.type === "TSAsExpression" || p.type === "ChainExpression")) {
      top = p;
    } else break;
  }
  return { top, names };
}

function unwrap(node) {
  let n = node.parent;
  while (n && (n.type === "TSAsExpression" || n.type === "TSNonNullExpression" || n.type === "ChainExpression")) n = n.parent;
  return n;
}

/** The `error` binding of an object pattern, if any. */
function errorBinding(pattern) {
  if (!pattern || pattern.type !== "ObjectPattern") return null;
  for (const p of pattern.properties) {
    if (p.type !== "Property") continue;
    const key = p.key.type === "Identifier" ? p.key.name : p.key.value;
    if (key !== "error") continue;
    const v = p.value.type === "AssignmentPattern" ? p.value.left : p.value;
    return v.type === "Identifier" ? v : null;
  }
  return null;
}

export default {
  meta: {
    type: "problem",
    docs: { description: "Every Supabase call checks its error (throwOnError, or reads `error`)." },
    schema: [],
    messages: {
      unchecked:
        "Supabase call with no error check: add .throwOnError(), or destructure `error` and handle it. A failed query must not look like no rows.",
      unused: "`{{name}}` holds this Supabase call's error but is never read.",
    },
  },
  create(context) {
    const source = context.sourceCode ?? context.getSourceCode();
    const scopeOf = (node) => source.getScope(node);

    function readsOf(identifier) {
      let scope = scopeOf(identifier);
      while (scope) {
        const v = scope.set.get(identifier.name);
        if (v && v.defs.some((d) => d.name === identifier)) return v.references.filter((r) => r.isRead());
        scope = scope.upper;
      }
      return [];
    }

    /** The awaited result is bound somewhere; is its error read? Reports and returns true when handled. */
    function checkBound(target, at) {
      const err = errorBinding(target);
      if (err) {
        if (readsOf(err).length === 0) context.report({ node: err, messageId: "unused", data: { name: err.name } });
        return true;
      }
      if (target && target.type === "Identifier") {
        const reads = readsOf(target);
        if (reads.some((r) => {
          const p = r.identifier.parent;
          return (p.type === "MemberExpression" && p.object === r.identifier && !p.computed && p.property.name === "error") ||
            p.type === "ReturnStatement";
        })) return true;
      }
      context.report({ node: at, messageId: "unchecked" });
      return true;
    }

    /** `await <expr>`: judge where its result goes. */
    function checkAwait(awaitNode, at) {
      // cond ? await a : await b — judged where the conditional's value goes
      let cur = awaitNode;
      let p = unwrap(cur);
      while (p?.type === "ConditionalExpression" && (p.consequent === cur || p.alternate === cur)) {
        cur = p;
        p = unwrap(cur);
      }
      awaitNode = cur;
      if (p?.type === "VariableDeclarator" && p.init === awaitNode) return checkBound(p.id, at);
      if (p?.type === "AssignmentExpression" && p.right === awaitNode) return checkBound(p.left, at);
      // (await q).error
      if (p?.type === "MemberExpression" && p.object === awaitNode && !p.computed && p.property.name === "error") return true;
      // logIfFailed("label", await q) / secondStep(await q, "Saved, but …"): a
      // write after the main one, its failure logged or said on screen
      if (p?.type === "CallExpression" && p.callee.type === "Identifier" &&
          (p.callee.name === "logIfFailed" || p.callee.name === "secondStep") && p.arguments.includes(awaitNode)) return true;
      context.report({ node: at, messageId: "unchecked" });
      return true;
    }

    /** A chain's last link: where does it go? */
    function checkTop(top, names, at) {
      if (names.includes("throwOnError")) return;
      if (names.includes("getPublicUrl")) return; // synchronous, nothing to fail
      const p = unwrap(top);
      if (!p) return context.report({ node: at, messageId: "unchecked" });

      // .then(({ data, error }) => …)
      if (names.at(-1) === "then" && top.type === "CallExpression") {
        const fn = top.arguments[0];
        if (fn && (fn.type === "ArrowFunctionExpression" || fn.type === "FunctionExpression")) {
          const err = errorBinding(fn.params[0]);
          if (err) {
            if (readsOf(err).length === 0) context.report({ node: err, messageId: "unused", data: { name: err.name } });
            return;
          }
          if (fn.params[0]?.type === "Identifier" && readsOf(fn.params[0]).some((r) => {
            const m = r.identifier.parent;
            return m.type === "MemberExpression" && !m.computed && m.property.name === "error";
          })) return;
        }
        return context.report({ node: at, messageId: "unchecked" });
      }

      if (p.type === "AwaitExpression") return checkAwait(p, at);

      // An element of `await Promise.all([...])`, destructured by position.
      if (p.type === "ArrayExpression") {
        const call = unwrap(p);
        const isAll = call?.type === "CallExpression" && call.arguments[0] === p &&
          call.callee.type === "MemberExpression" && call.callee.object.type === "Identifier" &&
          call.callee.object.name === "Promise" && ["all", "allSettled"].includes(call.callee.property.name);
        const aw = isAll ? unwrap(call) : null;
        const decl = aw?.type === "AwaitExpression" ? unwrap(aw) : null;
        const pattern = decl?.type === "VariableDeclarator" ? decl.id : decl?.type === "AssignmentExpression" ? decl.left : null;
        if (pattern?.type === "ArrayPattern") {
          const i = p.elements.indexOf(top);
          return void checkBound(pattern.elements[i], at);
        }
        return context.report({ node: at, messageId: "unchecked" });
      }

      // A query kept in a variable: judged where it's awaited.
      if (p.type === "VariableDeclarator" && p.init === top && p.id.type === "Identifier") {
        return checkBuilder(p.id, at);
      }
      if (p.type === "AssignmentExpression" && p.right === top && p.left.type === "Identifier") {
        return; // q = q.eq(…): the declaration's awaits cover it
      }
      context.report({ node: at, messageId: "unchecked" });
    }

    /** A query kept in a variable: each place it's used (not `q = q.eq(…)`) must check it. */
    function checkBuilder(id, at) {
      let used = false;
      for (const r of readsOf(id)) {
        const { top, names } = chainTop(r.identifier);
        // q = q.eq(…), or q = cond ? q.in(…) : q.is(…): still building, not using.
        let cur = top;
        let p = unwrap(cur);
        while (p?.type === "ConditionalExpression" && (p.consequent === cur || p.alternate === cur)) {
          cur = p;
          p = unwrap(cur);
        }
        if (p?.type === "AssignmentExpression" && p.right === cur && p.left.type === "Identifier" && p.left.name === id.name) continue;
        used = true;
        checkTop(top, names, r.identifier);
      }
      if (!used) context.report({ node: at, messageId: "unchecked" });
    }

    return {
      CallExpression(node) {
        if (!isRoot(node)) return;
        const { top, names } = chainTop(node);
        checkTop(top, names, node);
      },
    };
  },
};
