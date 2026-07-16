// Next.js instrumentation hook — auto-loaded for server + edge runtimes.
// See https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }

  // Standing perf instrumentation (PERF_SPEC) — env-gated, inert unless PERF_TRACE=1.
  // Catches Supabase traffic that bypasses the client factories (e.g. direct fetch).
  if (process.env.PERF_TRACE === "1" && process.env.NEXT_RUNTIME === "nodejs") {
    const orig = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const t0 = Date.now();
      const res = await orig(input as never, init);
      const t1 = Date.now();
      if (url.includes("supabase.co")) {
        const tail = url.split("supabase.co")[1]?.slice(0, 100) ?? "";
        console.log(`[PERFRT] ${t0} ${t1} ${t1 - t0}ms ${tail}`);
      }
      return res;
    }) as typeof fetch;
  }
}
