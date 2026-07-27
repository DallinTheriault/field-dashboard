"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Full-size receipt viewer with multi-photo paging. URLs arrive pre-signed
 * from ONE batched server pass — this component never mints anything.
 */
export function PurchasePhotos({
  urls,
  vendor,
}: {
  urls: string[];
  vendor: string;
}) {
  const [i, setI] = useState(0);
  const many = urls.length > 1;

  return (
    <section className="panel overflow-hidden">
      <div className="relative bg-ink-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={urls[i]}
          alt={`${vendor} receipt${many ? ` (${i + 1} of ${urls.length})` : ""}`}
          className="w-full max-h-[70vh] object-contain"
        />
        {many && (
          <>
            <button
              type="button"
              onClick={() => setI((v) => (v - 1 + urls.length) % urls.length)}
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 -translate-y-1/2 btn-secondary h-9 w-9 px-0"
            >
              <ChevronLeft size={15} />
            </button>
            <button
              type="button"
              onClick={() => setI((v) => (v + 1) % urls.length)}
              aria-label="Next photo"
              className="absolute right-2 top-1/2 -translate-y-1/2 btn-secondary h-9 w-9 px-0"
            >
              <ChevronRight size={15} />
            </button>
          </>
        )}
      </div>
      {many && (
        <div className="px-4 py-2 text-2xs text-bone-400 num text-center">
          {i + 1} / {urls.length}
        </div>
      )}
    </section>
  );
}
