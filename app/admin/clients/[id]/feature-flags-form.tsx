"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ToggleRight } from "lucide-react";

type Flags = {
  feature_sms_enabled: boolean;
  feature_voice_enabled: boolean;
  feature_calendar_enabled: boolean;
  feature_billing_enabled: boolean;
  feature_estimator_enabled: boolean;
};

/**
 * Admin-only feature flag toggles for a tenant. Writes directly to the
 * Clients row using the admin's session (must have ADMIN_EMAILS access).
 *
 * Each flag controls whether the corresponding feature is visible+functional
 * in the tenant's dashboard. Disabled features render a "Disabled by admin"
 * panel instead of the feature UI.
 */
export function AdminFeatureFlagsForm({
  clientId,
  initial,
}: {
  clientId: number;
  initial: Flags;
}) {
  const router = useRouter();
  const [flags, setFlags] = useState<Flags>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setErr(null);
    setSaved(false);
    // Route through the admin service-role PATCH endpoint (same as the main
    // config form). A direct browser-client update is RLS-bound to the admin's
    // OWN tenant, so editing another tenant's flags silently updates 0 rows.
    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(flags),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErr(data.error || `Save failed (${res.status})`);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  function toggle(key: keyof Flags) {
    setFlags({ ...flags, [key]: !flags[key] });
  }

  const items: Array<{
    key: keyof Flags;
    label: string;
    desc: string;
  }> = [
    {
      key: "feature_voice_enabled",
      label: "Voice receptionist",
      desc: "Inbound calls, VAPI assistant, call summaries.",
    },
    {
      key: "feature_sms_enabled",
      label: "SMS",
      desc: "Two-way text conversations with customers.",
    },
    {
      key: "feature_calendar_enabled",
      label: "Calendar integration",
      desc: "Google Calendar sync for bookings (per-tenant calendar_id).",
    },
    {
      key: "feature_billing_enabled",
      label: "Billing page",
      desc: "Show Stripe billing UI. Hide for tenants on custom contracts.",
    },
    {
      key: "feature_estimator_enabled",
      label: "Estimator",
      desc: "Estimating + invoicing module: pricing settings, estimate builder, insights.",
    },
  ];

  return (
    <div className="form-card space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <ToggleRight size={14} className="text-field-500" />
        <h2 className="text-sm font-semibold text-bone-100">Feature flags</h2>
      </div>
      <p className="text-xs text-bone-400 mb-2">
        Disable features per-tenant. The corresponding pages will show a
        &ldquo;Disabled by admin&rdquo; panel instead of the feature UI.
      </p>

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
              aria-checked={flags[item.key]}
              onClick={() => toggle(item.key)}
              className={`shrink-0 relative w-10 h-5 rounded-full border transition-colors ${
                flags[item.key]
                  ? "bg-field-500 border-field-600"
                  : "bg-ink-3 border-line-strong"
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-bone-50 transition-all ${
                  flags[item.key] ? "left-5" : "left-0.5"
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
            "Save flags"
          )}
        </button>
      </div>
    </div>
  );
}
