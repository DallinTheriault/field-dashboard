import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ChevronLeft, Phone, Clock, Check } from "lucide-react";
import { MarkRespondedButton } from "./mark-responded-button";

function fmtPhone(p: string | null): string {
  if (!p) return "—";
  const digits = p.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return p;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function MessageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const messageId = Number(id);
  if (!Number.isInteger(messageId) || messageId < 1) notFound();

  const supabase = await createClient();
  const { data: m } = await supabase
    .from("messages")
    .select("*")
    .eq("id", messageId)
    .maybeSingle();

  if (!m) notFound();

  // Mark read on view if not already (fire-and-forget)
  if (!m.read_at) {
    await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("id", messageId);
  }

  const callbackNumber = m.callback_phone || m.caller_phone;

  return (
    <div className="max-w-2xl">
      <Link
        href="/app/messages"
        className="inline-flex items-center gap-1 text-xs text-bone-400 hover:text-bone-50 mb-3"
      >
        <ChevronLeft size={12} />
        All messages
      </Link>

      <div className="panel">
        <div className="px-5 py-4 border-b border-line">
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="text-lg font-semibold text-bone-50">
              {m.caller_name || "Unknown caller"}
            </h1>
            <span className="text-2xs text-bone-400 flex items-center gap-1 shrink-0">
              <Clock size={10} />
              {fmtDate(m.created_at)}
            </span>
          </div>

          {callbackNumber && (
            <div className="mt-2 flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-sm text-bone-300 num">
                <Phone size={12} className="text-salmon-500" />
                {fmtPhone(callbackNumber)}
              </div>
              <a
                href={`tel:${callbackNumber}`}
                className="btn-secondary h-7 text-2xs"
              >
                Call back
              </a>
              <a
                href={`sms:${callbackNumber}`}
                className="btn-secondary h-7 text-2xs"
              >
                Text
              </a>
            </div>
          )}
        </div>

        <div className="px-5 py-5">
          <div className="label-eyebrow mb-2">Message</div>
          <p className="text-sm text-bone-100 leading-relaxed whitespace-pre-wrap">
            {m.message_body}
          </p>
        </div>

        <div className="px-5 py-3 border-t border-line flex items-center justify-between gap-3">
          {m.responded_at ? (
            <div className="text-xs text-status-completed flex items-center gap-1.5">
              <Check size={12} />
              Marked responded {fmtDate(m.responded_at)}
            </div>
          ) : (
            <div className="text-xs text-bone-400">Not yet responded</div>
          )}
          <MarkRespondedButton
            messageId={m.id}
            initiallyResponded={!!m.responded_at}
          />
        </div>
      </div>
    </div>
  );
}
