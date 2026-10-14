/**
 * The receipt images behind an extra: one attached to the expense itself,
 * else the photos of the purchase it came from (a long receipt can take
 * several).
 */
export function receiptPathsFor(expense: {
  receipt_path: string | null;
  purchase: { receipt_paths: string[] | null; receipt_path: string | null } | null;
}): string[] {
  if (expense.receipt_path) return [expense.receipt_path];
  const p = expense.purchase;
  if (!p) return [];
  const paths = (p.receipt_paths ?? []).filter(Boolean);
  return paths.length > 0 ? paths : p.receipt_path ? [p.receipt_path] : [];
}

export function receiptFilename(invoiceNumber: string, expenseId: number, index: number, path: string): string {
  const ext = (path.split(".").pop() ?? "jpg").toLowerCase();
  return `${invoiceNumber}-receipt-${expenseId}${index > 0 ? `-${index + 1}` : ""}.${ext}`;
}
