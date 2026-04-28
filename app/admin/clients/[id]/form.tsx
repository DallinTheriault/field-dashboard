"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Check, RefreshCcw } from "lucide-react";

type ClientConfig = {
  id: number | string;
  business_name: string;
  business_short_name: string;
  owner_first_name: string;
  intake_mode: string;
  service_type: string;
  primary_service: string;
  business_phone: string;
  business_website: string;
  contact_email: string;
  service_area: string;
  business_hours: string;
  service_constraints: string;
  pricing_block: string;
  scope_values: string;
  escalation_phone: string;
  timezone_label: string;
  twilio_number: string;
  vapi_assistant_id: string;
  calendar_id: string;
  notify_email: string;
  notify_dashboard_ping: boolean;
  notify_sms: boolean;
  is_active: boolean;
};

export function ClientConfigForm({ client }: { client: ClientConfig }) {
  const router = useRouter();
  const [form, setForm] = useState<ClientConfig>(client);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function update<K extends keyof ClientConfig>(key: K, value: ClientConfig[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save(opts: { regenerate: boolean }) {
    setErr(null);
    if (opts.regenerate) setRegenerating(true);
    else setSaving(true);

    try {
      const res = await fetch(`/api/admin/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, regenerate_prompt: opts.regenerate }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErr(data.error || `Save failed (${res.status})`);
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setSaving(false);
      setRegenerating(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    save({ regenerate: false });
  }

  const justSaved = savedAt !== null && Date.now() - savedAt < 2500;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Section title="Identity">
        <Row2>
          <Field label="Business name *">
            <input
              required
              value={form.business_name}
              onChange={(e) => update("business_name", e.target.value)}
            />
          </Field>
          <Field label="Short name (TTS-friendly)" hint="What the assistant says aloud">
            <input
              value={form.business_short_name}
              onChange={(e) => update("business_short_name", e.target.value)}
            />
          </Field>
        </Row2>
        <Row2>
          <Field label="Owner first name" hint="Used in overflow greeting">
            <input
              value={form.owner_first_name}
              onChange={(e) => update("owner_first_name", e.target.value)}
            />
          </Field>
          <Field label="Intake mode" hint="primary = Field is the only line · overflow = owner answers first">
            <select
              value={form.intake_mode}
              onChange={(e) => update("intake_mode", e.target.value)}
            >
              <option value="primary">primary</option>
              <option value="overflow">overflow</option>
            </select>
          </Field>
        </Row2>
        <Row2>
          <Field label="Service type" hint='e.g. "painting", "plumbing"'>
            <input
              value={form.service_type}
              onChange={(e) => update("service_type", e.target.value)}
            />
          </Field>
          <Field label="Primary service" hint="Stored on every captured job">
            <input
              value={form.primary_service}
              onChange={(e) => update("primary_service", e.target.value)}
            />
          </Field>
        </Row2>
      </Section>

      <Section title="Contact & coverage">
        <Row2>
          <Field label="Customer-facing phone *">
            <input
              type="tel"
              required
              value={form.business_phone}
              onChange={(e) => update("business_phone", e.target.value)}
              className="font-mono"
            />
          </Field>
          <Field label="Website">
            <input
              type="url"
              value={form.business_website}
              onChange={(e) => update("business_website", e.target.value)}
            />
          </Field>
        </Row2>
        <Field label="Owner email">
          <input
            type="email"
            value={form.contact_email}
            onChange={(e) => update("contact_email", e.target.value)}
          />
        </Field>
        <Field label="Service area">
          <input
            value={form.service_area}
            onChange={(e) => update("service_area", e.target.value)}
            placeholder="Salt Lake County and Utah County"
          />
        </Field>
        <Row2>
          <Field label="Business hours">
            <input
              value={form.business_hours}
              onChange={(e) => update("business_hours", e.target.value)}
              placeholder="Mon-Fri 8AM-6PM, Sat 10AM-4PM"
            />
          </Field>
          <Field label="Timezone label">
            <select
              value={form.timezone_label}
              onChange={(e) => update("timezone_label", e.target.value)}
            >
              <option>Mountain Time</option>
              <option>Pacific Time</option>
              <option>Central Time</option>
              <option>Eastern Time</option>
            </select>
          </Field>
        </Row2>
      </Section>

      <Section title="Service details">
        <Field label="Service constraints" hint="What you don't do — keeps the assistant from over-promising">
          <textarea
            rows={2}
            value={form.service_constraints}
            onChange={(e) => update("service_constraints", e.target.value)}
            placeholder="Interior only. No exteriors, no single-family homes."
          />
        </Field>
        <Field label="Scope values" hint="Comma list. Stored on jobs.scope.">
          <input
            value={form.scope_values}
            onChange={(e) => update("scope_values", e.target.value)}
            placeholder="studio, 1br, 2br, 3br+"
          />
        </Field>
        <Field label="Pricing block" hint="What the assistant says about price. Use 'Quote only' if you don't publish.">
          <textarea
            rows={3}
            value={form.pricing_block}
            onChange={(e) => update("pricing_block", e.target.value)}
            placeholder="Studio $320-$520, 1BR $420-$720, 2BR $580-$990, 3BR+ $780-$1,320. Property supplies paint."
          />
        </Field>
      </Section>

      <Section title="Escalation & notifications">
        <Field label="Escalation phone" hint="Where to transfer hostile/complex callers. Defaults to business phone if empty.">
          <input
            type="tel"
            value={form.escalation_phone}
            onChange={(e) => update("escalation_phone", e.target.value)}
            className="font-mono"
          />
        </Field>
        <Field label="Notification email">
          <input
            type="email"
            value={form.notify_email}
            onChange={(e) => update("notify_email", e.target.value)}
          />
        </Field>
        <div className="flex items-center gap-4 flex-wrap">
          <Toggle
            label="Dashboard pings"
            checked={form.notify_dashboard_ping}
            onChange={(v) => update("notify_dashboard_ping", v)}
          />
          <Toggle
            label="SMS alerts"
            checked={form.notify_sms}
            onChange={(v) => update("notify_sms", v)}
          />
          <Toggle
            label="Tenant active"
            checked={form.is_active}
            onChange={(v) => update("is_active", v)}
          />
        </div>
      </Section>

      <Section title="Infrastructure">
        <Row2>
          <Field label="Twilio number">
            <input
              value={form.twilio_number}
              onChange={(e) => update("twilio_number", e.target.value)}
              placeholder="+15555550100"
              className="font-mono"
            />
          </Field>
          <Field label="VAPI assistant ID">
            <input
              value={form.vapi_assistant_id}
              onChange={(e) => update("vapi_assistant_id", e.target.value)}
              className="font-mono"
            />
          </Field>
        </Row2>
        <Field label="Google Calendar ID">
          <input
            value={form.calendar_id}
            onChange={(e) => update("calendar_id", e.target.value)}
            className="font-mono"
          />
        </Field>
      </Section>

      {err && <div className="form-error">{err}</div>}

      <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
        {justSaved && (
          <span className="text-xs text-status-completed flex items-center gap-1">
            <Check size={12} />
            Saved
          </span>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <button
            type="submit"
            className="btn-secondary text-sm"
            disabled={saving || regenerating}
          >
            {saving ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save size={13} />
                Save
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => save({ regenerate: true })}
            className="btn-primary text-sm"
            disabled={saving || regenerating}
          >
            {regenerating ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                Regenerating…
              </>
            ) : (
              <>
                <RefreshCcw size={13} />
                Save &amp; regenerate prompt
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="form-card">
      <legend className="label-eyebrow mb-3">{title}</legend>
      <div className="space-y-3">{children}</div>
    </fieldset>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field-group">
      <label className="field-label">{label}</label>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

function Row2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>;
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-bone-100 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="!w-4 !h-4 !p-0"
      />
      {label}
    </label>
  );
}
