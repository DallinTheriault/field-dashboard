/**
 * AI receipt-scanning status card — READ-ONLY for tenants (§8 correction:
 * the entitlement is a platform grant that consumes the platform's
 * Anthropic key; it's flipped in the admin console, never here). Server
 * component: no client-side write path exists at all.
 */
export function ReceiptAiStatus({
  enabled,
  scansThisMonth,
}: {
  enabled: boolean;
  scansThisMonth: number;
}) {
  return (
    <div className="px-4 py-3.5 space-y-2">
      <div className="flex items-center gap-2">
        <span
          className={`w-1.5 h-1.5 rounded-full ${enabled ? "bg-status-completed" : "bg-bone-500"}`}
        />
        <span className="text-sm text-bone-100">
          {enabled ? "Enabled" : "Not enabled"}
        </span>
        <span className="text-2xs text-bone-400">
          · managed by the platform{enabled ? "" : " — ask to have it turned on"}
        </span>
      </div>
      <p className="text-2xs text-bone-400 max-w-md">
        Receipt photos are sent to Anthropic Claude to extract the vendor,
        totals, and line items for your review — nothing is saved until you
        accept. Manual expense entry always works, with or without this.
      </p>
      <p className="text-2xs text-bone-400">
        <span className="num text-bone-300">{scansThisMonth}</span> scan
        {scansThisMonth === 1 ? "" : "s"} this month
      </p>
    </div>
  );
}
