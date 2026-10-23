import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { wentOut } from "@/lib/invoices/parties";
import { getCurrentUserRole } from "@/lib/permissions/current-role";
import { canViewSettings } from "@/lib/permissions/roles";
import { getTenantFeatureFlags } from "@/lib/features/flags";
import { FeatureDisabledPanel } from "@/components/ui/feature-disabled-panel";
import { InvoiceStatusChip } from "./invoice-status";
import { dayKeyInTz, getTenantTimezone } from "@/lib/dates";
import { balanceDueCents, daysBetween, invoiceTab, type InvoiceTab } from "@/lib/invoices/payments";
import { cn } from "@/lib/cn";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function fmtDate(d: string | null, tz: string): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" });
}

const TABS: Array<{ key: Exclude<InvoiceTab, "voided">; label: string }> = [
  { key: "unpaid", label: "Unpaid" },
  { key: "drafts", label: "Drafts" },
  { key: "paid", label: "Paid" },
];

type Row = {
  id: number;
  invoice_number: string;
  status: string;
  total_cents: number;
  customer_name: string | null;
  customer_company: string | null;
  created_at: string;
  sent_at: string | null;
  paid_at: string | null;
  stripe_invoice_id: string | null;
  jobs: { address: string | null } | null;
  payments: Array<{ amount_cents: number }>;
  bill_to: { name: string | null; company: string | null } | null;
};

/** Customer invoices: what's owed, what's still a draft, what's paid. */
export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const tz = await getTenantTimezone();
  const [session, flags, sp] = await Promise.all([getCurrentUserRole(), getTenantFeatureFlags(), searchParams]);
  if (!session) redirect("/login");
  if (!canViewSettings(session.role)) redirect("/app");
  if (!flags.estimator) return <FeatureDisabledPanel featureName="Invoices" />;

  const tab: InvoiceTab = (["unpaid", "drafts", "paid", "voided"] as const).find((t) => t === sp.tab) ?? "unpaid";
  const today = dayKeyInTz(new Date(), tz);

  const supabase = await createClient();
  const { data } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, status, total_cents, customer_name, customer_company, created_at, sent_at, paid_at, stripe_invoice_id, jobs(address), payments(amount_cents), bill_to:contacts!invoices_bill_to_same_tenant(name, company)",
    )
    .not("invoice_number", "is", null)
    .order("created_at", { ascending: false })
    .limit(500);
  const all = (data ?? []) as unknown as Row[];

  const counts = { unpaid: 0, drafts: 0, paid: 0, voided: 0 } as Record<InvoiceTab, number>;
  for (const r of all) counts[invoiceTab(r.status)]++;

  const sentDay = (r: Row) => dayKeyInTz(r.sent_at ?? r.created_at, tz);
  const rows = all
    .filter((r) => invoiceTab(r.status) === tab)
    .sort((a, b) =>
      tab === "unpaid"
        ? sentDay(a).localeCompare(sentDay(b)) // oldest first: those are the ones to chase
        : tab === "paid"
          ? (b.paid_at ?? "").localeCompare(a.paid_at ?? "")
          : b.created_at.localeCompare(a.created_at),
    );
  const owed = tab === "unpaid" ? rows.reduce((s, r) => s + balanceDueCents(r.total_cents, r.payments), 0) : 0;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
      <header className="flex items-end gap-3">
        <h1 className="text-xl font-semibold text-bone-50 flex-1">Invoices</h1>
        {tab === "unpaid" && owed > 0 && (
          <div className="text-sm text-bone-300">
            Owed <span className="num text-bone-50" data-testid="owed-total">{usd.format(owed / 100)}</span>
          </div>
        )}
      </header>

      <nav className="flex gap-1 border-b border-line" aria-label="Invoice lists">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/app/estimator/invoices?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn(
              "px-3 min-h-[44px] inline-flex items-center gap-1.5 text-sm border-b-2 -mb-px",
              tab === t.key ? "border-field-500 text-bone-50" : "border-transparent text-bone-400 hover:text-bone-100",
            )}
          >
            {t.label}
            <span className="text-2xs text-bone-500 num">{counts[t.key]}</span>
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="panel px-6 py-10 text-center text-sm text-bone-300">
          {tab === "unpaid" ? "Nothing owed right now." : tab === "drafts" ? "No drafts." : tab === "paid" ? "No paid invoices yet." : "No voided invoices."}
          {tab !== "voided" && (
            <p className="text-2xs text-bone-400 mt-1">Invoices start from a job: open it and tap ⋯ › Create invoice.</p>
          )}
        </div>
      ) : (
        <ul className="space-y-1.5" data-testid={`list-${tab}`}>
          {rows.map((inv) => {
            const balance = balanceDueCents(inv.total_cents, inv.payments);
            const days = daysBetween(sentDay(inv), today);
            // A draft names its payer as the contact is now (v104).
            const live = !wentOut(inv) && inv.bill_to;
            const name = live ? inv.bill_to!.name?.trim() || inv.customer_name : inv.customer_name;
            const company = live ? inv.bill_to!.company?.trim() || null : inv.customer_company;
            const who = [name, company && `(${company})`].filter(Boolean).join(" ");
            return (
              <li key={inv.id}>
                <Link
                  href={`/app/estimator/invoices/${inv.id}`}
                  className="flex items-start gap-3 px-3 py-2.5 bg-ink-1 hover:bg-ink-2 rounded-sm shadow-inset-line transition-colors min-h-[44px]"
                  data-invoice={inv.invoice_number}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-bone-100 font-medium break-words">{who || "No bill-to"}</div>
                    {inv.jobs?.address && <div className="text-2xs text-bone-400 break-words">{inv.jobs.address}</div>}
                    <div className="text-2xs text-bone-500 font-mono">
                      {inv.invoice_number}
                      {tab === "paid" && <span className="font-sans"> · Paid {fmtDate(inv.paid_at, tz)}</span>}
                      {tab === "drafts" && inv.stripe_invoice_id && <span className="font-sans"> · Card link issued</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="num text-sm text-bone-50">
                      {usd.format((tab === "unpaid" ? balance : inv.total_cents) / 100)}
                    </div>
                    {tab === "unpaid" && (
                      <div className={cn("text-2xs", days > 30 ? "text-status-danger" : "text-bone-400")} data-days={days}>
                        {days === 0 ? "sent today" : `${days} day${days === 1 ? "" : "s"}`}
                      </div>
                    )}
                    {tab === "unpaid" && balance < inv.total_cents && (
                      <div className="text-2xs text-bone-500">of {usd.format(inv.total_cents / 100)}</div>
                    )}
                    {tab !== "unpaid" && <InvoiceStatusChip status={inv.status} />}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {counts.voided > 0 && tab !== "voided" && (
        <Link href="/app/estimator/invoices?tab=voided" className="inline-flex items-center min-h-[44px] text-2xs text-bone-400 hover:text-bone-100">
          {counts.voided} voided
        </Link>
      )}
    </div>
  );
}
