import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dayKeyInTz, getTenantTimezone } from "@/lib/dates";

function csvCell(v: string | number | null): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Year P&L export for the accountant: one row per income/expense event.
 * Same sources as the Money page — paid estimator invoices and the unified
 * expenses table (job materials included, tagged with the job name).
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tz = await getTenantTimezone();
  const url = new URL(request.url);
  const yParam = url.searchParams.get("y") ?? "";
  const year = /^\d{4}$/.test(yParam)
    ? Number(yParam)
    : Number(dayKeyInTz(new Date(), tz).slice(0, 4));

  const windowStart = `${year - 1}-12-30`;
  const windowEnd = `${year + 1}-01-02`;
  const [{ data: expenses }, { data: invoices }] = await Promise.all([
    supabase
      .from("expenses")
      .select("expense_date, category, description, amount, qty, assignment, jobs(name), purchases(vendor)")
      .gte("expense_date", `${year}-01-01`)
      .lte("expense_date", `${year}-12-31`),
    supabase
      .from("invoices")
      .select("invoice_number, customer_name, total_cents, paid_at")
      .eq("status", "paid")
      .not("invoice_number", "is", null)
      .gte("paid_at", windowStart)
      .lte("paid_at", windowEnd),
  ]);

  type Row = [string, string, string, string, string, number];
  const rows: Row[] = [];

  for (const i of invoices ?? []) {
    if (!i.paid_at || !dayKeyInTz(i.paid_at, tz).startsWith(String(year))) continue;
    rows.push([
      dayKeyInTz(i.paid_at, tz),
      "income",
      "Invoice",
      "",
      `${i.invoice_number} — ${i.customer_name}`,
      Number(i.total_cents) / 100,
    ]);
  }
  for (const e of expenses ?? []) {
    const job = e.jobs as unknown as { name: string | null } | null;
    const purchase = e.purchases as unknown as { vendor: string } | null;
    const qty = e.qty === null ? null : Number(e.qty);
    const parts = [e.description];
    if (qty !== null && qty !== 1) parts.push(`×${qty}`);
    if (purchase?.vendor) parts.push(`@ ${purchase.vendor}`);
    if (job?.name) parts.push(`(${job.name})`);
    rows.push([
      e.expense_date,
      "expense",
      e.category,
      // Assignment maps to tax treatment (billable materials vs job
      // supplies vs tools) — exposed, no tax logic built (spec §7.4).
      e.assignment ?? "",
      parts.join(" "),
      -Number(e.amount),
    ]);
  }

  rows.sort((a, b) => a[0].localeCompare(b[0]));
  const net = rows.reduce((s, r) => s + r[5], 0);

  const lines = [
    ["date", "type", "category", "assignment", "description", "amount"].join(","),
    ...rows.map((r) => r.map(csvCell).join(",")),
    ["", "", "", "", "NET PROFIT", (Math.round(net * 100) / 100).toFixed(2)].join(","),
  ];

  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="sharpline-pnl-${year}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
