/**
 * For a write that follows one that already happened (remembering a choice,
 * a cache, cleaning up files): its failure is logged, not returned, so a retry
 * can't redo the part that worked. Plain module: usable from server actions,
 * routes and Netlify functions alike.
 */
export function logIfFailed(label: string, result: { error: { message: string } | null }): void {
  if (result.error) console.error(`[best effort] ${label}: ${result.error.message}`);
}

/**
 * The second step after a main write (the job following its estimate, a
 * remembered choice): its failure doesn't fail the action (a retry would redo
 * the part that worked) but is said on screen: returns "<sentence>: <why>",
 * e.g. "Saved, but the job's quoted price and status didn't update: …", or
 * undefined when it worked.
 */
export function secondStep(result: { error: { message: string } | null }, sentence: string): string | undefined {
  if (!result.error) return undefined;
  console.error(`[second step] ${sentence}: ${result.error.message}`);
  return `${sentence}: ${result.error.message}`;
}
