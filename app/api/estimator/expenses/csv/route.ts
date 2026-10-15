import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dayKeyInTz, getTenantTimezone } from "@/lib/dates";
import { METHOD_LABELS, type PaymentMethod } from "@/lib/invoices/payments";
import {
  ALTERNATIVE_METHODS_NOTE,
  buildRateMap,
  summarizeMileage,
} from "@/lib/estimator/mileage";

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

  const [{ data: expenses }, { data: payments }, { data: mileage }, { data: rates }] =
    await Promise.all([
    supabase
      .from("expenses")
      .select("expense_date, category, description, amount, qty, assignment, jobs(name), purchases(vendor)")
      .gte("expense_date", `${year}-01-01`)
      .lte("expense_date", `${year}-12-31`),
    // Income: each payment on the day it was received (cash basis).
    supabase
      .from("payments")
      .select("received_on, amount_cents, method, reference, invoices(invoice_number, customer_name)")
      .gte("received_on", `${year}-01-01`)
      .lte("received_on", `${year}-12-31`)
      .order("received_on"),
    // Mileage gets its OWN block below — never interleaved with expenses and
    // never added into NET PROFIT (§6.3).
    supabase
      .from("mileage_entries")
      .select("trip_date, destination, purpose, miles, jobs(job_number)")
      .gte("trip_date", `${year}-01-01`)
      .lte("trip_date", `${year}-12-31`)
      .order("trip_date", { ascending: true }),
    supabase.from("mileage_rates").select("year, rate_per_mile"),
  ]);

  type Row = [string, string, string, string, string, number];
  const rows: Row[] = [];

  for (const p of payments ?? []) {
    const inv = p.invoices as unknown as { invoice_number: string | null; customer_name: string } | null;
    const how = METHOD_LABELS[p.method as PaymentMethod] ?? p.method;
    rows.push([
      String(p.received_on),
      "income",
      "Payment",
      "",
      `${inv?.invoice_number ?? "Invoice"} — ${inv?.customer_name ?? ""} (${how}${p.reference ? ` #${p.reference}` : ""})`,
      Number(p.amount_cents) / 100,
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

  // ---- mileage: a separate block, deliberately outside NET PROFIT --------
  const trips = (mileage ?? []).map((m) => {
    const job = m.jobs as unknown as { job_number: string | null } | null;
    return {
      date: String(m.trip_date).slice(0, 10),
      destination: m.destination as string,
      purpose: m.purpose as string,
      miles: Number(m.miles),
      jobNumber: job?.job_number ?? "",
    };
  });
  if (trips.length > 0) {
    const totals = summarizeMileage(
      trips.map((t) => ({ trip_date: t.date, miles: t.miles })),
      year,
      buildRateMap(rates ?? []),
    );
    lines.push(
      "",
      csvCell(`MILEAGE — ${ALTERNATIVE_METHODS_NOTE}`),
      ["date", "destination", "purpose", "miles", "job number"].join(","),
      ...trips.map((t) =>
        [t.date, t.destination, t.purpose, t.miles, t.jobNumber].map(csvCell).join(","),
      ),
      ["", "", "TOTAL MILES", totals.miles, ""].map(csvCell).join(","),
      totals.rateSet
        ? ["", "", `AT ${totals.rate}/MILE`, "", totals.dollars].map(csvCell).join(",")
        : ["", "", "RATE NOT SET FOR " + year, "", ""].map(csvCell).join(","),
    );
  }

  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="sharpline-pnl-${year}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
