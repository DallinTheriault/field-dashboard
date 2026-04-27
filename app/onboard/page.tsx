'use client';

import { useState } from 'react';

type FormState = {
  // Required
  business_name: string;
  business_phone: string;
  twilio_number: string;

  // Business details
  business_shortname: string;
  business_website: string;

  // Service vocabulary
  service_noun: string;
  primary_service: string;
  scope_options: string;
  address_label: string;
  intent_keywords: string;

  // Location & hours
  service_area: string;
  hours: string;
  service_description: string;
  timezone: string;
  timezone_name: string;
  timezone_iso_offset: string;

  // Pricing
  pricing: string;
  pricing_hedge: string;

  // Voice
  assistant_name: string;
  assistant_pronunciation: string;
  tone: string;

  // Escalation
  escalation_phone: string;
  escalation_triggers: string;
};

const DEFAULTS: FormState = {
  business_name: '',
  business_phone: '',
  twilio_number: '',
  business_shortname: '',
  business_website: '',
  service_noun: 'service',
  primary_service: 'service call',
  scope_options: 'standard, custom',
  address_label: 'address',
  intent_keywords: 'estimate/quote/bid',
  service_area: '',
  hours: 'Mon-Fri 8AM-6PM',
  service_description: '',
  timezone: 'America/Denver',
  timezone_name: 'Mountain Time',
  timezone_iso_offset: '-06:00',
  pricing: 'Quote only. Someone from the team follows up with a number.',
  pricing_hedge: '',
  assistant_name: 'Aria',
  assistant_pronunciation: 'are-ee-uh',
  tone: 'Sharp, friendly receptionist. Short sentences. Warm but direct.',
  escalation_phone: '',
  escalation_triggers: 'hostile callers, legal questions, or caller asks for a human',
};

const TIMEZONE_OPTIONS = [
  { name: 'Mountain Time (MDT)', iana: 'America/Denver', label: 'Mountain Time', offset: '-06:00' },
  { name: 'Mountain Time (MST)', iana: 'America/Phoenix', label: 'Mountain Time', offset: '-07:00' },
  { name: 'Pacific Time (PDT)', iana: 'America/Los_Angeles', label: 'Pacific Time', offset: '-07:00' },
  { name: 'Central Time (CDT)', iana: 'America/Chicago', label: 'Central Time', offset: '-05:00' },
  { name: 'Eastern Time (EDT)', iana: 'America/New_York', label: 'Eastern Time', offset: '-04:00' },
];

export default function OnboardPage() {
  const [form, setForm] = useState<FormState>(DEFAULTS);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<
    | { kind: 'ok'; clientId: number; businessName: string }
    | { kind: 'err'; message: string }
    | null
  >(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }));
  }

  function onTimezoneChange(iana: string) {
    const opt = TIMEZONE_OPTIONS.find(o => o.iana === iana);
    if (!opt) return;
    setForm(f => ({
      ...f,
      timezone: opt.iana,
      timezone_name: opt.label,
      timezone_iso_offset: opt.offset,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);

    try {
      const res = await fetch('/api/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          services: form.service_description || form.primary_service,
          business_shortname: form.business_shortname || form.business_name,
          escalation_phone: form.escalation_phone || form.business_phone,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setResult({ kind: 'err', message: data.error || `Request failed (${res.status})` });
      } else {
        setResult({
          kind: 'ok',
          clientId: data.client_id,
          businessName: data.business_name,
        });
      }
    } catch (err) {
      setResult({ kind: 'err', message: err instanceof Error ? err.message : 'Network error' });
    } finally {
      setSubmitting(false);
    }
  }

  if (result?.kind === 'ok') {
    return (
      <main className="container" style={{ maxWidth: 640 }}>
        <div className="card">
          <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>
            {result.businessName} onboarded ✓
          </h1>
          <p className="muted small" style={{ marginBottom: 16 }}>
            Client ID: <span className="mono">{result.clientId}</span>. Next steps:
          </p>
          <ol style={{ paddingLeft: 20, display: 'grid', gap: 8, fontSize: 14, marginBottom: 20 }}>
            <li>Buy a Twilio number and set its voice webhook to your VAPI trunk.</li>
            <li>Create a VAPI assistant — paste the generated <code>system_prompt</code> from the <code>Clients</code> row.</li>
            <li>Set the VAPI assistant's Server URL to your WF1 webhook.</li>
            <li>Attach the Twilio number to the VAPI assistant.</li>
            <li>Connect or create the Google Calendar, save <code>calendar_id</code> on the Clients row.</li>
            <li>Test call.</li>
          </ol>
          <button className="btn-secondary" onClick={() => { setForm(DEFAULTS); setResult(null); }}>
            Onboard another client
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="container" style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 4 }}>Onboard a new business</h1>
        <p className="muted small">
          Fill in what you know. Anything left blank uses a sensible default.
          A rendered system prompt will be saved to the new <code>Clients</code> row.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 24 }}>

        <section className="card" style={{ display: 'grid', gap: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>
            Business
          </h2>

          <Field label="Business name *" required>
            <input
              value={form.business_name}
              onChange={e => update('business_name', e.target.value)}
              placeholder="Sharpline Painting Co."
              required
            />
          </Field>

          <Field label="Short name (how Aria says it aloud)" hint="Used in the greeting. Shorter is better for TTS.">
            <input
              value={form.business_shortname}
              onChange={e => update('business_shortname', e.target.value)}
              placeholder="Sharpline Painting"
            />
          </Field>

          <div className="grid-2">
            <Field label="Customer-facing phone *">
              <input
                type="tel"
                value={form.business_phone}
                onChange={e => update('business_phone', e.target.value)}
                placeholder="(877) 894-0787"
                required
              />
            </Field>
            <Field label="Twilio number *" hint="Incoming calls route here.">
              <input
                type="tel"
                value={form.twilio_number}
                onChange={e => update('twilio_number', e.target.value)}
                placeholder="+15555550100"
                required
              />
            </Field>
          </div>

          <Field label="Website">
            <input
              type="url"
              value={form.business_website}
              onChange={e => update('business_website', e.target.value)}
              placeholder="sharplinepainting.co"
            />
          </Field>
        </section>

        <section className="card" style={{ display: 'grid', gap: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>
            Service vocabulary
          </h2>

          <div className="grid-2">
            <Field label="Service noun" hint='One word: "painting", "plumbing", "HVAC work"'>
              <input
                value={form.service_noun}
                onChange={e => update('service_noun', e.target.value)}
              />
            </Field>
            <Field label="Primary service" hint="Stored in jobs.service for every saved call">
              <input
                value={form.primary_service}
                onChange={e => update('primary_service', e.target.value)}
                placeholder="apartment turn"
              />
            </Field>
          </div>

          <div className="grid-2">
            <Field label="Scope options" hint="Comma list. Stored in jobs.scope.">
              <input
                value={form.scope_options}
                onChange={e => update('scope_options', e.target.value)}
                placeholder="studio, 1br, 2br, 3br+"
              />
            </Field>
            <Field label="Address label" hint='What to call the location. "property address", "service address", just "address"'>
              <input
                value={form.address_label}
                onChange={e => update('address_label', e.target.value)}
              />
            </Field>
          </div>

          <Field label="Intent keywords" hint="Slash-separated words that trigger a new estimate">
            <input
              value={form.intent_keywords}
              onChange={e => update('intent_keywords', e.target.value)}
              placeholder="estimate/quote/bid"
            />
          </Field>
        </section>

        <section className="card" style={{ display: 'grid', gap: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>
            Location &amp; hours
          </h2>

          <Field label="Service area" hint='One line: "Utah County and Salt Lake County only"'>
            <input
              value={form.service_area}
              onChange={e => update('service_area', e.target.value)}
            />
          </Field>

          <Field label="Hours">
            <input
              value={form.hours}
              onChange={e => update('hours', e.target.value)}
              placeholder="Mon-Fri 8AM-6PM, Sat-Sun 10AM-4PM"
            />
          </Field>

          <Field label="Service description" hint="One sentence on what you do + what you don't">
            <textarea
              value={form.service_description}
              onChange={e => update('service_description', e.target.value)}
              placeholder="Interior apartment painting only. No exteriors, no single-family."
              rows={2}
            />
          </Field>

          <Field label="Timezone">
            <select
              value={form.timezone}
              onChange={e => onTimezoneChange(e.target.value)}
            >
              {TIMEZONE_OPTIONS.map(t => (
                <option key={t.iana} value={t.iana}>{t.name}</option>
              ))}
            </select>
          </Field>
        </section>

        <section className="card" style={{ display: 'grid', gap: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>
            Pricing
          </h2>

          <Field label="Pricing line" hint="What Aria says if asked. Use 'Quote only' if you don't publish prices.">
            <textarea
              value={form.pricing}
              onChange={e => update('pricing', e.target.value)}
              rows={2}
            />
          </Field>

          <Field label="Pricing hedge" hint="Optional caveat, e.g. 'Always say roughly and depends on the unit.'">
            <input
              value={form.pricing_hedge}
              onChange={e => update('pricing_hedge', e.target.value)}
            />
          </Field>
        </section>

        <section className="card" style={{ display: 'grid', gap: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>
            Voice persona
          </h2>

          <div className="grid-2">
            <Field label="Assistant name">
              <input
                value={form.assistant_name}
                onChange={e => update('assistant_name', e.target.value)}
              />
            </Field>
            <Field label="Pronunciation hint" hint='Phonetic spelling: "are-ee-uh"'>
              <input
                value={form.assistant_pronunciation}
                onChange={e => update('assistant_pronunciation', e.target.value)}
              />
            </Field>
          </div>

          <Field label="Tone" hint="1–2 sentences describing the receptionist vibe">
            <textarea
              value={form.tone}
              onChange={e => update('tone', e.target.value)}
              rows={2}
            />
          </Field>
        </section>

        <section className="card" style={{ display: 'grid', gap: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>
            Escalation
          </h2>

          <Field label="Transfer-to phone" hint="Where Aria routes hostile/complex calls. Defaults to business phone.">
            <input
              type="tel"
              value={form.escalation_phone}
              onChange={e => update('escalation_phone', e.target.value)}
              placeholder="+18018341909"
            />
          </Field>

          <Field label="Escalation triggers">
            <input
              value={form.escalation_triggers}
              onChange={e => update('escalation_triggers', e.target.value)}
            />
          </Field>
        </section>

        {result?.kind === 'err' && <div className="error">{result.message}</div>}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Onboarding…' : 'Onboard business'}
          </button>
        </div>
      </form>
    </main>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label>{label}{required && ' '}</label>
      {children}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}
