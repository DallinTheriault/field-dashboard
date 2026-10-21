import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/permissions/current-role";
import { canViewSettings } from "@/lib/permissions/roles";
import { dayKeyInTz, getTenantTimezone } from "@/lib/dates";
import { loadRatePeriods, loadTrips } from "@/lib/mileage/trips";
import { yearTotals } from "@/lib/mileage/plan";

function csvCell(v: string | number | null): string {
  const s = v === null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * The mileage log for a year, for the tax preparer: date, start, destination,
 * purpose (job number and name) and miles, then the year's totals. Owner and
 * manager only, like the rest of the money.
 */
export async function GET(request: Request) {
  const session = await getCurrentUserRole();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canViewSettings(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tz = await getTenantTimezone();
  const y = new URL(request.url).searchParams.get("y") ?? "";
  const year = /^\d{4}$/.test(y) ? Number(y) : Number(dayKeyInTz(new Date(), tz).slice(0, 4));
  const supabase = await createClient();
  const [trips, rates] = await Promise.all([loadTrips(supabase, year), loadRatePeriods(supabase)]);
  const totals = yearTotals(trips, rates);

  const lines = [
    ["date", "start", "destination", "purpose", "miles"].join(","),
    // "A → B" reads "A then B": Excel garbles the arrow in a plain CSV.
    ...trips.map((t) => [t.date, t.startAddress, t.destination.replaceAll(" → ", " then "), t.purpose, t.miles].map(csvCell).join(",")),
    "",
    ["", "", "", "TOTAL MILES", totals.miles].map(csvCell).join(","),
    // The rates in effect during the year (each trip uses the one on its date).
    ...rates
      .filter((r, i) => r.effectiveFrom <= `${year}-12-31` && (rates[i + 1]?.effectiveFrom ?? "9999") > `${year}-01-01`)
      .map((r) => ["", "", "", `RATE FROM ${r.effectiveFrom}`, r.rate].map(csvCell).join(",")),
    ["", "", "", "DEDUCTION (miles × the rate on each trip's date)", totals.dollars.toFixed(2)].map(csvCell).join(","),
  ];
  if (totals.missing > 0) {
    lines.push(["", "", "", `${totals.missing} trip(s) still need miles`, ""].map(csvCell).join(","));
  }
  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="mileage-${year}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
