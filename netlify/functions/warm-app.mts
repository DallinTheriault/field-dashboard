/**
 * Keeps the app's server function warm. After ~10 idle minutes AWS drops it
 * and the next tap waits ~4.7 s for a cold start; with a request every 5
 * minutes the first request stayed under ~1 s in 10 of 12 probes (2026-10-25).
 *
 * Calls /api/ping (204, no middleware, no Supabase). The logged time shows
 * whether a ping found the function cold (seconds) or warm (well under 1 s).
 * Separate from keepwarm.mts, which keeps Supabase from pausing. Netlify runs
 * scheduled functions only on the published production deploy.
 */
export default async (req: Request): Promise<Response> => {
  // URL is the site's main address; the invocation's own origin is the fallback.
  const base = process.env.URL || new URL(req.url).origin;
  const start = Date.now();
  try {
    const res = await fetch(`${base}/api/ping`, { signal: AbortSignal.timeout(20_000) });
    const ms = Date.now() - start;
    console.log("[warm-app]", { status: res.status, ms, base });
    return new Response(null, { status: res.ok ? 204 : 502 });
  } catch (e) {
    console.error("[warm-app] ping failed", { ms: Date.now() - start, base, error: String(e) });
    return new Response(null, { status: 502 });
  }
};

// Every 5 minutes, all day: the gap the 2026-10-25 probe showed stays warm.
export const config = { schedule: "*/5 * * * *" };
