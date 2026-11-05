"use server";

import { revalidatePath } from "next/cache";
import { requireWriter } from "@/lib/estimator/auth";
import { failLoudly, logIfFailed } from "@/lib/actions/fail-loudly";

type Result<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/** Delete an unsent draft; the database releases everything it claimed. */
export async function deleteInvoice(invoiceId: number): Promise<Result> {
  return failLoudly(async () => {
    const auth = await requireWriter();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase } = auth;

    const { data: inv } = await supabase
      .from("invoices")
      .select("id, status, stripe_invoice_id")
      .eq("id", invoiceId)
      .maybeSingle().throwOnError();
    if (!inv) return { ok: false, error: "Invoice not found." };
    if (inv.status !== "draft" || inv.stripe_invoice_id) {
      return { ok: false, error: "Only unsent drafts can be deleted." };
    }
    const { error } = await supabase.from("invoices").delete().eq("id", invoiceId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/app/estimator/invoices");
    return { ok: true };
  });
}
