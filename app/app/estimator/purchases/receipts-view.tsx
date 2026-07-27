"use client";

import { useState } from "react";
import Link from "next/link";
import { ImageOff, LayoutGrid, List, Receipt } from "lucide-react";

export type ReceiptRow = {
  id: number;
  vendor: string;
  purchaseDate: string;
  total: number | null;
  itemCount: number;
  unassignedCount: number;
  photoCount: number;
  thumbUrl: string | null;
};

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/**
 * Receipts — the purchase-level lens (RECEIPTS_VIEW_SPEC §6.2). Same
 * purchases/expenses rows the Items list reads; no new tables. Every purchase
 * appears, including photo-less manual entries. Thumbnails come from ONE
 * batched signed-URL pass done server-side, and images are lazy so a long list
 * doesn't pull megabytes on first paint.
 */
export function ReceiptsView({ receipts }: { receipts: ReceiptRow[] }) {
  const [grid, setGrid] = useState(false);

  return (
    <section className="panel">
      <div className="px-4 py-3 border-b border-line flex items-center gap-2">
        <Receipt size={13} className="text-bone-400" />
        <h2 className="text-sm font-semibold text-bone-100">Receipts</h2>
        <span className="text-2xs text-bone-400">
          {receipts.length} purchase{receipts.length === 1 ? "" : "s"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setGrid(false)}
            aria-label="List view"
            aria-pressed={!grid}
            className={`btn-ghost h-7 w-7 px-0 ${!grid ? "text-field-400" : "text-bone-500"}`}
          >
            <List size={13} />
          </button>
          <button
            type="button"
            onClick={() => setGrid(true)}
            aria-label="Grid view"
            aria-pressed={grid}
            className={`btn-ghost h-7 w-7 px-0 ${grid ? "text-field-400" : "text-bone-500"}`}
          >
            <LayoutGrid size={13} />
          </button>
        </div>
      </div>

      {receipts.length === 0 ? (
        <p className="px-4 py-4 text-2xs text-bone-400">
          No purchases yet — scan a receipt or log one above.
        </p>
      ) : grid ? (
        <div className="p-3 grid grid-cols-3 sm:grid-cols-4 gap-2">
          {receipts.map((r) => (
            <Link
              key={r.id}
              href={`/app/estimator/purchases/${r.id}`}
              prefetch={false}
              className="block group"
            >
              <div className="aspect-square rounded-sm overflow-hidden bg-ink-2 shadow-inset-line flex items-center justify-center">
                {r.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.thumbUrl}
                    alt={`${r.vendor} receipt`}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover group-hover:opacity-90"
                  />
                ) : (
                  <ImageOff size={16} className="text-bone-500" />
                )}
              </div>
              <div className="mt-1 text-2xs text-bone-300 truncate">{r.vendor}</div>
              <div className="text-2xs text-bone-500 num">
                {r.purchaseDate.slice(5)}
                {r.total !== null && ` · ${usd.format(r.total)}`}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-line-subtle">
          {receipts.map((r) => (
            <li key={r.id}>
              <Link
                href={`/app/estimator/purchases/${r.id}`}
                prefetch={false}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-ink-2"
              >
                <div className="w-11 h-11 shrink-0 rounded-sm overflow-hidden bg-ink-2 shadow-inset-line flex items-center justify-center">
                  {r.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.thumbUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageOff size={14} className="text-bone-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-bone-100 truncate">{r.vendor}</div>
                  <div className="text-2xs text-bone-400 num">
                    {r.purchaseDate.slice(0, 10)}
                    {" · "}
                    {r.itemCount} item{r.itemCount === 1 ? "" : "s"}
                    {r.photoCount > 1 && ` · ${r.photoCount} photos`}
                  </div>
                </div>
                {r.unassignedCount > 0 && (
                  <span className="chip normal-case tracking-normal border-status-lead/50 text-status-lead shrink-0">
                    {r.unassignedCount} unassigned
                  </span>
                )}
                {r.total !== null && (
                  <span className="num text-sm text-bone-100 shrink-0">
                    {usd.format(r.total)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
