import { CenteredPageSkeleton } from "@/components/ui/page-skeletons";

/**
 * The list's own loading screen, in the (list) route group so it covers
 * /app/estimator/invoices only. Above the [id] folder it also wrapped an invoice: a
 * prefetched link from elsewhere showed this list skeleton first, then the
 * detail one (see app/app/estimator/(hub)/loading.tsx).
 */
export default function InvoicesLoading() {
  return <CenteredPageSkeleton />;
}
