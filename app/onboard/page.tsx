"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Check, ArrowLeft } from "lucide-react";
import { Logo } from "@/components/ui/logo";

type Intake = {
  business_name: string;
  owner_first_name: string;
  business_phone: string;
  business_website: string;
  service_type: string;
  service_area: string;
  contact_email: string;
  notes: string;
};

const DEFAULTS: Intake = {
  business_name: "",
  owner_first_name: "",
  business_phone: "",
  business_website: "",
  service_type: "",
  service_area: "",
  contact_email: "",
  notes: "",
};

export default function OnboardPage() {
  const [form, setForm] = useState<Intake>(DEFAULTS);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<
    | { kind: "ok"; clientId: number; businessName: string }
    | { kind: "err"; message: string }
    | null
  >(null);

  function update<K extends keyof Intake>(key: K, value: Intake[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);

    try {
      const res = await fetch("/api/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setResult({
          kind: "err",
          message: data.error || `Request failed (${res.status})`,
        });
      } else {
        setResult({
          kind: "ok",
          clientId: data.client_id,
          businessName: data.business_name,
        });
      }
    } catch (err) {
      setResult({
        kind: "err",
        message: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (result?.kind === "ok") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 flex flex-col items-center gap-3">
            <Logo />
          </div>
          <div className="panel p-6 space-y-4">
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-sm bg-status-completed/10 border border-status-completed/30">
              <Check
                size={14}
                className="text-status-completed shrink-0 mt-0.5"
              />
              <div className="text-xs text-bone-100">
                <div className="font-medium">
                  {result.businessName} — request received
                </div>
                <div className="text-bone-300 mt-0.5">
                  Reference #{result.clientId}. We&rsquo;ll reach out within one
                  business day to finish setup.
                </div>
              </div>
            </div>
            <p className="text-xs text-bone-400 leading-relaxed">
              Field is a done-for-you product. Setup includes phone-number
              provisioning, voice configuration, calendar wiring, and a test
              call before your line goes live.
            </p>
            <button
              type="button"
              onClick={() => {
                setForm(DEFAULTS);
                setResult(null);
              }}
              className="btn-secondary w-full text-sm h-10"
            >
              Submit another request
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-start justify-center p-6 py-10">
      <div className="w-full max-w-lg">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-xs text-bone-400 hover:text-bone-50 mb-6"
        >
          <ArrowLeft size={12} />
          Back
        </Link>

        <div className="mb-6 flex flex-col items-start gap-3">
          <Logo />
          <div>
            <h1 className="text-2xl font-semibold text-bone-50 tracking-tight">
              Get started with Field
            </h1>
            <p className="text-sm text-bone-300 mt-1.5 leading-relaxed">
              Tell us about your business. We&rsquo;ll handle the rest — phone
              setup, voice config, calendar integration, and a test call before
              going live.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="form-card space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="field-group">
              <label className="field-label">Business name *</label>
              <input
                value={form.business_name}
                onChange={(e) => update("business_name", e.target.value)}
                required
                placeholder="Acme Painting Co."
              />
            </div>
            <div className="field-group">
              <label className="field-label">Your first name *</label>
              <input
                value={form.owner_first_name}
                onChange={(e) => update("owner_first_name", e.target.value)}
                required
                placeholder="Dallin"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="field-group">
              <label className="field-label">Business phone *</label>
              <input
                type="tel"
                value={form.business_phone}
                onChange={(e) => update("business_phone", e.target.value)}
                required
                placeholder="(801) 555-0100"
                className="font-mono"
              />
            </div>
            <div className="field-group">
              <label className="field-label">Email *</label>
              <input
                type="email"
                value={form.contact_email}
                onChange={(e) => update("contact_email", e.target.value)}
                required
                placeholder="you@business.com"
              />
              <p className="field-hint">We use this for setup and account access.</p>
            </div>
          </div>

          <div className="field-group">
            <label className="field-label">Website</label>
            <input
              type="url"
              value={form.business_website}
              onChange={(e) => update("business_website", e.target.value)}
              placeholder="https://yourbusiness.com"
            />
          </div>

          <div className="field-group">
            <label className="field-label">What do you do? *</label>
            <input
              value={form.service_type}
              onChange={(e) => update("service_type", e.target.value)}
              required
              placeholder="Apartment turn painting, plumbing, HVAC, etc."
            />
          </div>

          <div className="field-group">
            <label className="field-label">Service area</label>
            <input
              value={form.service_area}
              onChange={(e) => update("service_area", e.target.value)}
              placeholder="Salt Lake County and Utah County"
            />
          </div>

          <div className="field-group">
            <label className="field-label">Anything else we should know?</label>
            <textarea
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              rows={3}
              placeholder="Hours, what you don't do, special instructions, etc."
            />
          </div>

          {result?.kind === "err" && (
            <div className="form-error">{result.message}</div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full h-10 text-sm"
          >
            {submitting ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                Submitting…
              </>
            ) : (
              "Submit setup request"
            )}
          </button>

          <p className="text-2xs text-bone-400 text-center leading-relaxed">
            By submitting you agree to a $500 one-time setup fee and $397/month
            for the Field receptionist service. Billed only after your line
            goes live.
          </p>
        </form>
      </div>
    </main>
  );
}
