"use client";

import { useEffect, useState } from "react";
import { ChevronDown, MessageSquareText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";

type Template = {
  id: number;
  label: string;
  body: string;
  sort_order: number;
};

/**
 * Strip of saved-reply chips above the SMS reply box. Tapping a chip
 * inserts that template's body into the reply textarea via the onInsert
 * callback. RLS scopes templates to the current tenant automatically.
 *
 * If the tenant has no templates configured, renders a tiny "Manage
 * templates" link instead so the operator can find the settings.
 *
 * Limited to first 6 templates by sort_order; rest are hidden behind
 * the "more" affordance to avoid eating reply-box space on mobile.
 */
export function TemplateChips({
  onInsert,
}: {
  onInsert: (body: string) => void;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("sms_reply_templates")
        .select("id, label, body, sort_order")
        .is("archived_at", null)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(50);
      if (!cancelled) {
        setTemplates(data ?? []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return null;

  if (templates.length === 0) {
    return (
      <div className="px-3 py-1.5 border-b border-line-subtle text-2xs text-bone-400">
        <a
          href="/app/settings#sms-templates"
          className="hover:text-bone-100 inline-flex items-center gap-1"
        >
          <MessageSquareText size={11} />
          Add reply templates
        </a>
      </div>
    );
  }

  const visible = expanded ? templates : templates.slice(0, 6);
  const hasMore = templates.length > 6;

  return (
    <div className="px-2 py-1.5 border-b border-line-subtle flex items-center gap-1.5 overflow-x-auto scroll-x-hint">
      {visible.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onInsert(t.body)}
          title={t.body}
          className={cn(
            "shrink-0 px-2.5 h-7 text-2xs rounded-sm",
            "bg-ink-2 hover:bg-ink-3 border border-line text-bone-100",
            "transition-colors",
          )}
        >
          {t.label}
        </button>
      ))}
      {hasMore && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="shrink-0 px-2 h-7 text-2xs text-bone-400 hover:text-bone-100 inline-flex items-center gap-0.5"
        >
          +{templates.length - 6}
          <ChevronDown size={11} />
        </button>
      )}
    </div>
  );
}
