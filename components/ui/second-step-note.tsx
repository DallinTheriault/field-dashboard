/**
 * "Saved, but … didn't: …": the main change worked and a step after it didn't
 * (the job following its estimate, a remembered choice). Said on screen, not
 * as a failure: retrying would redo the part that worked.
 */
export function SecondStepNote({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return (
    <div role="status" data-testid="second-step-warning" className="panel px-4 py-2.5 text-sm text-status-lead">
      {text.slice(0, 400)}
    </div>
  );
}

/** The ?warn= a save hands to the page it opens next. */
export function withWarning(href: string, warning: string | undefined): string {
  return warning ? `${href}${href.includes("?") ? "&" : "?"}warn=${encodeURIComponent(warning)}` : href;
}
