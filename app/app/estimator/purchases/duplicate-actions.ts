"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMember } from "@/lib/estimator/auth";
import { findDuplicate } from "@/lib/estimator/vendor-normalize";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

export type DuplicateHit = {
  id: number;
  vendor: string;
  purchaseDate: string;
  total: number | null;
  itemCount: number;
};

/**
 * Duplicate candidate lookup (RECEIPTS_VIEW_SPEC §5.2). Called from the scan
 * confirm screen and the manual multi-item save, BEFORE items persist. Never
 * blocks — it returns a hit or null and the user decides.
 *
 * Narrow by (client_id, date, total) in SQL — the v090 index — then apply the
 * normalized-vendor rule in the pure helper.
 */
export async function findDuplicatePurchase(input: {
  vendor: string;
  purchaseDate: string;
  total: number | null;
  excludePurchaseId?: number | null;
}): Promise<Result<DuplicateHit | null>> {
  const auth = await requireMember();
  if (!auth.ok) return auth;
  const { clientId } = auth;

  if (input.total === null || !Number.isFinite(input.total) || !input.purchaseDate) {
    return { ok: true, data: null }; // all three fields required to match
  }

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("purchases")
    .select("id, vendor, purchase_date, total, expenses(count)")
    .eq("client_id", clientId)
    .eq("purchase_date", input.purchaseDate)
    .eq("total", input.total)
    .order("id", { ascending: false })
    .limit(20);

  const candidates = (rows ?? []).filter(
    (r) => r.id !== (input.excludePurchaseId ?? -1),
  );
  const hit = findDuplicate(
    { vendor: input.vendor, purchase_date: input.purchaseDate, total: input.total },
    candidates.map((r) => ({
      id: r.id as number,
      vendor: (r.vendor as string) ?? "",
      purchase_date: String(r.purchase_date),
      total: r.total === null ? null : Number(r.total),
      itemCount:
        ((r.expenses as unknown as Array<{ count: number }> | null)?.[0]?.count) ?? 0,
    })),
  );
  if (!hit) return { ok: true, data: null };
  return {
    ok: true,
    data: {
      id: hit.id,
      vendor: hit.vendor,
      purchaseDate: String(hit.purchase_date).slice(0, 10),
      total: hit.total === null ? null : Number(hit.total),
      itemCount: hit.itemCount,
    },
  };
}

/**
 * Merge the just-captured photos into an existing purchase (§5.4).
 *
 * Order is load → APPEND to target → verify → re-point the meter → only then
 * delete the placeholder (architect requirement b). If the append fails we
 * stop with both rows intact; if the delete fails the worst case is a stray
 * empty purchase, which is visible and recoverable. Storage objects are NEVER
 * removed here (requirement a) — they are now referenced by the target's
 * receipt_paths[], so deleting them would destroy the photos the user just
 * chose to keep. The scan meter row is re-pointed, never destroyed
 * (requirement c; its FK is ON DELETE SET NULL, so it would survive either
 * way, but the link is worth keeping).
 *
 * The target's vendor/date/subtotal/tax/total are never touched. Items are
 * only persisted when the target has zero items AND the caller opts in.
 */
export async function mergePurchaseIntoExisting(input: {
  placeholderId: number;
  targetId: number;
  alsoMoveItems?: boolean;
  items?: Array<{
    description: string;
    sku: string | null;
    qty: number | null;
    unitPrice: number | null;
    amount: number;
  }>;
}): Promise<Result<{ targetId: number; movedItems: number }>> {
  const auth = await requireMember();
  if (!auth.ok) return auth;
  const { clientId } = auth;

  const placeholderId = Number(input.placeholderId);
  const targetId = Number(input.targetId);
  if (placeholderId === targetId) {
    return { ok: false, error: "Can't merge a purchase into itself." };
  }

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("purchases")
    .select("id, client_id, receipt_path, receipt_paths")
    .in("id", [placeholderId, targetId]);

  const placeholder = (rows ?? []).find((r) => r.id === placeholderId);
  const target = (rows ?? []).find((r) => r.id === targetId);
  // Tenant boundary: the admin client bypasses RLS, so both rows must belong
  // to the caller's client_id (derived from the session, never the body).
  if (!placeholder || placeholder.client_id !== clientId) {
    return { ok: false, error: "Receipt not found." };
  }
  if (!target || target.client_id !== clientId) {
    return { ok: false, error: "The other receipt wasn't found." };
  }

  // The placeholder must be empty — its FK to expenses is ON DELETE CASCADE,
  // so deleting a placeholder that somehow had items would destroy them.
  const { count: placeholderItems } = await admin
    .from("expenses")
    .select("*", { count: "exact", head: true })
    .eq("purchase_id", placeholderId);
  if ((placeholderItems ?? 0) > 0) {
    return { ok: false, error: "That capture already has items — save it separately." };
  }

  const incoming = [
    ...(((placeholder.receipt_paths as string[] | null) ?? []).filter(Boolean)),
    ...(placeholder.receipt_path ? [placeholder.receipt_path as string] : []),
  ];
  const existing = [
    ...(((target.receipt_paths as string[] | null) ?? []).filter(Boolean)),
    ...(target.receipt_path ? [target.receipt_path as string] : []),
  ];
  const merged = [...new Set([...existing, ...incoming])];

  // ---- 1. APPEND FIRST, and confirm it landed ----------------------------
  const { data: appended, error: appendErr } = await admin
    .from("purchases")
    .update({ receipt_paths: merged })
    .eq("id", targetId)
    .select("id, receipt_paths")
    .maybeSingle();
  if (appendErr || !appended) {
    return { ok: false, error: appendErr?.message ?? "Couldn't add the photos." };
  }
  const landed = ((appended.receipt_paths as string[] | null) ?? []).length;
  if (landed < merged.length) {
    return { ok: false, error: "Photos didn't attach — nothing was deleted." };
  }

  // ---- 2. Optional items, only into an EMPTY target ----------------------
  let movedItems = 0;
  if (input.alsoMoveItems && (input.items ?? []).length > 0) {
    const { count: targetItems } = await admin
      .from("expenses")
      .select("*", { count: "exact", head: true })
      .eq("purchase_id", targetId);
    if ((targetItems ?? 0) === 0) {
      const { data: t } = await admin
        .from("purchases")
        .select("purchase_date")
        .eq("id", targetId)
        .maybeSingle();
      const rows = (input.items ?? []).map((r) => ({
        client_id: clientId,
        purchase_id: targetId,
        expense_date: String(t?.purchase_date ?? "").slice(0, 10) || null,
        category: "Materials & supplies",
        description: r.description.trim(),
        sku: r.sku,
        qty: r.qty !== null && Number.isFinite(r.qty) && r.qty > 0 ? r.qty : 1,
        unit_price:
          r.unitPrice !== null && Number.isFinite(r.unitPrice) ? r.unitPrice : null,
        amount: r.amount,
        assignment: "unassigned",
      }));
      const { error: iErr } = await admin.from("expenses").insert(rows);
      if (!iErr) movedItems = rows.length;
    }
  }

  // ---- 3. Preserve the billing meter, then delete the placeholder --------
  // Re-point rather than let ON DELETE SET NULL orphan it: the scan happened
  // and stays attributable to the receipt it produced.
  await admin
    .from("receipt_scans")
    .update({ purchase_id: targetId })
    .eq("purchase_id", placeholderId);

  const { error: delErr } = await admin
    .from("purchases")
    .delete()
    .eq("id", placeholderId);
  // NOTE: no storage removal here, deliberately — those objects are now
  // referenced by the target. A failed delete leaves a visible empty row.
  if (delErr) {
    console.error("[merge] placeholder delete failed (photos are safe)", delErr);
  }

  revalidatePath("/app/estimator/purchases");
  revalidatePath(`/app/estimator/purchases/${targetId}`);
  return { ok: true, data: { targetId, movedItems } };
}
