import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { tracedFetch } from './perf-trace';

/**
 * Refreshes the user's session cookie on every request and guards protected routes.
 * Unauthenticated users hitting /dashboard/* are redirected to /login.
 *
 * The session is verified in memory: getClaims() checks the access token's
 * ES256 signature against the project's published keys (cached 10 minutes per
 * instance), so a tap no longer waits on a Supabase Auth round trip from the
 * edge. It still refreshes an expired session (getSession inside it), which is
 * the one network call left, about once an hour. Like the database's row
 * rules, it trusts a validly signed token until it expires (at most an hour).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: tracedFetch() ? { fetch: tracedFetch() } : undefined,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: do not run code between createServerClient and getClaims().
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ? { id: data.claims.sub } : null;

  const pathname = request.nextUrl.pathname;
  const isProtected = pathname.startsWith('/dashboard');
  const isAuthPage = pathname === '/login';

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
