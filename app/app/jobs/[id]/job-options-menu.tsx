"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  Mail,
  MapPin,
  MessageSquare,
  MoreVertical,
  Pencil,
  Phone,
  Calculator,
  type LucideIcon,
} from "lucide-react";
import { openSmsThread } from "@/lib/sms/open-thread-action";

type Entry = {
  key: string;
  label: string;
  icon: LucideIcon;
  href?: string;
  external?: boolean;
  onSelect?: () => void | Promise<void>;
  /** Replaces the label briefly after selection (copy confirmations). */
  doneLabel?: string;
};

/**
 * The job's action menu. Everything that used to be a button row lives here so
 * the header can read as heading-then-content — EXCEPT the phone and address,
 * which stay tappable in the header itself: they're the two most frequent
 * actions and must not cost an extra tap to reach.
 *
 * Entries are data, so the next one (Create invoice) is a single array item.
 */
export function JobOptionsMenu({
  jobId,
  phone,
  displayPhone,
  email,
  address,
  contactId,
  showNewEstimate,
}: {
  jobId: number;
  phone: string | null;
  displayPhone: string;
  email: string | null;
  address: string | null;
  contactId: number | null;
  showNewEstimate: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [doneKey, setDoneKey] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } finally {
        document.body.removeChild(ta);
      }
    }
    setDoneKey(key);
    window.setTimeout(() => setDoneKey(null), 1500);
  }

  const entries: Entry[] = [];
  if (phone) {
    entries.push(
      { key: "call", label: "Call", icon: Phone, href: `tel:${phone}` },
      {
        key: "text",
        label: "Text",
        icon: MessageSquare,
        onSelect: () => openSmsThread(phone, contactId),
      },
      {
        key: "copy-phone",
        label: "Copy phone",
        icon: Copy,
        doneLabel: "Copied",
        onSelect: () => copy(displayPhone, "copy-phone"),
      },
    );
  }
  if (address) {
    entries.push(
      {
        key: "copy-address",
        label: "Copy address",
        icon: Copy,
        doneLabel: "Copied",
        onSelect: () => copy(address, "copy-address"),
      },
      {
        key: "map",
        label: "Map",
        icon: MapPin,
        href: `https://maps.google.com/?q=${encodeURIComponent(address)}`,
        external: true,
      },
    );
  }
  if (email) {
    entries.push({ key: "email", label: email, icon: Mail, href: `mailto:${email}` });
  }
  if (showNewEstimate) {
    entries.push({
      key: "new-estimate",
      label: "New estimate",
      icon: Calculator,
      href: `/app/estimator/new?job=${jobId}`,
    });
  }
  entries.push({
    key: "edit",
    label: "Edit job",
    icon: Pencil,
    href: `/app/jobs/${jobId}/edit`,
  });

  return (
    <div ref={boxRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Job options"
        aria-haspopup="menu"
        aria-expanded={open}
        className="btn-ghost h-8 w-8 px-0 text-bone-400 hover:text-bone-100"
      >
        <MoreVertical size={16} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-20 min-w-[190px] rounded-md border border-line-strong bg-ink-2 shadow-lg py-1"
        >
          {entries.map((e) => {
            const Icon = e.icon;
            const label = doneKey === e.key && e.doneLabel ? e.doneLabel : e.label;
            const content = (
              <>
                {doneKey === e.key && e.doneLabel ? (
                  <Check size={13} className="text-status-completed shrink-0" />
                ) : (
                  <Icon size={13} className="text-bone-400 shrink-0" />
                )}
                <span className="truncate">{label}</span>
              </>
            );
            const cls =
              "flex items-center gap-2.5 w-full text-left px-3 py-2 text-sm text-bone-100 hover:bg-ink-3";
            if (e.href) {
              return (
                <a
                  key={e.key}
                  role="menuitem"
                  href={e.href}
                  {...(e.external ? { target: "_blank", rel: "noreferrer" } : {})}
                  onClick={() => setOpen(false)}
                  className={cls}
                >
                  {content}
                </a>
              );
            }
            return (
              <button
                key={e.key}
                type="button"
                role="menuitem"
                onClick={async () => {
                  await e.onSelect?.();
                  if (!e.doneLabel) setOpen(false);
                  router.refresh();
                }}
                className={cls}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
