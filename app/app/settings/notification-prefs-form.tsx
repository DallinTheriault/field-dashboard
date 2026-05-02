"use client";

import { useState } from "react";
import { Loader2, Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Prefs = {
  notify_email: boolean;
  notify_dashboard_ping: boolean;
  notify_sms: boolean;
};

/**
 * Owner-level notification preferences. Controls whether the tenant gets
 * notified for new calls/messages by email, dashboard ping, or SMS.
 */
export function NotificationPrefsForm({
  clientId,
  initial,
}: {
  clientId: number;
  initial: Prefs;
}) {
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setErr(null);
    setSaved(false);
    const supabase = createClient();
    const { error } = await supabase
      .from("Clients")
      .update(prefs)
      .eq("id", clientId);
    setSaving(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function toggle(key: keyof Prefs) {
    setPrefs({ ...prefs, [key]: !prefs[key] });
  }

  const items: Array<{ key: keyof Prefs; label: string; desc: string }> = [
    {
      key: "notify_dashboard_ping",
      label: "Dashboard notifications",
      desc: "In-app bell badge when a new call or message arrives.",
    },
    {
      key: "notify_email",
      label: "Email notifications",
      desc: "Send to the owner email when leads come in.",
    },
    {
      key: "notify_sms",
      label: "SMS notifications",
      desc: "Text the owner phone for high-priority events. Off by default.",
    },
  ];

  return (
    <div className="form-card space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <Bell size={14} className="text-field-500" />
        <h2 className="text-sm font-semibold text-bone-100">Notifications</h2>
      </div>

      <div className="divide-y divide-line-subtle">
        {items.map((item) => (
          <label
            key={item.key}
            className="flex items-start justify-between gap-3 py-3 cursor-pointer"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm text-bone-100 font-medium">
                {item.label}
              </div>
              <div className="text-2xs text-bone-400 mt-0.5">{item.desc}</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs[item.key]}
              onClick={() => toggle(item.key)}
              className={`shrink-0 relative w-10 h-5 rounded-full border transition-colors ${
                prefs[item.key]
                  ? "bg-field-500 border-field-600"
                  : "bg-ink-3 border-line-strong"
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-bone-50 transition-all ${
                  prefs[item.key] ? "left-5" : "left-0.5"
                }`}
              />
            </button>
          </label>
        ))}
      </div>

      {err && <div className="form-error">{err}</div>}

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-line-subtle">
        {saved && <span className="text-2xs text-field-500">Saved.</span>}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-primary text-sm"
        >
          {saving ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              Saving…
            </>
          ) : (
            "Save preferences"
          )}
        </button>
      </div>
    </div>
  );
}
