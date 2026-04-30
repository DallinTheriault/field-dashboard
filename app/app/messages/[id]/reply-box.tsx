"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Send, Loader2, AlertCircle, Ban } from "lucide-react";
import { sendSmsReply } from "./actions";
import { TemplateChips } from "@/components/sms/template-chips";

const SOFT_WARN_AT = 160;
const HARD_LIMIT = 1600;

function segmentInfo(len: number): { segs: number; color: string } {
  if (len === 0) return { segs: 0, color: "text-bone-400" };
  if (len <= 160) return { segs: 1, color: "text-bone-400" };
  // Rough multi-segment math (assumes GSM-7, doesn't account for emoji)
  const segs = Math.ceil(len / 153);
  if (segs <= 2) return { segs, color: "text-bone-300" };
  if (segs <= 4) return { segs, color: "text-status-progress" };
  return { segs, color: "text-status-danger" };
}

export function ReplyBox({
  threadId,
  isStopped,
}: {
  threadId: number;
  isStopped: boolean;
}) {
  const router = useRouter();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-grow textarea up to a reasonable max
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [body]);

  if (isStopped) {
    return (
      <div className="px-4 py-3 flex items-center gap-2 text-2xs text-bone-300 bg-status-cancelled/[0.06] border-t border-line">
        <Ban size={12} className="text-status-cancelled shrink-0" />
        <span>
          This contact has opted out by replying STOP. You can&apos;t send them
          messages from Field. They can text START to opt back in.
        </span>
      </div>
    );
  }

  const trimmed = body.trim();
  const canSend = trimmed.length > 0 && !sending;
  const overLimit = body.length > HARD_LIMIT;
  const { segs, color: segColor } = segmentInfo(body.length);

  async function handleSend() {
    if (!canSend || overLimit) return;
    setError(null);
    setSending(true);

    const result = await sendSmsReply(threadId, body);

    setSending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setBody("");
    router.refresh();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd+Enter or Ctrl+Enter to send
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  }

  /**
   * Template chip click. If the textarea is empty, replace; otherwise
   * append after a space (or newline if user is mid-thought). Refocus
   * the textarea so the user can keep typing immediately.
   */
  function handleInsertTemplate(templateBody: string) {
    setBody((prev) => {
      const trimmedPrev = prev.trim();
      if (!trimmedPrev) return templateBody;
      // Append. Leading space if previous didn't end on punctuation/whitespace.
      const sep = /[\s.,!?]$/.test(prev) ? "" : " ";
      return prev + sep + templateBody;
    });
    // Refocus + cursor to end after state settles
    setTimeout(() => {
      const el = ref.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }, 0);
  }

  return (
    <div className="border-t border-line">
      {error && (
        <div className="px-4 py-2 flex items-start gap-2 text-2xs bg-status-danger/[0.08] border-b border-status-danger/20">
          <AlertCircle
            size={12}
            className="text-status-danger shrink-0 mt-0.5"
          />
          <span className="text-bone-100 leading-relaxed">{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-bone-400 hover:text-bone-100 shrink-0"
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      <TemplateChips onInsert={handleInsertTemplate} />

      <div className="px-3 py-2.5">
        <div className="flex items-end gap-2">
          <textarea
            ref={ref}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a reply…"
            rows={1}
            disabled={sending}
            className="!bg-ink-2 !border-line resize-none flex-1 text-sm py-2 min-h-[36px] max-h-[200px] leading-relaxed"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend || overLimit}
            className="btn-primary text-sm h-9 shrink-0"
            title="Cmd+Enter to send"
          >
            {sending ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Send size={13} />
            )}
            Send
          </button>
        </div>

        <div className="flex items-center justify-between mt-1.5 px-1">
          <span className="text-2xs text-bone-400">
            {sending
              ? "Sending…"
              : trimmed.length === 0
              ? "Cmd+Enter to send"
              : null}
          </span>
          {body.length > 0 && (
            <span className={`text-2xs ${segColor}`}>
              {body.length} {body.length === 1 ? "char" : "chars"}
              {body.length > SOFT_WARN_AT && ` · ${segs} segments`}
              {overLimit && " · TOO LONG"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
