"use client";

import { useState, useTransition } from "react";
import { MessageSquare, Copy, Check, Loader2 } from "lucide-react";
import { openSmsThread } from "@/lib/sms/open-thread-action";

/**
 * Two-button cluster shown wherever we used to have a `sms:` link.
 *   - "Text"  → server action upserts an sms_threads row, redirects into
 *     the dashboard's conversation view (where the reply box ships SMS
 *     via Twilio under our number).
 *   - "Copy"  → puts the phone (display-formatted) on the clipboard so
 *     the user can paste into iMessage/etc if they prefer their personal phone.
 */
export function TextAndCopyButtons({
  phone,
  contactId,
  displayPhone,
  size = "sm",
}: {
  phone: string;
  contactId?: number | null;
  displayPhone: string;
  size?: "sm" | "md";
}) {
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  const heightClass = size === "md" ? "h-9" : "h-8";

  function handleText() {
    startTransition(async () => {
      await openSmsThread(phone, contactId ?? null);
    });
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(displayPhone);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Older browsers / iOS without clipboard permission — fall back to
      // selecting and prompting copy via a hidden text field
      const ta = document.createElement("textarea");
      ta.value = displayPhone;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      } finally {
        document.body.removeChild(ta);
      }
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleText}
        disabled={pending}
        className={`btn-secondary text-xs ${heightClass}`}
      >
        {pending ? (
          <Loader2 size={11} className="animate-spin" />
        ) : (
          <MessageSquare size={11} />
        )}
        Text
      </button>
      <button
        type="button"
        onClick={handleCopy}
        className={`btn-secondary text-xs ${heightClass}`}
        title={`Copy ${displayPhone}`}
        aria-label="Copy phone number"
      >
        {copied ? (
          <Check size={11} className="text-status-completed" />
        ) : (
          <Copy size={11} />
        )}
        {copied ? "Copied" : "Copy"}
      </button>
    </>
  );
}
