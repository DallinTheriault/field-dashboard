/**
 * Section-switch skeleton. Renders INSTANTLY inside the app shell (sidebar
 * and topbar stay put) while the next page's server render streams in —
 * before this, a click gave zero feedback for the full render time.
 */
export default function AppSectionLoading() {
  return (
    <div
      className="max-w-3xl mx-auto px-4 py-6 space-y-5 animate-pulse"
      aria-busy="true"
      aria-label="Loading"
    >
      {/* Page header */}
      <div className="space-y-2">
        <div className="h-6 w-44 bg-ink-2 rounded-sm" />
        <div className="h-3.5 w-72 bg-ink-2/70 rounded-sm" />
      </div>

      {/* Metric-ish row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 bg-ink-1 shadow-inset-line rounded-md" />
        ))}
      </div>

      {/* Content rows */}
      <div className="space-y-1.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 bg-ink-1 shadow-inset-line rounded-sm" />
        ))}
      </div>
    </div>
  );
}
