/**
 * The browser Supabase client, loaded on first use: the app shell (idle
 * sign-out, notifications) needs it only after the page is up, so it stays
 * out of the JavaScript every page loads before it can show.
 */
export async function browserSupabase() {
  const { createClient } = await import("./client");
  return createClient();
}
