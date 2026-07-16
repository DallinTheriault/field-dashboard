import { createClient } from "@supabase/supabase-js";
import { tracedFetch } from "./perf-trace";

/**
 * Admin Supabase client using the service-role key.
 *
 * SERVER-SIDE ONLY. Never import this into a client component. The service
 * role key bypasses RLS and can read/write every row in every table.
 *
 * Use this only for platform-admin operations where the caller has been
 * separately authenticated as a platform admin (via the ADMIN_EMAILS env
 * var check in the admin layout).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Admin Supabase client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars",
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: tracedFetch() ? { fetch: tracedFetch() } : undefined,
  });
}
