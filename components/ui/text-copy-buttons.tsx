"use client";

import { useState } from "react";
import { MessageSquare, Copy, Check } from "lucide-react";

/**
 * Text and Copy for a phone number. "Text" opens the phone's own messaging
 * app; "Copy" puts the display-formatted number on the clipboard.
 */
export function TextAndCopyButtons({
  phone,
  displayPhone,
  size = "sm",
}: {
  phone: string;
  displayPhone: string;
  size?: "sm" | "md";
}) {
  const [copied, setCopied] = useState(false);
  const heightClass = size === "md" ? "h-9" : "h-8";

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(displayPhone);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Older browsers / iOS without clipboard permission: copy through a
      // hidden text field.
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
      <a href={`sms:${phone}`} className={`btn-secondary text-xs ${heightClass}`}>
        <MessageSquare size={11} />
        Text
      </a>
      <button
        type="button"
        onClick={handleCopy}
        className={`btn-secondary text-xs ${heightClass}`}
        title={`Copy ${displayPhone}`}
        aria-label="Copy phone number"
      >
        {copied ? <Check size={11} className="text-status-completed" /> : <Copy size={11} />}
        {copied ? "Copied" : "Copy"}
      </button>
    </>
  );
}
