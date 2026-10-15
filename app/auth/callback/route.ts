import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Auth callback for Supabase email confirmation, password reset, OAuth,
 * and magic-link flows. Supabase redirects here after the user clicks a
 * link in their email; we exchange the code for a session and route them
 * onward.
 *
 * Routing decisions:
 *   - `?type=recovery` → /reset-password (let user set a new password)
 *   - `?next=...` → that path (set by client-side flows that need a return URL)
 *   - Default → /app (the dashboard root)
 *
 * If the code exchange fails, send to /login with a friendly error param
 * rather than leaving the user on a blank /auth/callback URL.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const type = searchParams.get("type");
  const next = searchParams.get("next");

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=missing_code`,
      { status: 303 },
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Common case: link expired (>24hr old) or already used
    return NextResponse.redirect(
      `${origin}/login?error=link_invalid`,
      { status: 303 },
    );
  }

  // Password recovery flow lands on /reset-password where the user
  // sets a new password before continuing.
  if (type === "recovery") {
    return NextResponse.redirect(`${origin}/reset-password`, { status: 303 });
  }

  // Everything else lands at /app (or `next`). Someone signed in but not on
  // a tenant sees /app/layout's "ask the owner to add you" panel. `next` must
  // be a path on this site: "@evil.com" or "//evil.com" would leave it.
  const safeNext = next && /^\/(?![/\\])/.test(next) ? next : "/app";
  return NextResponse.redirect(`${origin}${safeNext}`, { status: 303 });
}
