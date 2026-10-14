// Print an HS256 JWT for the local stack, shaped like Supabase's API keys.
// Usage: node keys.mjs <secret> <anon|service_role>
import { createHmac } from "node:crypto";

const [secret, role] = process.argv.slice(2);
if (!secret || !["anon", "service_role"].includes(role)) {
  console.error("usage: node keys.mjs <secret> <anon|service_role>");
  process.exit(1);
}

const b64 = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const head = b64({ alg: "HS256", typ: "JWT" });
const body = b64({ iss: "supabase-local", role, iat: now, exp: now + 10 * 365 * 86400 });
const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
console.log(`${head}.${body}.${sig}`);
