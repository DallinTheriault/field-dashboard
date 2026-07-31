/**
 * Smoke-suite configuration — the single place any machine- or
 * business-specific value is allowed to live.
 *
 * Everything in this directory is tracked in git, so nothing here may hardcode
 * a local path, a tenant id, a user id, or a production row id. Those come
 * from (in precedence order):
 *
 *   1. environment variables            — CI, one-off overrides
 *   2. ./smoke.config.json              — gitignored, per-developer
 *   3. a safe default, where one exists — otherwise a clear error at startup
 *
 * Credentials are NOT here and never should be: they are read at runtime from
 * the app's own .env.local, which is already gitignored.
 *
 * Copy smoke.config.example.json to smoke.config.json and fill it in.
 */
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
/** Repo root, derived — never hardcoded, so a clone anywhere works. */
export const REPO_ROOT = resolve(HERE, "..", "..");

const CONFIG_FILE = join(HERE, "smoke.config.json");
const fileConfig = existsSync(CONFIG_FILE)
  ? JSON.parse(readFileSync(CONFIG_FILE, "utf8"))
  : {};

function setting(envVar, key, fallback = undefined) {
  const value = process.env[envVar] ?? fileConfig[key] ?? fallback;
  if (value === undefined) {
    throw new Error(
      `smoke config: missing "${key}". Set ${envVar}, or add "${key}" to ` +
        `${CONFIG_FILE} (copy smoke.config.example.json to start).`,
    );
  }
  return value;
}
const num = (v) => (typeof v === "number" ? v : Number(v));

/* ---------------------------------------------------------------- runtime */

/** The app's env file. Credentials stay here; this module only reads it. */
export const ENV_FILE = setting("SMOKE_ENV_FILE", "envFile", join(REPO_ROOT, ".env.local"));

export const env = Object.fromEntries(
  readFileSync(ENV_FILE, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

export const url = env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_REF = new URL(url).hostname.split(".")[0];

/** supabase-js resolved from the APP's node_modules, wherever the repo lives. */
const appRequire = createRequire(join(REPO_ROOT, "package.json"));
export const { createClient } = appRequire("@supabase/supabase-js");

export const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
export const anonClient = () =>
  createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

/**
 * Playwright lives outside the repo (installed per-session, deliberately not a
 * project dependency), so its location is machine-specific. Loaded lazily —
 * the RLS probes never open a browser and must not require it.
 */
export function loadPlaywright() {
  const path = setting("SMOKE_PLAYWRIGHT", "playwrightPath");
  return createRequire(import.meta.url)(path);
}

/** Screenshots and crash manifests. Created on demand. */
export const OUT_DIR = (() => {
  const dir = setting("SMOKE_OUT_DIR", "outDir", join(tmpdir(), "field-smoke"));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir.replace(/\\/g, "/");
})();

export const BASE_URL = process.env.SMOKE_BASE_URL ?? fileConfig.baseUrl ?? "http://localhost:3000";
/** Scripts take an optional baseUrl argv; this honours it, then config. */
export const baseUrlFrom = (argv) => argv ?? BASE_URL;

/**
 * The deployed origin, for the two perf scripts that measure production.
 * Lazy: only those scripts need it, so a config without it stays usable.
 */
export const prodBaseUrl = () => setting("SMOKE_PROD_BASE_URL", "prodBaseUrl");

/* --------------------------------------------------------------- tenancy */

/** The tenant smoke runs may WRITE to. Never a real business. */
export const CLIENT_ID = num(setting("SMOKE_CLIENT_ID", "smokeClientId"));

/**
 * A second, READ-ONLY tenant used purely to prove isolation — cross-tenant
 * reads/writes must fail, and its data must be byte-identical after a run.
 * Nothing may ever write here.
 */
export const REF_CLIENT_ID = num(setting("SMOKE_REF_CLIENT_ID", "refClientId"));

/** The smoke tenant's owner. Scripts rotate its password; see the allowlist. */
export const SMOKE_ID = setting("SMOKE_USER_ID", "smokeUserId");
export const SMOKE_EMAIL = setting("SMOKE_USER_EMAIL", "smokeUserEmail");

/**
 * Domain for the throwaway users some suites mint (temp "member" accounts, all
 * deleted in cleanup). Derived from the smoke user rather than configured
 * separately, so there is one fewer thing to set and no real domain in the repo.
 */
export const TEMP_EMAIL_DOMAIN = SMOKE_EMAIL.split("@")[1];

/**
 * Row ids in the read-only reference tenant that isolation probes assert
 * against ("a member cannot read this job", "this job is untouched"). Real
 * production ids, so they are configured rather than committed.
 */
export const FIXTURES = {
  /** A job in REF_CLIENT_ID that must stay invisible and unmodified. */
  refJobId: num(setting("SMOKE_REF_JOB_ID", "refJobId")),
};
