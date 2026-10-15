"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, AlertCircle, Pencil } from "lucide-react";

type Profile = {
  business_short_name: string;
  owner_first_name: string;
  owner_email: string;
  owner_phone: string;
  business_website: string;
};

export function BusinessProfileForm({ initial }: { initial: Profile }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Profile>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function update<K extends keyof Profile>(key: K, value: Profile[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/branding/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setSavedAt(Date.now());
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setForm(initial);
    setEditing(false);
    setError(null);
  }

  const justSaved = savedAt !== null && Date.now() - savedAt < 2500;

  if (!editing) {
    return (
      <div>
        <dl className="divide-y divide-line-subtle">
          <Row label="Short name" value={initial.business_short_name} />
          <Row label="Owner first name" value={initial.owner_first_name} />
          <Row label="Owner email" value={initial.owner_email} />
          <Row label="Owner phone" value={initial.owner_phone} mono />
          <Row label="Website" value={initial.business_website} />
        </dl>
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="btn-secondary text-xs h-8"
          >
            <Pencil size={11} />
            Edit profile
          </button>
          {justSaved && (
            <span className="text-2xs text-status-completed flex items-center gap-1">
              <Check size={11} />
              Saved
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="px-4 py-4 space-y-3">
      <Row2>
        <FormField label="Short name" hint="Shown at the top of the app">
          <input
            value={form.business_short_name}
            onChange={(e) => update("business_short_name", e.target.value)}
          />
        </FormField>
        <FormField label="Owner first name">
          <input
            value={form.owner_first_name}
            onChange={(e) => update("owner_first_name", e.target.value)}
          />
        </FormField>
      </Row2>

      <Row2>
        <FormField label="Owner email">
          <input
            type="email"
            value={form.owner_email}
            onChange={(e) => update("owner_email", e.target.value)}
          />
        </FormField>
        <FormField label="Owner phone">
          <input
            type="tel"
            value={form.owner_phone}
            onChange={(e) => update("owner_phone", e.target.value)}
            className="font-mono"
          />
        </FormField>
      </Row2>

      <FormField label="Website">
        <input
          type="url"
          value={form.business_website}
          onChange={(e) => update("business_website", e.target.value)}
        />
      </FormField>

      {error && (
        <div className="flex items-start gap-1.5 text-2xs text-status-danger">
          <AlertCircle size={11} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button type="submit" className="btn-primary text-xs h-8" disabled={saving}>
          {saving ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              Saving…
            </>
          ) : (
            "Save changes"
          )}
        </button>
        <button
          type="button"
          onClick={cancel}
          className="btn-ghost text-xs h-8"
          disabled={saving}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Row({
  label,
  value,
  mono,
  multiline,
}: {
  label: string;
  value: string;
  mono?: boolean;
  multiline?: boolean;
}) {
  return (
    <div className="px-4 py-2.5 grid grid-cols-3 gap-3 items-baseline">
      <dt className="text-xs text-bone-400">{label}</dt>
      <dd
        className={`col-span-2 text-xs ${value ? "text-bone-100" : "text-bone-400"} ${
          mono ? "font-mono" : ""
        } ${multiline ? "whitespace-pre-wrap" : "truncate"}`}
      >
        {value || "—"}
      </dd>
    </div>
  );
}

function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="label-eyebrow block">{label}</label>
      {children}
      {hint && <p className="text-2xs text-bone-400">{hint}</p>}
    </div>
  );
}

function Row2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>;
}
