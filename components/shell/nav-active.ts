/**
 * Which nav item a path belongs to: the longest href that matches. Invoices
 * (/app/estimator/invoices) sits inside Business (/app/estimator), so a plain
 * prefix check would light both.
 */
export function activeHref(pathname: string | null, hrefs: readonly string[]): string | null {
  if (!pathname) return null;
  let best: string | null = null;
  for (const href of hrefs) {
    const hit = pathname === href || (href !== "/app" && pathname.startsWith(`${href}/`)) || (href !== "/app" && pathname === href);
    if (hit && (best === null || href.length > best.length)) best = href;
  }
  return best;
}
