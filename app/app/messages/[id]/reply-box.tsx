"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Send, Loader2, AlertCircle, Ban, Clock, Calendar } from "lucide-react";
import { sendSmsReply, scheduleSmsReply } from "./actions";
import { TemplateChips } from "@/components/sms/template-chips";
import { fromLocalInput } from "./scheduled-bubble";

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
  tenantTz,
}: {
  threadId: number;
  isStopped: boolean;
  tenantTz: string;
}) {
  const router = useRouter();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleTime, setScheduleTime] = useState<string>(
    defaultScheduleTime(tenantTz),
  );
  const [scheduling, setScheduling] = useState(false);

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

  async function handleSchedule() {
    setError(null);
    if (!trimmed) {
      setError("Type a message first.");
      return;
    }
    if (overLimit) {
      setError("Message too long.");
      return;
    }
    const iso = fromLocalInput(scheduleTime, tenantTz);
    if (!iso) {
      setError("Invalid date/time.");
      return;
    }
    if (new Date(iso).getTime() <= Date.now() + 30 * 1000) {
      // Tiny grace for "schedule in 1 hour" preset clicked at the boundary
      setError("Pick a time at least a minute in the future.");
      return;
    }
    setScheduling(true);
    const result = await scheduleSmsReply(threadId, body, iso);
    setScheduling(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setBody("");
    setScheduleOpen(false);
    setScheduleTime(defaultScheduleTime(tenantTz));
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
          <button
            type="button"
            onClick={() => {
              if (!trimmed) {
                setError("Type a message first, then schedule.");
                return;
              }
              setError(null);
              setScheduleOpen((v) => !v);
            }}
            disabled={!trimmed || sending || scheduling || overLimit}
            className="btn-secondary text-sm h-9 shrink-0 px-2.5"
            title="Schedule for later"
            aria-label="Schedule for later"
          >
            <Clock size={13} />
          </button>
        </div>

        {scheduleOpen && (
          <div className="mt-2 bg-ink-2 border border-line rounded-md p-3 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <Calendar size={12} className="text-field-500" />
              <span className="text-xs font-medium text-bone-100">
                Schedule for later
              </span>
              <span className="text-2xs text-bone-400 ml-auto">
                Tenant timezone:{" "}
                <span className="font-mono">{tenantTz}</span>
              </span>
            </div>

            {/* Quick presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setScheduleTime(presetIn(tenantTz, 60))}
                className="text-2xs px-2 h-7 bg-ink-1 hover:bg-ink-3 border border-line rounded-sm text-bone-100"
              >
                In 1 hour
              </button>
              <button
                type="button"
                onClick={() => setScheduleTime(presetTomorrowMorning(tenantTz))}
                className="text-2xs px-2 h-7 bg-ink-1 hover:bg-ink-3 border border-line rounded-sm text-bone-100"
              >
                Tomorrow 9am
              </button>
              <button
                type="button"
                onClick={() => setScheduleTime(presetIn(tenantTz, 60 * 24 * 7))}
                className="text-2xs px-2 h-7 bg-ink-1 hover:bg-ink-3 border border-line rounded-sm text-bone-100"
              >
                Next week
              </button>
            </div>

            <input
              type="datetime-local"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
              className="!bg-ink-1 w-full text-sm font-mono"
            />

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleSchedule}
                disabled={scheduling || !trimmed || overLimit}
                className="btn-primary text-xs h-8"
              >
                {scheduling ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <Calendar size={11} />
                )}
                Schedule send
              </button>
              <button
                type="button"
                onClick={() => setScheduleOpen(false)}
                disabled={scheduling}
                className="btn-ghost text-xs h-8"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

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

/* ---------------- schedule-time helpers ---------------- */

/**
 * Return YYYY-MM-DDTHH:MM (in tenant tz) for "now + minutes minutes".
 * Used by the preset buttons. We compute the absolute UTC instant first,
 * then format it in the tenant's wall-clock terms.
 */
function presetIn(tz: string, minutes: number): string {
  const target = new Date(Date.now() + minutes * 60 * 1000);
  return formatLocal(target, tz);
}

/**
 * "Tomorrow at 9am tenant-tz". Compute today's date in tenant tz, add 1
 * day, set time to 09:00 in that tz.
 */
function presetTomorrowMorning(tz: string): string {
  const now = new Date();
  // Get today's date components in tenant tz
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  // Construct "tomorrow at 09:00" as an input string, then let
  // fromLocalInput convert to ISO so we can normalize via formatLocal.
  const y = Number(get("year"));
  const m = Number(get("month")) - 1;
  const d = Number(get("day")) + 1;
  // Build a "naive" UTC moment for tomorrow midnight tenant-tz, then add 9h.
  // Easier to just produce the YYYY-MM-DDT09:00 string directly.
  const tomorrow = new Date(Date.UTC(y, m, d));
  const yy = tomorrow.getUTCFullYear();
  const mm = String(tomorrow.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(tomorrow.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}T09:00`;
}

/**
 * Default initial value for the datetime input — tomorrow morning.
 */
function defaultScheduleTime(tz: string): string {
  return presetTomorrowMorning(tz);
}

/**
 * Format a Date as YYYY-MM-DDTHH:MM in the given timezone for use as a
 * datetime-local input value.
 */
function formatLocal(date: Date, tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
    let hour = get("hour");
    if (hour === "24") hour = "00";
    return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
  } catch {
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
}
