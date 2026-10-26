/**
 * Keep-warm target for netlify/functions/warm-app.mts. Answers from the same
 * server function every page uses, but skips the middleware (it excludes
 * api/) and never touches Supabase, so a ping costs as little as a request
 * can. Never cached: a cached answer would not wake the function.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
