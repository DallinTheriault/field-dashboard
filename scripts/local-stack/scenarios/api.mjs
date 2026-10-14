// Talk to the local stack's REST API as a given test user, the way the
// browser does (anon key + the user's session JWT).
import { readFileSync } from "node:fs";
import { PASSWORD } from "./browser.mjs";

const env = Object.fromEntries(
  readFileSync(new URL("../../../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function session(email) {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`login ${email}: ${JSON.stringify(body)}`);
  const headers = {
    apikey: ANON,
    authorization: `Bearer ${body.access_token}`,
    "content-type": "application/json",
    prefer: "return=representation",
  };
  const call = async (method, path, payload) => {
    const r = await fetch(`${URL_}/rest/v1/${path}`, {
      method,
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    const text = await r.text();
    return { status: r.status, body: text ? JSON.parse(text) : null };
  };
  return {
    get: (path) => call("GET", path),
    post: (path, payload) => call("POST", path, payload),
    patch: (path, payload) => call("PATCH", path, payload),
  };
}

/** Read as service_role (bypasses RLS) to check what actually landed. */
export async function adminGet(path) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
  return r.json();
}
