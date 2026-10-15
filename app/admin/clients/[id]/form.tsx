"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Check } from "lucide-react";

/**
 * The platform-managed fields of a tenant. The receptionist's prompt and
 * phone settings were removed with the receptionist; their columns are kept
 * untouched (the save route only writes these fields).
 */
export type ClientConfig = {
  id: number | string;
  business_name: string;
  business_short_name: string;
  owner_first_name: string;
  business_phone: string;
  business_website: string;
  owner_email: string;
  owner_phone: string;
  timezone_label: string;
  calendar_id: string;
  is_active: boolean;
  is_test: boolean;
};

export function ClientConfigForm({ client }: { client: ClientConfig }) {
  const router = useRouter();
  const [form, setForm] = useState<ClientConfig>(client);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function update<K extends keyof ClientConfig>(key: K, value: ClientConfig[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
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
    }
  }

  const justSaved = savedAt !== null && Date.now() - savedAt < 2500;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Section title="Identity">
        <Row2>
          <Field label="Business name *">
            <input required value={form.business_name} onChange={(e) => update("business_name", e.target.value)} />
          </Field>
          <Field label="Short name" hint="Shown at the top of the app">
            <input value={form.business_short_name} onChange={(e) => update("business_short_name", e.target.value)} />
          </Field>
        </Row2>
        <Field label="Owner first name">
          <input value={form.owner_first_name} onChange={(e) => update("owner_first_name", e.target.value)} />
        </Field>
      </Section>

      <Section title="Contact">
        <Row2>
          <Field label="Business phone *">
            <input
              type="tel"
              required
              value={form.business_phone}
              onChange={(e) => update("business_phone", e.target.value)}
              className="font-mono"
            />
          </Field>
          <Field label="Website">
            <input type="url" value={form.business_website} onChange={(e) => update("business_website", e.target.value)} />
          </Field>
        </Row2>
        <Row2>
          <Field label="Owner email">
            <input type="email" value={form.owner_email} onChange={(e) => update("owner_email", e.target.value)} />
          </Field>
          <Field label="Owner phone">
            <input type="tel" value={form.owner_phone} onChange={(e) => update("owner_phone", e.target.value)} className="font-mono" />
          </Field>
        </Row2>
        <Field label="Timezone label">
          <input value={form.timezone_label} onChange={(e) => update("timezone_label", e.target.value)} />
        </Field>
        <div className="flex items-center gap-4 flex-wrap pt-2">
          <Toggle label="Tenant active" checked={form.is_active} onChange={(v) => update("is_active", v)} />
          <Toggle
            label="Test tenant (excluded from production analytics)"
            checked={form.is_test}
            onChange={(v) => update("is_test", v)}
          />
        </div>
      </Section>

      <Section title="Calendar">
        <Field label="Google Calendar ID">
          <input value={form.calendar_id} onChange={(e) => update("calendar_id", e.target.value)} className="font-mono" />
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
        <button type="submit" className="btn-primary text-sm ml-auto" disabled={saving}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="form-card">
      <legend className="label-eyebrow mb-3">{title}</legend>
      <div className="space-y-3">{children}</div>
    </fieldset>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
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

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-bone-100 cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="!w-4 !h-4 !p-0" />
      {label}
    </label>
  );
}
