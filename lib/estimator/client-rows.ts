/**
 * Client-facing document rows — the ONLY shape that may cross into a
 * client-visible surface (estimate PDF, invoice line_items, hosted invoice).
 * Built exclusively from frozen resolved_client_amount values; internals
 * (hours, rates, margin, cost, prep) are structurally unreachable.
 */

export type ClientDocRow = {
  description: string;
  qtyLabel: string | null;
  amount: number;
};

export type FrozenLineForDoc = {
  description: string;
  qty: number;
  unit: string | null;
  resolved_client_amount: number;
};

export function buildClientDocRows(args: {
  lines: FrozenLineForDoc[];
  travelFee: number;
  zoneLabel?: string | null;
  computedPrice: number;
  overridePrice: number | null;
}): { rows: ClientDocRow[]; total: number } {
  const rows: ClientDocRow[] = args.lines.map((l) => ({
    description: l.description,
    qtyLabel:
      l.unit && l.qty > 0
        ? `${l.qty} ${l.unit}`
        : l.qty !== 1
          ? `× ${l.qty}`
          : null,
    amount: Number(l.resolved_client_amount),
  }));

  if (args.travelFee > 0) {
    // The allocator guaranteed all rows sum exactly to the computed price at
    // freeze time, so the travel row is exactly the remainder.
    const lineSum = rows.reduce((s, r) => s + r.amount, 0);
    rows.push({
      description: args.zoneLabel ? `Travel (${args.zoneLabel})` : "Travel",
      qtyLabel: null,
      amount: Math.round((args.computedPrice - lineSum) * 100) / 100,
    });
  }

  if (args.overridePrice !== null) {
    rows.push({
      description: "Price adjustment",
      qtyLabel: null,
      amount:
        Math.round((args.overridePrice - args.computedPrice) * 100) / 100,
    });
  }

  return { rows, total: args.overridePrice ?? args.computedPrice };
}
