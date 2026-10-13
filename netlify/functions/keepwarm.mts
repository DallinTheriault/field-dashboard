import { createClient } from "@supabase/supabase-js";

/**
 * Keeps the Supabase project from pausing. Supabase pauses a project after a
 * week with no database activity; this runs a real query twice a day.
 *
 * Runs on Netlify's scheduler rather than GitHub Actions, which disables
 * scheduled workflows after 60 days without a commit (it did, 2026-09-29).
 * Uses the env vars the app already has; no extra secrets. Netlify runs
 * scheduled functions only on the published production deploy.
 */
export default async (): Promise<Response> => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("[keepwarm] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set");
    return Response.json({ ok: false, error: "not configured" }, { status: 500 });
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const start = Date.now();
  // count(*) on a tiny table — enough for Postgres to register activity.
  const { count, error } = await supabase
    .from("Clients")
    .select("id", { count: "exact", head: true });
  const elapsedMs = Date.now() - start;

  if (error) {
    console.error("[keepwarm] query failed", { error: error.message, elapsedMs });
    return Response.json({ ok: false, error: error.message, elapsedMs }, { status: 500 });
  }
  console.log("[keepwarm] ok", { clients: count, elapsedMs });
  return Response.json({ ok: true, elapsedMs });
};

// 09:17 and 21:17 UTC — off the hour, when most scheduled jobs pile up.
export const config = { schedule: "17 9,21 * * *" };
