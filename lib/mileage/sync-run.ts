import "server-only";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantTimezone } from "@/lib/dates";
import { syncDayTrips, type SyncResult } from "./sync";

/**
 * One batch of trip lookups for a tenant, and the pages that show trips.
 * Shared by the mileage actions (a short batch after a save) and the sync
 * route (background batches, kept out of server actions: Next runs a page's
 * actions and navigations one at a time, so a batch there held up taps).
 */
export async function syncBatch(clientId: number, budgetMs: number): Promise<SyncResult> {
  return syncDayTrips(createAdminClient(), clientId, { network: true, tz: await getTenantTimezone(), budgetMs });
}

export function revalidateMileage(jobIds: Array<number | null | undefined> = []) {
  revalidatePath("/app/estimator/mileage");
  revalidatePath("/app/estimator/mileage/catch-up");
  revalidatePath("/app/estimator/expenses");
  for (const id of jobIds) if (id) revalidatePath(`/app/jobs/${id}`);
}
