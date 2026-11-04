import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWriter } from "@/lib/estimator/auth";
import { dayKeyInTz, getTenantTimezone } from "@/lib/dates";
import { baseOn } from "@/lib/mileage/plan";
import { checkServices } from "@/lib/mileage/geo";
import { sharedTurn } from "@/lib/mileage/throttle";

/** Lookups start only within this budget, so the answer comes well inside the server's limit. */
const LOOKUP_MS = 15_000;

/**
 * "Check map services": ask each once, from today's base. A route, not a
 * server action: while an action waits on the map services, every tap on the
 * page waits with it.
 */
export async function GET() {
  const auth = await requireWriter();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });
  const admin = createAdminClient();
  const today = dayKeyInTz(new Date(), await getTenantTimezone());
  const { data: bases, error } = await admin.from("mileage_bases").select("id, address, effective_from").eq("client_id", auth.clientId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const base = baseOn(
    today,
    (bases ?? []).map((b) => ({ id: b.id, address: b.address, effectiveFrom: String(b.effective_from) })),
  );
  if (!base) return NextResponse.json({ error: "Add a base first." }, { status: 400 });
  const checks = await checkServices(base.address, null, sharedTurn(admin, Date.now() + LOOKUP_MS));
  return NextResponse.json({ base: base.address, checks }, { headers: { "Cache-Control": "no-store" } });
}
