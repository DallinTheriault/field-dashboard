"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMember } from "@/lib/estimator/auth";
import { assignmentAllowedForRole } from "@/lib/estimator/expense-roles";
import {
  ASSIGNMENTS,
  JOB_ASSIGNMENTS,
  type Assignment,
} from "@/lib/estimator/expenses";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const round2 = (n: number) => Math.round((n + 1e-9) * 100) / 100;

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Confirm a job belongs to the caller's tenant. The admin client bypasses
 * RLS, so this session-vs-row client_id check IS the tenant boundary
 * (architect Q2 hard requirement). Never trust a client_id from the body.
 */
async function jobInTenant(
  admin: ReturnType<typeof createAdminClient>,
  jobId: number,
  clientId: number,
): Promise<boolean> {
  const { data } = await admin
    .from("jobs")
    .select("id, client_id")
    .eq("id", jobId)
    .maybeSingle();
  return !!data && data.client_id === clientId;
}

async function purchaseInTenant(
  admin: ReturnType<typeof createAdminClient>,
  purchaseId: number,
  clientId: number,
): Promise<boolean> {
  const { data } = await admin
    .from("purchases")
    .select("id, client_id")
    .eq("id", purchaseId)
    .maybeSingle();
  return !!data && data.client_id === clientId;
}

/**
 * Build the assignment-dependent columns, once, so manual + scan writes stay
 * byte-identical to Expenses-page rows (single-ledger constraint). A job
 * assignment attaches job_id; stock/unassigned never do. customer_notified
 * starts false always (members can't create job_extra; owner/manager flip it
 * later on the Business → Expenses page).
 */
function assignmentColumns(assignment: Assignment, jobId: number) {
  const isJob = JOB_ASSIGNMENTS.includes(assignment);
  return {
    assignment,
    job_id: isJob ? jobId : null,
    stock_category: null as string | null,
    customer_notified: false,
  };
}

/** Manual single-item expense logged from inside a job. */
export async function createJobExpense(input: {
  jobId: number;
  description: string;
  pricePerEach: number;
  qty: number;
  assignment: Assignment;
}): Promise<Result> {
  const auth = await requireMember();
  if (!auth.ok) return auth;
  const { clientId, role } = auth;

  const jobId = Number(input.jobId);
  const description = (input.description ?? "").trim();
  const price = Number(input.pricePerEach);
  const qty = Number(input.qty);
  const assignment = input.assignment;

  if (!description) return { ok: false, error: "Name the item." };
  if (!Number.isFinite(price) || price < 0) {
    return { ok: false, error: "Price must be 0 or more." };
  }
  if (!ASSIGNMENTS.includes(assignment)) {
    return { ok: false, error: "Invalid assignment." };
  }
  if (!assignmentAllowedForRole(role, assignment)) {
    return { ok: false, error: "You can't set that assignment." };
  }

  const admin = createAdminClient();
  const isJob = JOB_ASSIGNMENTS.includes(assignment);
  if (isJob && !(await jobInTenant(admin, jobId, clientId))) {
    return { ok: false, error: "Job not found." };
  }

  const q = Number.isFinite(qty) && qty > 0 ? qty : 1;
  const { error } = await admin.from("expenses").insert({
    client_id: clientId,
    ...assignmentColumns(assignment, jobId),
    expense_date: todayISO(),
    category: "Materials & supplies",
    description,
    qty: q,
    unit_price: round2(price),
    amount: round2(price * q),
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/app/jobs/${jobId}`);
  revalidatePath("/app/estimator/purchases");
  return { ok: true };
}

/**
 * Create the purchase row a scan writes to, server-side (moved off the
 * browser client so members can scan — architect Q1/Q2). Returns the
 * purchase id for the upload + extract routes.
 */
export async function startJobReceiptScan(
  jobId: number,
): Promise<Result<{ purchaseId: number }>> {
  const auth = await requireMember();
  if (!auth.ok) return auth;
  const { clientId } = auth;

  const admin = createAdminClient();
  if (!(await jobInTenant(admin, Number(jobId), clientId))) {
    return { ok: false, error: "Job not found." };
  }

  const { data, error } = await admin
    .from("purchases")
    .insert({
      client_id: clientId,
      vendor: "Receipt (scanning…)",
      purchase_date: todayISO(),
      source: "scan",
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Couldn't start the scan." };
  }
  return { ok: true, data: { purchaseId: data.id } };
}

export type ScanItemInput = {
  description: string;
  sku: string | null;
  qty: number | null;
  unitPrice: number | null;
  amount: number;
};

/**
 * Persist the reviewed scan/manual-receipt items against a job. Writes the
 * purchase header + N expense lines. Same single-ledger rows as the Expenses
 * page; only job_id + entry point differ.
 */
export async function saveJobScanItems(input: {
  purchaseId: number;
  jobId: number;
  assignment: Assignment;
  vendor: string;
  date: string;
  tax: number | null;
  total: number | null;
  items: ScanItemInput[];
}): Promise<Result> {
  const auth = await requireMember();
  if (!auth.ok) return auth;
  const { clientId, role } = auth;

  const assignment = input.assignment;
  if (!ASSIGNMENTS.includes(assignment)) {
    return { ok: false, error: "Invalid assignment." };
  }
  if (!assignmentAllowedForRole(role, assignment)) {
    return { ok: false, error: "You can't set that assignment." };
  }
  const vendor = (input.vendor ?? "").trim();
  if (!vendor) return { ok: false, error: "Who was the vendor?" };
  const items = (input.items ?? []).filter((r) => (r.description ?? "").trim());
  if (items.length === 0) return { ok: false, error: "Add at least one item." };
  for (const r of items) {
    if (!Number.isFinite(r.amount)) {
      return { ok: false, error: `"${r.description}": needs an amount.` };
    }
  }

  const admin = createAdminClient();
  const purchaseId = Number(input.purchaseId);
  const jobId = Number(input.jobId);
  if (!(await purchaseInTenant(admin, purchaseId, clientId))) {
    return { ok: false, error: "Receipt not found." };
  }
  const isJob = JOB_ASSIGNMENTS.includes(assignment);
  if (isJob && !(await jobInTenant(admin, jobId, clientId))) {
    return { ok: false, error: "Job not found." };
  }

  const tax = input.tax;
  const total = input.total;
  const sub =
    total !== null && tax !== null && Number.isFinite(total) && Number.isFinite(tax)
      ? round2(total - tax)
      : null;
  const date = (input.date || todayISO()).trim();

  const { error: uErr } = await admin
    .from("purchases")
    .update({
      vendor,
      purchase_date: date,
      subtotal: sub,
      tax: tax !== null && Number.isFinite(tax) ? round2(tax) : null,
      total: total !== null && Number.isFinite(total) ? round2(total) : null,
    })
    .eq("id", purchaseId);
  if (uErr) return { ok: false, error: uErr.message };

  const cols = assignmentColumns(assignment, jobId);
  const { error: iErr } = await admin.from("expenses").insert(
    items.map((r) => {
      const q = r.qty !== null && Number.isFinite(r.qty) && r.qty > 0 ? r.qty : 1;
      return {
        client_id: clientId,
        purchase_id: purchaseId,
        ...cols,
        expense_date: date,
        category: "Materials & supplies",
        description: r.description.trim(),
        sku: r.sku,
        qty: q,
        unit_price:
          r.unitPrice !== null && Number.isFinite(r.unitPrice)
            ? round2(r.unitPrice)
            : null,
        amount: round2(r.amount),
      };
    }),
  );
  if (iErr) return { ok: false, error: iErr.message };

  revalidatePath(`/app/jobs/${jobId}`);
  revalidatePath("/app/estimator/purchases");
  return { ok: true };
}
