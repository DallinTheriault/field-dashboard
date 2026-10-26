import { CenteredPageSkeleton } from "@/components/ui/page-skeletons";

/**
 * The Business hub's own loading screen. It lives in the (hub) route group so
 * it covers /app/estimator only: as app/app/estimator/loading.tsx it wrapped
 * every Business page, and tapping Invoices from Home showed this screen, then
 * the Invoices one, each holding the content back (React waits 300 ms after a
 * loading screen appears).
 */
export default function EstimatorLoading() {
  return <CenteredPageSkeleton />;
}
