// Print an HS256 JWT for the local stack, shaped like Supabase's API keys.
// Usage: node keys.mjs <secret> <anon|service_role>
//
// Or print the session signing keys, like prod's (ES256, with the legacy HS256
// secret still trusted for the API keys):
//   node keys.mjs <secret> signing-keys
// → { "auth": [...private JWKs for GoTrue], "verify": {JWKS for PostgREST},
//     "public": {JWKS of the ES256 key, for Storage} }
import { createHmac, generateKeyPairSync, randomUUID } from "node:crypto";

const [secret, role] = process.argv.slice(2);
if (secret && role === "signing-keys") {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const kid = randomUUID();
  const ec = { ...privateKey.export({ format: "jwk" }), kid, alg: "ES256", use: "sig" };
  const ecPublic = { ...publicKey.export({ format: "jwk" }), kid, alg: "ES256", use: "sig", key_ops: ["verify"] };
  const legacy = { kty: "oct", k: Buffer.from(secret).toString("base64url"), kid: "legacy-hs256", alg: "HS256", key_ops: ["verify"] };
  console.log(JSON.stringify({
    auth: [{ ...ec, key_ops: ["sign", "verify"] }, legacy],
    verify: { keys: [ecPublic, legacy] },
    public: { keys: [ecPublic] },
  }));
  process.exit(0);
}
if (!secret || !["anon", "service_role"].includes(role)) {
  console.error("usage: node keys.mjs <secret> <anon|service_role|signing-keys>");
  process.exit(1);
}

const b64 = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const head = b64({ alg: "HS256", typ: "JWT" });
const body = b64({ iss: "supabase-local", role, iat: now, exp: now + 10 * 365 * 86400 });
const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
console.log(`${head}.${body}.${sig}`);
