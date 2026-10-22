"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { PropertyMiles as Miles } from "@/lib/mileage/property-miles";
import { propertyMilesNow } from "./mileage-actions";
import { MapCredit } from "./map-credit";

/** "18.5 mi from your base · Check in Google Maps" for a property (owner/manager). */
export function PropertyMiles({ address }: { address: string }) {
  const [m, setM] = useState<Miles | null>(null);
  useEffect(() => {
    let live = true;
    propertyMilesNow(address).then((r) => live && r.ok && setM(r.data ?? null));
    return () => {
      live = false;
    };
  }, [address]);
  if (!m || m.status === "no_base") return null;
  if (m.status === "no_address") {
    return (
      <span className="text-2xs text-status-lead" data-testid="property-miles">
        Can&apos;t find this address on the map, so trips here need miles typed in.
      </span>
    );
  }
  return (
    <span className="text-2xs text-bone-400 inline-flex items-center gap-2 flex-wrap" data-testid="property-miles">
      {m.status === "ok" ? (
        <span>
          <span className="num text-bone-100">{m.miles}</span> mi from your base, one way
        </span>
      ) : (
        <span>Couldn&apos;t calculate miles, try again later</span>
      )}
      <a href={m.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-field-400 hover:text-field-300">
        <ExternalLink size={10} />
        Check in Google Maps
      </a>
      <MapCredit inline />
    </span>
  );
}
