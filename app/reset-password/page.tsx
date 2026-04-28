"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/ui/logo";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const origin = typeof window !== "undefined" ? window.location.origin : "";

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/callback?next=/reset-password/update`,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setSent(true);
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Logo />
          <h1 className="text-xl font-semibold text-bone-50 tracking-tight">
            Reset password
          </h1>
        </div>

        <div className="panel p-6">
          {sent ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-sm bg-status-completed/10 border border-status-completed/30">
                <Check
                  size={14}
                  className="text-status-completed shrink-0 mt-0.5"
                />
                <div className="text-xs text-bone-100">
                  <div className="font-medium">Reset link sent</div>
                  <div className="text-bone-300 mt-0.5">
                    If an account exists for{" "}
                    <span className="font-medium text-bone-100">{email}</span>,
                    a reset link is on its way. Check your inbox (and spam) within
                    a minute.
                  </div>
                </div>
              </div>
              <p className="text-2xs text-bone-400 leading-relaxed">
                The link opens a page where you can set a new password. It expires
                after one hour.
              </p>
              <Link
                href="/login"
                className="btn-secondary w-full text-sm h-10 inline-flex items-center justify-center gap-1.5"
              >
                <ArrowLeft size={13} />
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <p className="text-xs text-bone-300 mb-5 leading-relaxed">
                Enter the email tied to your account and we&rsquo;ll send a link to
                reset your password.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="field-group">
                  <label htmlFor="email" className="field-label">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    autoFocus
                    className="w-full h-10"
                    placeholder="you@business.com"
                  />
                </div>

                {error && <div className="form-error">{error}</div>}

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full h-10 text-sm"
                >
                  {loading ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      Sending…
                    </>
                  ) : (
                    "Send reset link"
                  )}
                </button>

                <Link
                  href="/login"
                  className="block text-center text-2xs text-bone-400 hover:text-bone-50"
                >
                  Back to sign in
                </Link>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
