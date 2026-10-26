import { ListPageSkeleton } from "@/components/ui/page-skeletons";

/**
 * The list's own loading screen, in the (list) route group so it covers
 * /app/jobs only. Above the [id] folder it also wrapped a job page: a
 * prefetched link from elsewhere showed this list skeleton first, then the
 * detail one (see app/app/estimator/(hub)/loading.tsx).
 */
export default function JobsLoading() {
  return <ListPageSkeleton />;
}
