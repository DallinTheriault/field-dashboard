import { NextResponse } from "next/server";
import { requireWriter } from "@/lib/estimator/auth";
import { BATCH_MS } from "@/lib/mileage/sync";
import { revalidateMileage, syncBatch } from "@/lib/mileage/sync-run";

/**
 * One batch of trips that need a lookup: the Mileage page runs these until
 * none are left, and a job page starts one after hours change. A route, not
 * a server action, so a batch (up to BATCH_MS) never holds up a tap.
 */
export async function POST() {
  const auth = await requireWriter();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });
  const r = await syncBatch(auth.clientId, BATCH_MS);
  if (r.inserted || r.updated || r.deleted) revalidateMileage();
  return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
}
