/**
 * For a write that follows one that already happened (remembering a choice,
 * a cache, cleaning up files): its failure is logged, not returned, so a retry
 * can't redo the part that worked. Plain module: usable from server actions,
 * routes and Netlify functions alike.
 */
export function logIfFailed(label: string, result: { error: { message: string } | null }): void {
  if (result.error) console.error(`[best effort] ${label}: ${result.error.message}`);
}
