import { unstable_rethrow } from "next/navigation";

export type Failed = { ok: false; error: string };

/** A thrown error as the sentence an action shows: the database's own message when there is one. */
export function failureMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "";
  return m.trim() || "Something went wrong. Nothing was saved; try again.";
}

/**
 * Run a server action's body with every Supabase call checked
 * (.throwOnError()): a failed read or write comes back as { ok: false, error }
 * the screen shows, never as an empty result or a success that didn't happen,
 * and never as a thrown error that leaves the screen waiting. Next's own
 * redirect and not-found signals pass through.
 */
export async function failLoudly<T>(body: () => Promise<T>): Promise<T | Failed> {
  try {
    return await body();
  } catch (e) {
    unstable_rethrow(e);
    console.error("[action]", e);
    return { ok: false, error: failureMessage(e) };
  }
}

export { logIfFailed, secondStep } from "@/lib/supabase/log-if-failed";
