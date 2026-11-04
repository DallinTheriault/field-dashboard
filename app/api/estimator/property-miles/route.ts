import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWriter } from "@/lib/estimator/auth";
import { dayKeyInTz, getTenantTimezone } from "@/lib/dates";
import { milesFromBase } from "@/lib/mileage/property-miles";

/** Lookups start only within this budget, so the answer comes well inside the server's limit. */
const LOOKUP_MS = 15_000;

/**
 * One-way miles from today's base to an address, to check against Google
 * Maps (the job page's miles box). A route, not a server action: the lookup
 * can wait its turn at the map services for seconds, and a pending action
 * holds up every navigation on the page, like marking the job Completed.
 */
export async function GET(request: Request) {
  const auth = await requireWriter();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });
  const address = (new URL(request.url).searchParams.get("address") ?? "").trim();
  if (!address) return NextResponse.json({ status: "no_address", address: "" });
  const today = dayKeyInTz(new Date(), await getTenantTimezone());
  const miles = await milesFromBase(createAdminClient(), auth.clientId, address, today, Date.now() + LOOKUP_MS);
  return NextResponse.json(miles, { headers: { "Cache-Control": "private, no-store" } });
}
