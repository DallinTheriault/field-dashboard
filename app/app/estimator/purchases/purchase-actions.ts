"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ASSIGNMENTS,
  JOB_ASSIGNMENTS,
  type Assignment,
} from "@/lib/estimator/expenses";
import {
  assignmentAllowedForRole,
  canEditCustomerNotified,
} from "@/lib/estimator/expense-roles";
import { getCurrentUserRole } from "@/lib/permissions/current-role";
import { requireMember } from "@/lib/estimator/auth";
import { allStoragePathsFor, inTenantFolder } from "@/lib/estimator/receipt-paths";
import { refreshDraftExtras } from "../job-invoice-actions";
import { storeName } from "@/lib/estimator/store-names";

/**
 * Ruling Q1c, precisely: an item stamped on a FINALIZED invoice (sent or
 * Stripe-issued) is frozen. Stamped on a DRAFT, it may still change —
 * the draft auto-refreshes so its lines follow the reassignment (§6.4).
 * Returns the draft invoice id to refresh, or an error string.
 */
async function invoiceGuard(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invoicedOn: number | null,
): Promise<{ refreshDraft: number | null } | { error: string }> {
  if (!invoicedOn) return { refreshDraft: null };
  const { data: inv } = await supabase
    .from("invoices")
    .select("id, invoice_number, status, stripe_invoice_id")
    .eq("id", invoicedOn)
    .maybeSingle();
  if (!inv) return { refreshDraft: null }; // dangling stamp — FK will heal
  if (inv.status !== "draft" || inv.stripe_invoice_id) {
    return {
      error: `This item is on invoice ${inv.invoice_number} — that invoice went out and is final.`,
    };
  }
  return { refreshDraft: inv.id };
}

type Result = { ok: true } | { ok: false; error: string };

/**
 * Assign (or reassign) one expense item. The whole four-way model funnels
 * through here so the guards live in ONE place:
 *  - job assignments require a job that belongs to this tenant (H2-style
 *    ownership check through the caller's RLS view);
 *  - an item already stamped onto an invoice is FROZEN (ruling Q1c) —
 *    refresh the draft invoice first, or the invoice is final and the
 *    money conversation is a human one, not a silent data edit.
 */
export async function setItemAssignment(
  itemId: number,
  patch: {
    assignment: Assignment;
    jobId?: number | null;
    stockCategory?: string | null;
    customerNotified?: boolean;
  },
): Promise<Result> {
  const supabase = await createClient();
  if (!ASSIGNMENTS.includes(patch.assignment)) {
    return { ok: false, error: "Invalid assignment." };
  }

  // Role gate (defense-in-depth): RLS already limits writes to owner/manager,
  // but prove the boundary at every route — a member may never set job_extra
  // or touch the notified flag.
  const session = await getCurrentUserRole();
  if (!session) return { ok: false, error: "Not signed in." };
  if (!assignmentAllowedForRole(session.role, patch.assignment)) {
    return { ok: false, error: "You can't set that assignment." };
  }
  if (patch.customerNotified && !canEditCustomerNotified(session.role)) {
    return { ok: false, error: "You can't set the notified flag." };
  }

  const { data: item } = await supabase
    .from("expenses")
    .select("id, client_id, job_id, assignment, invoiced_on")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return { ok: false, error: "Item not found." };
  const guard = await invoiceGuard(supabase, item.invoiced_on);
  if ("error" in guard) return { ok: false, error: guard.error };

  const isJob = JOB_ASSIGNMENTS.includes(patch.assignment);
  let jobId: number | null = null;
  if (isJob) {
    jobId = patch.jobId ? Number(patch.jobId) : null;
    if (!jobId) return { ok: false, error: "Pick a job for a job assignment." };
    // Ownership guard: visible via the caller's RLS AND same tenant as item.
    const { data: job } = await supabase
      .from("jobs")
      .select("id, client_id")
      .eq("id", jobId)
      .maybeSingle();
    if (!job || job.client_id !== item.client_id) {
      return { ok: false, error: "Job not found." };
    }
  }

  const { data: updated, error } = await supabase
    .from("expenses")
    .update({
      assignment: patch.assignment,
      job_id: isJob ? jobId : null,
      stock_category:
        patch.assignment === "stock"
          ? (patch.stockCategory ?? "").trim() || null
          : null,
      customer_notified:
        patch.assignment === "job_extra" ? !!patch.customerNotified : false,
      invoiced_on: guard.refreshDraft ? null : item.invoiced_on,
    })
    .eq("id", itemId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if ((updated ?? []).length === 0) {
    return { ok: false, error: "You don't have permission to assign items." };
  }

  // The draft invoice's lines follow the reassignment (§6.4).
  if (guard.refreshDraft) await refreshDraftExtras(guard.refreshDraft);

  revalidatePath("/app/estimator/purchases");
  if (jobId) revalidatePath(`/app/jobs/${jobId}`);
  if (item.job_id && item.job_id !== jobId) revalidatePath(`/app/jobs/${item.job_id}`);
  return { ok: true };
}

/**
 * How an extra bills: at cost or marked up by the tenant's material markup,
 * and whether its receipt photo goes out with the invoice. Owner/manager
 * only (RLS). Frozen once on an invoice that went out; on a draft, the
 * draft re-prices to follow.
 */
export async function setExtraBilling(
  itemId: number,
  patch: { billMarkup?: boolean; attachReceipt?: boolean },
): Promise<Result> {
  const supabase = await createClient();
  const { data: item } = await supabase
    .from("expenses")
    .select("id, job_id, assignment, invoiced_on")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return { ok: false, error: "Item not found." };
  if (item.assignment !== "job_extra") return { ok: false, error: "Only extras bill to the customer." };
  const guard = await invoiceGuard(supabase, item.invoiced_on);
  if ("error" in guard) return { ok: false, error: guard.error };

  const update: { bill_markup?: boolean; attach_receipt?: boolean } = {};
  if (typeof patch.billMarkup === "boolean") update.bill_markup = patch.billMarkup;
  if (typeof patch.attachReceipt === "boolean") update.attach_receipt = patch.attachReceipt;
  const { data: updated, error } = await supabase.from("expenses").update(update).eq("id", itemId).select("id");
  if (error) return { ok: false, error: error.message };
  if ((updated ?? []).length === 0) return { ok: false, error: "You don't have permission to change billing." };

  if (guard.refreshDraft && "bill_markup" in update) await refreshDraftExtras(guard.refreshDraft);
  if (item.job_id) revalidatePath(`/app/jobs/${item.job_id}`);
  return { ok: true };
}

export type ReceiptItemInput = {
  description: string;
  sku: string | null;
  qty: number | null;
  unitPrice: number | null;
  amount: number;
  /** Per-item override from "Split this receipt"; omitted = use the receipt's. */
  assignment?: Assignment;
  jobId?: number | null;
};

/**
 * Persist a whole scanned/entered receipt with a RECEIPT-LEVEL assignment
 * (§5.1) — the common path where one store run is one bucket. Items no longer
 * land `unassigned` unless the user genuinely declines to choose.
 *
 * Runs through the server so the role rule is enforced rather than assumed:
 * a member may never write job_extra, whatever the client sends. Tenant
 * boundary is re-checked on the purchase and every referenced job because the
 * admin client bypasses RLS.
 *
 * This ONLY defaults new items at confirm time. It never rewrites history —
 * existing unassigned rows stay exactly as they are — except with `replace`:
 * "Use the new read" on a purchase already saved swaps its items for these,
 * refused while any of them is on an invoice.
 *
 * Saving uses up the waiting read: the purchase leaves "Check this".
 */
export async function saveScannedReceipt(input: {
  purchaseId: number;
  assignment: Assignment;
  jobId: number | null;
  vendor: string;
  date: string;
  tax: number | null;
  total: number | null;
  items: ReceiptItemInput[];
  replace?: boolean;
}): Promise<Result> {
  const auth = await requireMember();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { clientId, role } = auth;

  const admin = createAdminClient();
  const { data: purchase } = await admin
    .from("purchases")
    .select("id, client_id")
    .eq("id", Number(input.purchaseId))
    .maybeSingle();
  if (!purchase || purchase.client_id !== clientId) {
    return { ok: false, error: "Receipt not found." };
  }

  // Common stores save under one name ("The Home Depot" → "Home Depot").
  const vendor = storeName((input.vendor ?? "").trim());
  if (!vendor) return { ok: false, error: "Who was the vendor?" };
  const items = (input.items ?? []).filter((r) => (r.description ?? "").trim());
  if (items.length === 0) return { ok: false, error: "Add at least one item." };

  // Validate every assignment that will be written — receipt-level and any
  // per-item override from the split flow.
  const jobIdsToCheck = new Set<number>();
  const resolved = items.map((r) => {
    const assignment = r.assignment ?? input.assignment;
    const jobId = r.assignment ? (r.jobId ?? null) : input.jobId;
    return { row: r, assignment, jobId };
  });
  for (const { assignment, jobId } of resolved) {
    if (!ASSIGNMENTS.includes(assignment)) {
      return { ok: false, error: "Invalid assignment." };
    }
    if (!assignmentAllowedForRole(role, assignment)) {
      return { ok: false, error: "You can't set that assignment." };
    }
    if (JOB_ASSIGNMENTS.includes(assignment)) {
      if (!jobId) return { ok: false, error: "Pick a job for a job assignment." };
      jobIdsToCheck.add(Number(jobId));
    }
  }
  if (jobIdsToCheck.size > 0) {
    const { data: jobs } = await admin
      .from("jobs")
      .select("id, client_id")
      .in("id", [...jobIdsToCheck]);
    const ok = (jobs ?? []).filter((j) => j.client_id === clientId).map((j) => j.id);
    if (ok.length !== jobIdsToCheck.size) return { ok: false, error: "Job not found." };
  }

  const tax = input.tax;
  const total = input.total;
  const sub =
    total !== null && tax !== null && Number.isFinite(total) && Number.isFinite(tax)
      ? Math.round((total - tax) * 100) / 100
      : null;
  const date = (input.date || "").slice(0, 10);

  // Replacing: the items being swapped out, and the jobs they leave.
  const { data: oldItems } = await admin
    .from("expenses")
    .select("id, job_id, invoiced_on")
    .eq("purchase_id", purchase.id);
  if (input.replace && (oldItems ?? []).some((it) => it.invoiced_on !== null)) {
    return {
      ok: false,
      error: "An item from this receipt is on an invoice, so its items can't be replaced. Remove it from the invoice first.",
    };
  }
  if (!input.replace && (oldItems ?? []).length > 0) {
    return { ok: false, error: "This receipt already has items. Open it to compare the new read." };
  }

  const { error: uErr } = await admin
    .from("purchases")
    .update({
      vendor,
      purchase_date: date || null,
      subtotal: sub,
      tax: tax !== null && Number.isFinite(tax) ? tax : null,
      total: total !== null && Number.isFinite(total) ? total : null,
      scan_status: null,
      scan_result: null,
      scan_error: null,
    })
    .eq("id", purchase.id);
  if (uErr) return { ok: false, error: uErr.message };

  const { error: iErr } = await admin.from("expenses").insert(
    resolved.map(({ row, assignment, jobId }) => ({
      client_id: clientId,
      purchase_id: purchase.id,
      expense_date: date || null,
      category: "Materials & supplies",
      description: row.description.trim(),
      sku: row.sku,
      qty: row.qty !== null && Number.isFinite(row.qty) && row.qty > 0 ? row.qty : 1,
      unit_price:
        row.unitPrice !== null && Number.isFinite(row.unitPrice) ? row.unitPrice : null,
      amount: row.amount,
      assignment,
      job_id: JOB_ASSIGNMENTS.includes(assignment) ? jobId : null,
      stock_category: null,
      customer_notified: false,
    })),
  );
  if (iErr) return { ok: false, error: iErr.message };

  // New items are in; only now drop the old ones, so a failed insert never
  // leaves the purchase empty.
  if (input.replace && (oldItems ?? []).length > 0) {
    const { error: dErr } = await admin
      .from("expenses")
      .delete()
      .in(
        "id",
        (oldItems ?? []).map((it) => it.id),
      )
      .is("invoiced_on", null);
    if (dErr) return { ok: false, error: dErr.message };
    for (const it of oldItems ?? []) if (it.job_id) jobIdsToCheck.add(it.job_id as number);
  }

  revalidatePath("/app/estimator/purchases");
  revalidatePath(`/app/estimator/purchases/${purchase.id}`);
  revalidatePath("/app");
  for (const jid of jobIdsToCheck) revalidatePath(`/app/jobs/${jid}`);
  return { ok: true };
}

function localISO(v: string | undefined): string {
  if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return new Date().toISOString().slice(0, 10);
}

/**
 * Save first, scan second: the purchase a receipt photo is saved onto, made
 * before the upload. No vendor until someone reads it (never a made-up
 * name). `jobId` when scanned from a job, so checking it starts on that job.
 * Any member may capture (architect Q1); the scan route is gated separately.
 */
export async function startReceipt(input: {
  jobId?: number | null;
  /** The phone's local date (the server's may be tomorrow already). */
  date?: string;
  /** Queue the scan now, so the list says "Reading…" from the start. The
   *  scan route starts it once the photo is up; if that never happens it
   *  goes stale and shows Needs entry. */
  scan?: boolean;
}): Promise<{ ok: true; purchaseId: number } | { ok: false; error: string }> {
  const auth = await requireMember();
  if (!auth.ok) return { ok: false, error: auth.error };
  const admin = createAdminClient();
  const jobId = input.jobId ? Number(input.jobId) : null;
  if (jobId) {
    const { data: job } = await admin.from("jobs").select("id, client_id").eq("id", jobId).maybeSingle();
    if (!job || job.client_id !== auth.clientId) return { ok: false, error: "Job not found." };
  }
  const { data, error } = await admin
    .from("purchases")
    .insert({
      client_id: auth.clientId,
      vendor: null,
      purchase_date: localISO(input.date),
      source: "scan",
      created_by: auth.userId,
      scan_job_id: jobId,
      ...(input.scan ? { scan_status: "queued", scan_requested_at: new Date().toISOString() } : {}),
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Couldn't save the receipt." };
  return { ok: true, purchaseId: data.id as number };
}

/** Undo startReceipt when the photo never made it up: removes the purchase
 * only while it has no photo and no items. Any member (they made it). */
export async function discardEmptyReceipt(purchaseId: number): Promise<Result> {
  const auth = await requireMember();
  if (!auth.ok) return { ok: false, error: auth.error };
  const admin = createAdminClient();
  const { count } = await admin
    .from("expenses")
    .select("*", { count: "exact", head: true })
    .eq("purchase_id", Number(purchaseId));
  if ((count ?? 0) > 0) return { ok: false, error: "This receipt has items." };
  const { error } = await admin
    .from("purchases")
    .delete()
    .eq("id", Number(purchaseId))
    .eq("client_id", auth.clientId)
    .eq("receipt_paths", "{}")
    .is("receipt_path", null);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** "Keep what I saved": drop a waiting read without changing the purchase. */
export async function dismissScan(purchaseId: number): Promise<Result> {
  const auth = await requireMember();
  if (!auth.ok) return { ok: false, error: auth.error };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("purchases")
    .update({ scan_status: null, scan_result: null, scan_error: null })
    .eq("id", Number(purchaseId))
    .eq("client_id", auth.clientId)
    .in("scan_status", ["ready", "needs_entry"])
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Nothing to dismiss." };
  revalidatePath("/app/estimator/purchases");
  revalidatePath(`/app/estimator/purchases/${purchaseId}`);
  revalidatePath("/app");
  return { ok: true };
}

/** Flip the self-honesty flag on a job_extra item (no invoice implications). */
export async function setCustomerNotified(
  itemId: number,
  notified: boolean,
): Promise<Result> {
  const supabase = await createClient();
  const session = await getCurrentUserRole();
  if (!session || !canEditCustomerNotified(session.role)) {
    return { ok: false, error: "You can't edit the notified flag." };
  }
  const { data: updated, error } = await supabase
    .from("expenses")
    .update({ customer_notified: notified })
    .eq("id", itemId)
    .eq("assignment", "job_extra")
    .select("id");
  if (error) return { ok: false, error: error.message };
  if ((updated ?? []).length === 0) {
    return { ok: false, error: "Only job-extra items carry the notified flag." };
  }
  revalidatePath("/app/estimator/purchases");
  return { ok: true };
}

/** Delete one item — blocked while it sits on an invoice. */
export async function deleteExpenseItem(itemId: number): Promise<Result> {
  const supabase = await createClient();
  const { data: item } = await supabase
    .from("expenses")
    .select("id, invoiced_on, job_id")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return { ok: false, error: "Item not found." };
  const guard = await invoiceGuard(supabase, item.invoiced_on);
  if ("error" in guard) return { ok: false, error: guard.error };
  const { data: deleted, error } = await supabase
    .from("expenses")
    .delete()
    .eq("id", itemId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if ((deleted ?? []).length === 0) {
    return { ok: false, error: "You don't have permission to delete items." };
  }
  if (guard.refreshDraft) await refreshDraftExtras(guard.refreshDraft);
  revalidatePath("/app/estimator/purchases");
  if (item.job_id) revalidatePath(`/app/jobs/${item.job_id}`);
  return { ok: true };
}

/**
 * Edit one item's description, price and quantity. Not while it's on an
 * invoice that went out (the database refuses too); on a draft, the draft's
 * line follows.
 */
export async function updateExpenseItem(
  itemId: number,
  input: { description: string; unitPrice: number; qty: number },
): Promise<Result> {
  const description = String(input.description ?? "").trim();
  const unitPrice = Number(input.unitPrice);
  const qty = Number(input.qty);
  if (!description) return { ok: false, error: "Describe the item." };
  if (description.length > 300) return { ok: false, error: "Keep the description under 300 characters." };
  if (!Number.isFinite(unitPrice) || unitPrice < 0) return { ok: false, error: "Price must be a number, 0 or more." };
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, error: "Quantity must be more than 0." };
  const supabase = await createClient();
  const { data: item } = await supabase
    .from("expenses")
    .select("id, invoiced_on, job_id")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return { ok: false, error: "Item not found." };
  const guard = await invoiceGuard(supabase, item.invoiced_on);
  if ("error" in guard) return { ok: false, error: guard.error };
  const round2 = (n: number) => Math.round((n + 1e-9) * 100) / 100;
  const { data: updated, error } = await supabase
    .from("expenses")
    .update({ description, unit_price: round2(unitPrice), qty, amount: round2(unitPrice * qty) })
    .eq("id", itemId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if ((updated ?? []).length === 0) return { ok: false, error: "You don't have permission to edit items." };
  if (guard.refreshDraft) await refreshDraftExtras(guard.refreshDraft);
  revalidatePath("/app/estimator/purchases");
  if (item.job_id) revalidatePath(`/app/jobs/${item.job_id}`);
  return { ok: true };
}

/**
 * Delete a whole purchase: items cascade (FK), receipt images are removed
 * from storage after the RLS-checked row delete. Blocked if any line is
 * on an invoice.
 */
export async function deletePurchase(purchaseId: number): Promise<Result> {
  const supabase = await createClient();
  const { data: purchase } = await supabase
    .from("purchases")
    .select("id, client_id, receipt_path, receipt_paths, scan_paths")
    .eq("id", purchaseId)
    .maybeSingle();
  if (!purchase) return { ok: false, error: "Purchase not found." };

  const { data: invoiced } = await supabase
    .from("expenses")
    .select("id")
    .eq("purchase_id", purchaseId)
    .not("invoiced_on", "is", null)
    .limit(1);
  if ((invoiced ?? []).length > 0) {
    return { ok: false, error: "An item on this receipt is on an invoice — it can't be deleted." };
  }

  const { data: deleted, error } = await supabase
    .from("purchases")
    .delete()
    .eq("id", purchaseId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if ((deleted ?? []).length === 0) {
    return { ok: false, error: "You don't have permission to delete purchases." };
  }

  // Full images AND their thumbnail siblings — thumbs are derived, not stored
  // in receipt_paths[], so walking that array alone orphaned them in the bucket.
  const paths = allStoragePathsFor({
    receipt_path: purchase.receipt_path as string | null,
    receipt_paths: purchase.receipt_paths as string[] | null,
    scan_paths: purchase.scan_paths as string[] | null,
  }).filter((p) => inTenantFolder(purchase.client_id as number, p));
  if (paths.length > 0) {
    await createAdminClient().storage.from("receipts").remove(paths);
  }

  revalidatePath("/app/estimator/purchases");
  return { ok: true };
}
