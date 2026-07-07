/** Instant skeleton for admin pages (see app/app/loading.tsx). */
export default function AdminLoading() {
  return (
    <main
      className="max-w-3xl mx-auto px-4 py-6 space-y-5 animate-pulse"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="h-6 w-44 bg-ink-2 rounded-sm" />
      <div className="space-y-1.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 bg-ink-1 shadow-inset-line rounded-sm" />
        ))}
      </div>
    </main>
  );
}
