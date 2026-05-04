import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Only run middleware on routes that actually need session refresh.
  // Excludes: static assets, API routes (handle their own auth), public
  // marketing pages (login, signup, onboard, reset-password), favicon,
  // images. Each excluded route saves a network round-trip to Supabase.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|login|signup|onboard|reset-password|auth/|_next/data|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf)$).*)",
  ],
};
