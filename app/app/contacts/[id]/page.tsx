import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  MessageSquare,
  Briefcase,
  Pencil,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatusChip } from "@/components/ui/status-chip";
import { cn } from "@/lib/cn";

function fmtPhone(p: string | null): string {
  if (!p) return "—";
  const d = p.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) {
    return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) {
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return p;
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDateShort(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const TABS = [
  { key: "jobs", label: "Jobs", icon: Briefcase },
  { key: "calls", label: "Calls", icon: Phone },
  { key: "messages", label: "Messages", icon: MessageSquare },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default async function ContactDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const activeTab: TabKey = (TABS.some((t) => t.key === tab) ? tab : "jobs") as TabKey;

  const supabase = await createClient();
  const { data: contact } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!contact) notFound();

  const [{ data: jobs }, { data: calls }, { data: messages }] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, name, address, service, status, quoted_price, start_datetime, created_at")
      .eq("contact_id", contact.id)
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("call_summaries")
      .select("id, caller_name, intent, outcome, duration_seconds, started_at")
      .eq("contact_id", contact.id)
      .order("started_at", { ascending: false }),
    supabase
      .from("messages")
      .select("id, message_body, read_at, responded_at, created_at")
      .eq("contact_id", contact.id)
      .order("created_at", { ascending: false }),
  ]);

  const callbackPhone = contact.phone;

  return (
    <div>
      <Link
        href="/app/contacts"
        className="inline-flex items-center gap-1.5 text-xs text-bone-400 hover:text-bone-50 mb-4"
      >
        <ArrowLeft size={12} />
        Back to contacts
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="label-eyebrow mb-1">Contact</div>
          <h1 className="text-2xl font-semibold text-bone-50 tracking-tight">
            {contact.name || "—"}
          </h1>
          {callbackPhone && (
            <p className="num text-sm text-bone-300 mt-1">
              {fmtPhone(callbackPhone)}
            </p>
          )}
        </div>
        <Link
          href={`/app/contacts/${contact.id}/edit`}
          className="btn-secondary text-xs h-8"
        >
          <Pencil size={12} />
          Edit
        </Link>
      </div>

      {/* Quick actions */}
      {callbackPhone && (
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <a
            href={`tel:${callbackPhone}`}
            className="btn-secondary text-xs h-8"
          >
            <Phone size={12} />
            Call
          </a>
          <a
            href={`sms:${callbackPhone}`}
            className="btn-secondary text-xs h-8"
          >
            <MessageSquare size={12} />
            Text
          </a>
          {contact.email && (
            <a
              href={`mailto:${contact.email}`}
              className="btn-secondary text-xs h-8"
            >
              <Mail size={12} />
              Email
            </a>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 mb-6">
        <div className="lg:col-span-2">
          <div className="panel">
            <div className="px-4 h-11 flex items-center border-b border-line">
              <h2 className="text-sm font-semibold text-bone-100">Details</h2>
            </div>
            <dl className="divide-y divide-line-subtle">
              <Row label="Phone" value={fmtPhone(contact.phone)} mono icon={Phone} />
              <Row label="Email" value={contact.email ?? "—"} icon={Mail} />
              <Row label="Address" value={contact.address ?? "—"} icon={MapPin} />
              <Row label="Created" value={fmtDate(contact.created_at)} />
              <Row label="Updated" value={fmtDate(contact.updated_at ?? contact.created_at)} />
            </dl>
          </div>
        </div>

        <div className="lg:col-span-3">
          <div className="panel overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-line">
              {TABS.map(({ key, label, icon: Icon }) => {
                const isActive = key === activeTab;
                const counts: Record<TabKey, number> = {
                  jobs: jobs?.length ?? 0,
                  calls: calls?.length ?? 0,
                  messages: messages?.length ?? 0,
                };
                return (
                  <Link
                    key={key}
                    href={`/app/contacts/${contact.id}?tab=${key}`}
                    className={cn(
                      "flex items-center gap-1.5 px-4 h-11 text-xs font-medium transition-colors",
                      "border-b-2",
                      isActive
                        ? "text-bone-50 border-field-500"
                        : "text-bone-400 hover:text-bone-100 border-transparent",
                    )}
                  >
                    <Icon size={12} />
                    {label}
                    <span className="num text-2xs text-bone-400 ml-0.5">
                      {counts[key]}
                    </span>
                  </Link>
                );
              })}
            </div>

            {/* Tab content */}
            {activeTab === "jobs" && (
              <JobsTab jobs={jobs ?? []} />
            )}
            {activeTab === "calls" && (
              <CallsTab calls={calls ?? []} />
            )}
            {activeTab === "messages" && (
              <MessagesTab messages={messages ?? []} />
            )}
          </div>
        </div>
      </div>
    </div>
  );

  function Row({
    label,
    value,
    mono,
    icon: Icon,
  }: {
    label: string;
    value: string;
    mono?: boolean;
    icon?: LucideIcon;
  }) {
    return (
      <div className="px-4 py-2.5 grid grid-cols-3 gap-3 items-center">
        <dt className="text-xs text-bone-400 flex items-center gap-1.5">
          {Icon && <Icon size={12} className="text-bone-400" />}
          {label}
        </dt>
        <dd
          className={cn(
            "col-span-2 text-xs text-bone-100 break-all",
            mono && "font-mono",
          )}
        >
          {value}
        </dd>
      </div>
    );
  }
}

function fmtDollar(c: number | null | undefined): string {
  if (c == null) return "—";
  return `$${(c / 100).toFixed(2)}`;
}

function JobsTab({
  jobs,
}: {
  jobs: Array<{
    id: number | string;
    name: string | null;
    address: string | null;
    service: string | null;
    status: string | null;
    quoted_price: number | null;
    start_datetime: string | null;
    created_at: string;
  }>;
}) {
  if (jobs.length === 0) {
    return (
      <div className="px-6 py-12 text-center">
        <Briefcase
          size={18}
          className="mx-auto text-bone-400 mb-2"
          strokeWidth={1.6}
        />
        <p className="text-sm text-bone-100 font-medium">No jobs</p>
        <p className="text-xs text-bone-400 mt-1">
          Jobs from this contact will appear here.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-line-subtle">
      {jobs.map((j) => (
        <li key={j.id} className="relative">
          <Link
            href={`/app/jobs/${j.id}`}
            className="block px-4 py-3 hover:bg-ink-2 transition-colors"
          >
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-sm font-medium text-bone-100 truncate">
                {j.service || "Job"} · {j.address || "—"}
              </div>
              <StatusChip status={j.status ?? "lead"} />
            </div>
            <div className="flex items-center gap-3 text-2xs text-bone-400 mt-1 num">
              <span>{fmtDateShort(j.start_datetime)}</span>
              <span>{fmtDollar(j.quoted_price)}</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CallsTab({
  calls,
}: {
  calls: Array<{
    id: string;
    caller_name: string | null;
    intent: string | null;
    outcome: string | null;
    duration_seconds: number | null;
    started_at: string;
  }>;
}) {
  function fmtDuration(s: number | null): string {
    if (!s || s < 1) return "—";
    const total = Math.round(s);
    if (total < 60) return `${total}s`;
    const m = Math.floor(total / 60);
    const r = total % 60;
    return `${m}m ${r}s`;
  }

  if (calls.length === 0) {
    return (
      <div className="px-6 py-12 text-center">
        <Phone
          size={18}
          className="mx-auto text-bone-400 mb-2"
          strokeWidth={1.6}
        />
        <p className="text-sm text-bone-100 font-medium">No calls</p>
        <p className="text-xs text-bone-400 mt-1">
          Calls linked to this contact will appear here.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-line-subtle">
      {calls.map((c) => (
        <li key={c.id}>
          <Link
            href={`/app/calls/${c.id}`}
            className="block px-4 py-3 hover:bg-ink-2 transition-colors"
          >
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-sm text-bone-100 capitalize truncate">
                {c.intent?.replace(/_/g, " ") || "Call"}
                {c.outcome && (
                  <span className="text-bone-400">
                    {" · "}
                    {c.outcome.replace(/_/g, " ")}
                  </span>
                )}
              </div>
              <span className="num text-2xs text-bone-400 shrink-0">
                {fmtDuration(c.duration_seconds)}
              </span>
            </div>
            <div className="text-2xs text-bone-400 mt-0.5 num">
              {fmtDateShort(c.started_at)}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function MessagesTab({
  messages,
}: {
  messages: Array<{
    id: number;
    message_body: string | null;
    read_at: string | null;
    responded_at: string | null;
    created_at: string;
  }>;
}) {
  if (messages.length === 0) {
    return (
      <div className="px-6 py-12 text-center">
        <MessageSquare
          size={18}
          className="mx-auto text-bone-400 mb-2"
          strokeWidth={1.6}
        />
        <p className="text-sm text-bone-100 font-medium">No messages</p>
        <p className="text-xs text-bone-400 mt-1">
          Voicemails from this contact will appear here.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-line-subtle">
      {messages.map((m) => (
        <li key={m.id}>
          <Link
            href={`/app/messages/${m.id}`}
            className="block px-4 py-3 hover:bg-ink-2 transition-colors"
          >
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                {!m.read_at && (
                  <span className="w-1.5 h-1.5 rounded-full bg-field-500 shrink-0" />
                )}
                <p className="text-xs text-bone-100 line-clamp-2 flex-1">
                  {m.message_body || "—"}
                </p>
              </div>
              <span className="num text-2xs text-bone-400 shrink-0">
                {fmtDateShort(m.created_at)}
              </span>
            </div>
            {m.responded_at && (
              <div className="text-2xs text-status-completed mt-1">
                ● Responded
              </div>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
