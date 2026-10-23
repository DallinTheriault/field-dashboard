/**
 * Standing perf instrumentation (PERF_SPEC) — env-gated Supabase fetch tracer.
 * Passed as `global.fetch` to the client factories so it survives
 * Next.js's own globalThis.fetch patching. Inert unless PERF_TRACE=1.
 * Every round-trip census (scripts/perf-investigation/perf-census.mjs) relies
 * on this exact hook — re-measurements must use the identical methodology.
 */
/** The project's Supabase host (supabase.co on prod, the local gateway on the local stack). */
export function supabaseHost(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host || "supabase.co";
  } catch {
    return "supabase.co";
  }
}

export function tracedFetch(): typeof fetch | undefined {
  if (process.env.PERF_TRACE !== "1") return undefined;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const t0 = Date.now();
    const res = await fetch(input as never, init);
    const t1 = Date.now();
    if (url.includes(supabaseHost())) {
      const tail = url.split(supabaseHost())[1]?.slice(0, 100) ?? "";
      console.log(`[PERFRT] ${t0} ${t1} ${t1 - t0}ms ${tail}`);
    }
    return res;
  }) as typeof fetch;
}
