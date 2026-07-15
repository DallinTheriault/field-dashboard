/**
 * Automatic job-status transitions driven by the estimate lifecycle.
 * Deliberately narrow and forward-only (architect answer 1.5, 2026-07-14):
 * these two are the ONLY automatic transitions; calendar and callback flows
 * own theirs, and the manual status pill may move freely.
 */

/** A new estimate on a fresh lead moves it into the pipeline. */
export function jobStatusAfterEstimateCreated(current: string): string | null {
  return current === "lead" ? "estimated" : null;
}

/**
 * An accepted estimate version marks the job accepted — but never regresses
 * a job that's already scheduled/underway/closed, and never touches the
 * callback pipeline. A second acceptance on an already-accepted job is a
 * no-op (versions can be separately-accepted scopes of work).
 */
export function jobStatusAfterEstimateAccepted(current: string): string | null {
  return current === "lead" || current === "estimated" ? "accepted" : null;
}
