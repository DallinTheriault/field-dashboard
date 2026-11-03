/**
 * A download's file name from the business's name: "Sharpline Painting" and
 * 2026 → "sharpline-painting-pnl-2026.csv". Letters and digits only, so it is
 * safe in a Content-Disposition header; "field" when there is no usable name.
 */
export function exportFileName(business: string | null | undefined, what: string, year: number): string {
  const slug = (business ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return `${slug || "field"}-${what}-${year}.csv`;
}
