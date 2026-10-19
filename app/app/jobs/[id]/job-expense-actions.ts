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
