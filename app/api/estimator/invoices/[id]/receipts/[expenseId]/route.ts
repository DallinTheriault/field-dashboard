import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inTenantFolder } from "@/lib/estimator/receipt-paths";
import { requireWriter } from "@/lib/estimator/auth";
import { receiptFilename, receiptPathsFor } from "@/lib/invoices/receipts";

/**
 * One receipt photo for an extra on an invoice, so the share sheet can attach
 * it next to the invoice PDF. Only extras the owner marked "attach receipt"
 * and that are on this invoice; the receipts bucket stays private.
 * GET ?i=<n> picks the nth photo of a multi-photo receipt.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; expenseId: string }> },
) {
  const auth = await requireWriter();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });
  const { supabase } = auth;

  const { id, expenseId } = await context.params;
  const invoiceId = Number(id);
  const itemId = Number(expenseId);
  const index = Number(new URL(request.url).searchParams.get("i") ?? 0);
  if (![invoiceId, itemId, index].every(Number.isInteger)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  const [{ data: inv }, { data: item }] = await Promise.all([
    supabase.from("invoices").select("id, invoice_number").eq("id", invoiceId).maybeSingle(),
    supabase
      .from("expenses")
      .select("id, client_id, receipt_path, purchase:purchases(receipt_paths, receipt_path)")
      .eq("id", itemId)
      .eq("invoiced_on", invoiceId)
      .eq("attach_receipt", true)
      .maybeSingle(),
  ]);
  if (!inv || !item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const paths = receiptPathsFor({
    receipt_path: item.receipt_path,
    purchase: item.purchase as unknown as { receipt_paths: string[] | null; receipt_path: string | null } | null,
  });
  const path = paths[index];
  if (!path) return NextResponse.json({ error: "No receipt photo" }, { status: 404 });
  // The download bypasses storage policies, so the path must be this tenant's.
  if (!inTenantFolder(item.client_id, path)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: blob, error } = await createAdminClient().storage.from("receipts").download(path);
  if (error || !blob) return NextResponse.json({ error: error?.message ?? "Download failed" }, { status: 500 });

  return new NextResponse(blob, {
    headers: {
      "Content-Type": blob.type || "image/jpeg",
      "Content-Disposition": `inline; filename="${receiptFilename(inv.invoice_number ?? String(inv.id), itemId, index, path)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
