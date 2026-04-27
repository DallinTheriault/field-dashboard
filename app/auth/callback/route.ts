import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Handles OAuth and magic-link callbacks. Supabase redirects here with a `code`
 * that we exchange for a session. Not used by email+password flow, but needed
 * if you add magic-link or social providers later.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=callback_failed`);
}
