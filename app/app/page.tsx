import Link from "next/link";
import { ArrowRight, Briefcase, Receipt, UserPlus, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatusChip } from "@/components/ui/status-chip";
import { dayKeyInTz, getTenantTimezone } from "@/lib/dates";
import { getCurrentUserRole } from "@/lib/permissions/current-role";
import { canViewSettings } from "@/lib/permissions/roles";
import { getTenantFeatureFlags } from "@/lib/features/flags";
import { JOB_LOCATION_SELECT, jobAddress, toJobPick, withBilling } from "@/lib/jobs/address";
import { BILLING_COLS, billingByJob } from "@/lib/jobs/billing";
import { readyToInvoice } from "@/lib/home/ready-to-invoice";
import { balanceDueCents, daysBetween } from "@/lib/invoices/payments";
import { AddJobButton } from "./jobs/_components/add-job-button";
import { ScanReceipt } from "./estimator/purchases/scan-receipt";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const CLOSED = '("completed","cancelled")';

function fmtDay(d: string | null, tz: string): string | null {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" });
}

/**
 * Home: three things to start (a job, a receipt, a contact), then what needs
 * doing: open jobs, jobs ready to invoice, and invoices still owed.
 */
export default async function HomePage() {
  const [tz, session, flags] = await Promise.all([getTenantTimezone(), getCurrentUserRole(), getTenantFeatureFlags()]);
  const supabase = await createClient();
  const money = flags.estimator && session !== null && canViewSettings(session.role);

  const [openRes, pickRes, billingRes, unpaidRes] = await Promise.all([
    supabase
      .from("jobs")
      .select(`id, name, status, start_datetime, ${JOB_LOCATION_SELECT}`)
      .is("archived_at", null)
      .not("status", "in", CLOSED)
      .order("start_datetime", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(8),
    // Jobs a scanned receipt can be put on.
    supabase
      .from("jobs")
      .select(`id, name, job_number, status, ${JOB_LOCATION_SELECT}`)
      .is("archived_at", null)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(200),
    // Billing state per job (v099): which jobs are ready to invoice, and the
    // picker's labels.
    money ? supabase.from("job_billing").select(BILLING_COLS) : Promise.resolve({ data: [] }),
    money
      ? supabase.from("invoices")
          .select("id, invoice_number, customer_name, customer_company, total_cents, sent_at, created_at, jobs(address), payments(amount_cents)")
          .in("status", ["sent", "overdue"])
          .not("invoice_number", "is", null)
      : Promise.resolve({ data: [] }),
  ]);

  const open = (openRes.data ?? []) as unknown as Array<Parameters<typeof jobAddress>[0] & {
    id: number; name: string | null; status: string; start_datetime: string | null;
  }>;
  const billing = billingByJob(billingRes.data as Array<Record<string, unknown>> | null);
  const pickJobs = withBilling(
    ((pickRes.data ?? []) as unknown as Parameters<typeof toJobPick>[0][]).map(toJobPick),
    billing,
  );

  // Ready to invoice: the jobs whose badge says so, with what's waiting.
  const readyIds = [...billing].filter(([, b]) => b.state === "ready").map(([id]) => id);
  const [{ data: candJobs }, { data: tasks }, { data: extras }, { data: candInvoices }] = readyIds.length
    ? await Promise.all([
        supabase.from("jobs").select(`id, name, status, updated_at, ${JOB_LOCATION_SELECT}`).in("id", readyIds)
          .is("archived_at", null),
        supabase.from("tasks").select("job_id, qty, unit_price, status").in("job_id", readyIds)
          .eq("billable", true).is("invoice_id", null),
        supabase.from("expenses").select("job_id, amount").in("job_id", readyIds)
          .eq("assignment", "job_extra").is("invoiced_on", null),
        supabase.from("invoices").select("id, job_id, status, stripe_invoice_id, invoice_number").in("job_id", readyIds),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const readyJobs = ((candJobs ?? []) as unknown as Array<Parameters<typeof jobAddress>[0] & {
    id: number; name: string | null; status: string; updated_at: string;
  }>).sort((a, b) => (a.updated_at ?? "").localeCompare(b.updated_at ?? ""));
  const jobById = new Map(readyJobs.map((j) => [j.id, j]));
  // On a completed job every billable line counts as finished, checked or not (v099).
  const finished = ((tasks ?? []) as Array<Parameters<typeof readyToInvoice>[0]["tasks"][number] & { status: string }>)
    .filter((t) => t.status === "done" || jobById.get(t.job_id)?.status === "completed");
  const ready = readyToInvoice({
    jobIds: readyJobs.map((j) => j.id),
    tasks: finished,
    extras: (extras ?? []) as Parameters<typeof readyToInvoice>[0]["extras"],
    completedJobIds: readyJobs.filter((j) => j.status === "completed").map((j) => j.id),
    invoices: (candInvoices ?? []) as Parameters<typeof readyToInvoice>[0]["invoices"],
  });

  // Owed, oldest first.
  const today = dayKeyInTz(new Date(), tz);
  const unpaid = ((unpaidRes.data ?? []) as unknown as Array<{
    id: number; invoice_number: string; customer_name: string | null; customer_company: string | null;
    total_cents: number; sent_at: string | null; created_at: string;
    jobs: { address: string | null } | null; payments: Array<{ amount_cents: number }>;
  }>)
    .map((i) => ({ ...i, balance: balanceDueCents(i.total_cents, i.payments), sentDay: dayKeyInTz(i.sent_at ?? i.created_at, tz) }))
    .sort((a, b) => a.sentDay.localeCompare(b.sentDay));
  const owed = unpaid.reduce((s, i) => s + i.balance, 0);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <section className="grid grid-cols-3 gap-3" aria-label="Start something">
        <AddJobButton variant="tile" />
        {flags.estimator && session?.clientId && flags.receiptAi ? (
          <ScanReceipt variant="tile" clientId={session.clientId} jobs={pickJobs} role={session.role} />
        ) : (
          <Link href="/app/estimator/purchases" className="home-tile">
            <Receipt size={26} />
            <span>Add receipt</span>
          </Link>
        )}
        <Link href="/app/contacts/new" className="home-tile">
          <UserPlus size={26} />
          <span>New contact</span>
        </Link>
      </section>

      <HomeList title="Open jobs" icon={Briefcase} href="/app/jobs" linkLabel="All jobs" testId="open-jobs"
        empty="No open jobs. Tap New job to add one.">
        {open.map((j) => (
          <Row key={j.id} href={`/app/jobs/${j.id}`} testValue={j.name ?? ""}
            title={j.name || "—"} sub={jobAddress(j)} right={<StatusChip status={j.status} />}
            note={fmtDay(j.start_datetime, tz)} />
        ))}
      </HomeList>

      {money && (
        <HomeList title="Ready to invoice" icon={Receipt} testId="ready-to-invoice"
          empty="Nothing waiting: every finished job has gone out.">
          {ready.map((r) => {
            const j = jobById.get(r.jobId)!;
            const what = [
              r.lineCount > 0 && `${r.lineCount} line${r.lineCount === 1 ? "" : "s"} ready`,
              r.needsPrice > 0 && `${r.needsPrice} need${r.needsPrice === 1 ? "s" : ""} a price`,
              r.draftNumber ? `draft ${r.draftNumber} not sent` : r.nothingSent && "completed, nothing sent",
            ].filter(Boolean).join(" · ");
            return (
              <Row key={r.jobId} testValue={j.name ?? ""}
                href={r.draftId ? `/app/estimator/invoices/${r.draftId}` : `/app/jobs/${r.jobId}/invoice`}
                title={j.name || "—"} sub={jobAddress(j)} note={what}
                right={r.readyCents > 0 ? <span className="num text-sm text-bone-50">{usd.format(r.readyCents / 100)}</span> : null} />
            );
          })}
        </HomeList>
      )}

      {money && (
        <HomeList title="Unpaid invoices" icon={Wallet} href="/app/estimator/invoices" linkLabel="All unpaid" testId="unpaid"
          headerRight={owed > 0 ? <span className="text-sm text-bone-300">Owed <span className="num text-bone-50">{usd.format(owed / 100)}</span></span> : null}
          empty="Nothing owed right now.">
          {unpaid.slice(0, 6).map((i) => {
            const days = daysBetween(i.sentDay, today);
            return (
              <Row key={i.id} href={`/app/estimator/invoices/${i.id}`} testValue={i.invoice_number}
                title={[i.customer_name, i.customer_company && `(${i.customer_company})`].filter(Boolean).join(" ") || "—"}
                sub={i.jobs?.address ?? null}
                note={`${i.invoice_number} · ${days === 0 ? "sent today" : `${days} day${days === 1 ? "" : "s"}`}`}
                right={<span className="num text-sm text-bone-50">{usd.format(i.balance / 100)}</span>} />
            );
          })}
        </HomeList>
      )}
    </div>
  );
}

function HomeList({
  title,
  icon: Icon,
  href,
  linkLabel,
  headerRight,
  empty,
  testId,
  children,
}: {
  title: string;
  icon: typeof Briefcase;
  href?: string;
  linkLabel?: string;
  headerRight?: React.ReactNode;
  empty: string;
  testId: string;
  children: React.ReactNode[];
}) {
  return (
    <section className="panel" data-testid={testId}>
      <div className="flex items-center gap-2 px-4 min-h-[44px] border-b border-line">
        <Icon size={14} className="text-field-500" />
        <h2 className="text-sm font-semibold text-bone-100 flex-1">{title}</h2>
        {headerRight}
        {href && (
          <Link href={href} className="text-2xs text-bone-400 hover:text-bone-50 inline-flex items-center gap-1 min-h-[44px]">
            {linkLabel} <ArrowRight size={11} />
          </Link>
        )}
      </div>
      {children.length === 0 ? (
        <p className="px-4 py-6 text-sm text-bone-400 text-center">{empty}</p>
      ) : (
        <ul className="divide-y divide-line-subtle">{children}</ul>
      )}
    </section>
  );
}

function Row({
  href,
  title,
  sub,
  note,
  right,
  testValue,
}: {
  href: string;
  title: string;
  sub: string | null;
  note?: string | null;
  right?: React.ReactNode;
  testValue: string;
}) {
  return (
    <li data-row={testValue}>
      <Link href={href} prefetch={false} className="flex items-start gap-3 px-4 py-3 min-h-[44px] hover:bg-ink-2 transition-colors">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-bone-100 break-words">{title}</div>
          {sub && <div className="text-2xs text-bone-400 break-words">{sub}</div>}
          {note && <div className="text-2xs text-bone-500 mt-0.5">{note}</div>}
        </div>
        {right && <div className="shrink-0 text-right">{right}</div>}
      </Link>
    </li>
  );
}
