import Link from "next/link";
import { MessageSquare, ArrowRight, Send } from "lucide-react";

export default function MessagesPage() {
  return (
    <div>
      <div className="label-eyebrow mb-1">Outbound</div>
      <h1 className="text-2xl font-semibold text-bone-50 tracking-tight">
        Messages
      </h1>
      <p className="text-sm text-bone-300 mt-1 mb-6 max-w-2xl">
        Two-way SMS with your customers — coming in v0.5. Send appointment
        reminders, follow-ups on quotes, and answer back when customers reply.
      </p>

      <div className="panel p-8 max-w-2xl">
        <div className="w-12 h-12 rounded-md bg-ink-2 border border-line-strong flex items-center justify-center mb-4">
          <Send size={18} className="text-field-500" strokeWidth={1.6} />
        </div>
        <h2 className="text-lg font-semibold text-bone-50 mb-2">
          Outbound SMS — coming v0.5
        </h2>
        <p className="text-sm text-bone-300 leading-relaxed mb-6">
          Inbound voicemails moved to{" "}
          <Link href="/app/calls?tab=voicemails" className="text-field-500 hover:underline">
            Calls → Voicemails
          </Link>
          . This page will become your outbound SMS hub: reminders, quote
          follow-ups, and a unified thread view per customer.
        </p>

        <div className="space-y-3 text-xs text-bone-400">
          <Feature title="Templated reminders">
            Auto-send the day before a scheduled job. Configurable per service
            type.
          </Feature>
          <Feature title="Quote follow-ups">
            Three-touch sequence on stale leads, opt-out via STOP.
          </Feature>
          <Feature title="Unified threads">
            Inbound replies route back to the same conversation, viewable per
            contact.
          </Feature>
        </div>

        <div className="mt-6 pt-6 border-t border-line">
          <Link
            href="/app/calls?tab=voicemails"
            className="inline-flex items-center gap-1.5 text-xs text-field-500 hover:text-field-400 font-medium"
          >
            <MessageSquare size={12} />
            Looking for voicemails?
            <ArrowRight size={12} />
          </Link>
        </div>
      </div>
    </div>
  );
}

function Feature({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-1 h-1 rounded-full bg-bone-400 mt-1.5 shrink-0" />
      <div>
        <span className="text-bone-100 font-medium">{title}</span>
        <span className="text-bone-400"> — {children}</span>
      </div>
    </div>
  );
}
