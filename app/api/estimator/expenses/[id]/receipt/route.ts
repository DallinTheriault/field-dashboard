import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB — phone photos of receipts
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "application/pdf",
]);

/**
 * Receipt attachment for an expense. The bucket is private; this route is
 * the only door: owner/manager auth + tenant ownership check, then service
 * role for storage. GET redirects to a short-lived signed URL.
 */
async function authorizeExpense(idRaw: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 401 as const, error: "Unauthorized" };

  const expenseId = Number(idRaw);
  if (!Number.isInteger(expenseId)) {
    return { status: 400 as const, error: "Bad expense id" };
  }

  const { data: clientUsers } = await supabase
    .from("client_users")
    .select("client_id, role")
    .eq("auth_user_id", user.id)
    .in("role", ["owner", "manager"])
    .limit(1);
  const clientId = clientUsers?.[0]?.client_id;
  if (!clientId) return { status: 403 as const, error: "Forbidden" };

  const { data: expense } = await supabase
    .from("expenses")
    .select("id, client_id, receipt_path")
    .eq("id", expenseId)
    .maybeSingle();
  if (!expense || expense.client_id !== clientId) {
    return { status: 404 as const, error: "Expense not found" };
  }

  return { status: 200 as const, clientId, expense };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const auth = await authorizeExpense(id);
  if (auth.status !== 200) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const formData = await request.formData();
  const file = formData.get("receipt");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 8MB)" }, { status: 400 });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: "Use a photo (PNG/JPEG/WebP/HEIC) or PDF." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${auth.clientId}/expense-${auth.expense.id}-${Date.now()}.${ext}`;
  const { error: uploadErr } = await admin.storage
    .from("receipts")
    .upload(path, await file.arrayBuffer(), {
      contentType: file.type,
      upsert: false,
    });
  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const { error: updateErr } = await admin
    .from("expenses")
    .update({ receipt_path: path })
    .eq("id", auth.expense.id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/** Redirect to a 1-hour signed URL for viewing the receipt. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const auth = await authorizeExpense(id);
  if (auth.status !== 200) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!auth.expense.receipt_path) {
    return NextResponse.json({ error: "No receipt attached" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("receipts")
    .createSignedUrl(auth.expense.receipt_path, 3600);
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Signing failed" }, { status: 500 });
  }
  return NextResponse.redirect(data.signedUrl);
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const auth = await authorizeExpense(id);
  if (auth.status !== 200) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createAdminClient();
  if (auth.expense.receipt_path) {
    await admin.storage.from("receipts").remove([auth.expense.receipt_path]);
  }
  const { error } = await admin
    .from("expenses")
    .update({ receipt_path: null })
    .eq("id", auth.expense.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
