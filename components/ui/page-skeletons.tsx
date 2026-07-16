import { cn } from "@/lib/cn";

/**
 * Route-level loading skeletons (perf re-plan step 1). Rendered by each
 * route's loading.tsx INSTANTLY inside the app shell while the server
 * render streams in. Before these, only the root /app boundary existed,
 * so nested navigations (jobs list → job detail, estimator subpages)
 * showed nothing for the full render time — the "dead tap".
 */

function Shimmer({ className }: { className?: string }) {
  return <div className={cn("bg-ink-2 rounded-sm", className)} />;
}

function PanelBlock({ className }: { className?: string }) {
  return (
    <div className={cn("bg-ink-1 shadow-inset-line rounded-md", className)} />
  );
}

/** Full-width list page (jobs list): header + actions + row stack. */
export function ListPageSkeleton() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="flex items-end justify-between mb-6 gap-4">
        <div className="space-y-2">
          <Shimmer className="h-3 w-16" />
          <Shimmer className="h-7 w-40" />
          <Shimmer className="h-3.5 w-24 bg-ink-2/70" />
        </div>
        <div className="flex gap-2">
          <Shimmer className="h-9 w-20 rounded-md" />
          <Shimmer className="h-9 w-24 rounded-md" />
        </div>
      </div>
      <div className="panel divide-y divide-line-subtle">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <Shimmer className="h-4 w-36" />
              <Shimmer className="h-5 w-16 rounded-full" />
            </div>
            <Shimmer className="h-3 w-52 mt-2 bg-ink-2/70" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Full-width detail page (job detail): header + chips + 3/2 panel grid. */
export function DetailPageSkeleton() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <Shimmer className="h-3 w-24 mb-5" />
      <Shimmer className="h-3 w-16 mb-2" />
      <div className="flex items-start justify-between gap-3 mb-3">
        <Shimmer className="h-7 w-56" />
        <Shimmer className="h-9 w-20 rounded-md" />
      </div>
      <div className="flex gap-2 mb-5">
        <Shimmer className="h-6 w-24 rounded-full" />
        <Shimmer className="h-6 w-28 rounded-full" />
      </div>
      <div className="flex gap-1.5 mb-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <Shimmer key={i} className="h-8 w-20 rounded-md" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3 space-y-3">
          <PanelBlock className="h-56" />
          <PanelBlock className="h-64" />
        </div>
        <div className="lg:col-span-2 space-y-3">
          <PanelBlock className="h-72" />
          <PanelBlock className="h-28" />
        </div>
      </div>
    </div>
  );
}

/**
 * Centered estimator-style page. `narrow` matches the max-w-2xl detail
 * pages (estimate / invoice detail); default matches the max-w-3xl
 * hub / list / form pages.
 */
export function CenteredPageSkeleton({ narrow = false }: { narrow?: boolean }) {
  return (
    <div
      className={cn(
        "mx-auto px-4 py-6 space-y-5 animate-pulse",
        narrow ? "max-w-2xl" : "max-w-3xl",
      )}
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="space-y-2">
        <Shimmer className="h-6 w-40" />
        <Shimmer className="h-3.5 w-64 bg-ink-2/70" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <PanelBlock key={i} className="h-16" />
      ))}
    </div>
  );
}
