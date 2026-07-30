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
import { allStoragePathsFor } from "@/lib/estimator/receipt-paths";
import { refreshInvoiceExtras } from "../invoice-actions";

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
  if (guard.refreshDraft) await refreshInvoiceExtras(guard.refreshDraft);

  revalidatePath("/app/estimator/purchases");
  if (jobId) revalidatePath(`/app/jobs/${jobId}`);
  if (item.job_id && item.job_id !== jobId) revalidatePath(`/app/jobs/${item.job_id}`);
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
  if (guard.refreshDraft) await refreshInvoiceExtras(guard.refreshDraft);
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
    .select("id, receipt_path, receipt_paths")
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
  });
  if (paths.length > 0) {
    await createAdminClient().storage.from("receipts").remove(paths);
  }

  revalidatePath("/app/estimator/purchases");
  return { ok: true };
}
