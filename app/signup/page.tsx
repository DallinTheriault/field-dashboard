"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/ui/logo";
import {
  Loader2,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

/**
 * Sign up — for INVITED team members only. This page does NOT create a
 * tenant or trigger billing. It only creates an auth.users row, after
 * which an existing tenant owner/manager can add this email to their
 * team via Settings → Team.
 *
 * This is intentionally distinct from /onboard (the public lead form
 * for prospective new tenants).
 *
 * Bot protection:
 *   - Honeypot field (same pattern as /onboard)
 *   - Email confirmation enforced by Supabase (must be enabled in
 *     Supabase Auth dashboard for full protection)
 *   - Supabase's built-in auth rate limiting at the edge
 */
function SignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [websiteUrlConfirm, setWebsiteUrlConfirm] = useState(""); // honeypot
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Honeypot: silently appear to succeed but don't actually call signup
    if (websiteUrlConfirm.trim() !== "") {
      setDone(true);
      return;
    }

    if (password.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: signUpError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    setDone(true);
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <CheckCircle2
            size={32}
            className="mx-auto mb-4 text-status-completed"
          />
          <h1 className="text-2xl font-semibold text-bone-50 mb-2">
            Check your email
          </h1>
          <p className="text-sm text-bone-300 leading-relaxed mb-6">
            We sent a confirmation link to{" "}
            <span className="font-mono text-bone-100">{email}</span>. Click
            it to verify your account, then ask your team owner to add you
            from their Settings → Team page.
          </p>
          <p className="text-2xs text-bone-400 leading-relaxed">
            If you don&apos;t see the email within a minute, check spam or
            promotions. The link works for 24 hours.
          </p>
          <Link
            href="/login"
            className="btn-secondary text-xs h-9 inline-flex mt-6"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <aside className="hidden md:flex relative overflow-hidden bg-ink-1 border-r border-line">
        <div className="absolute inset-0 opacity-[0.55] pointer-events-none">
          <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-field-500/10 blur-3xl" />
          <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full bg-field-600/10 blur-3xl" />
        </div>
        <div className="relative flex flex-col justify-between p-10 w-full">
          <Logo />
          <div>
            <div className="label-eyebrow text-field-500 mb-3">
              Joining a team
            </div>
            <h2 className="text-3xl font-semibold text-bone-50 tracking-tight leading-[1.15] max-w-sm">
              Create your account to get added to your team&apos;s Field
              dashboard.
            </h2>
            <p className="text-sm text-bone-300 mt-4 max-w-sm">
              This sign-up is for team members. If you&apos;re a business
              owner setting up Field for the first time, use the{" "}
              <Link
                href="/onboard"
                className="text-bone-100 underline underline-offset-2 hover:text-field-500"
              >
                business setup form
              </Link>{" "}
              instead.
            </p>
          </div>
          <div className="text-2xs text-bone-400 font-mono">
            © {new Date().getFullYear()} Field · Built in Utah
          </div>
        </div>
      </aside>

      <main className="flex items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-10 md:hidden flex justify-center">
            <Logo size="lg" />
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-bone-50 tracking-tight">
              Create your account
            </h1>
            <p className="text-sm text-bone-300 mt-1">
              You&apos;ll need a team owner to add you after sign-up.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Honeypot */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                left: "-10000px",
                width: "1px",
                height: "1px",
                overflow: "hidden",
              }}
            >
              <label htmlFor="website_url_confirm">
                Confirm your website (leave empty)
              </label>
              <input
                type="text"
                id="website_url_confirm"
                name="website_url_confirm"
                tabIndex={-1}
                autoComplete="off"
                value={websiteUrlConfirm}
                onChange={(e) => setWebsiteUrlConfirm(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="email" className="label-eyebrow block mb-1.5">
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

            <div>
              <label htmlFor="password" className="label-eyebrow block mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={12}
                autoComplete="new-password"
                className="w-full h-10"
                placeholder="At least 12 characters"
              />
              <p className="text-2xs text-bone-400 mt-1">
                12+ characters. Mix of letters, numbers, and symbols
                recommended.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="text-xs px-3 py-2 rounded-sm bg-status-danger/10 text-status-danger border border-status-danger/30 flex items-start gap-2"
              >
                <AlertCircle size={12} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full h-10 text-sm group"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Creating account…
                </>
              ) : (
                <>
                  Create account
                  <ArrowRight
                    size={14}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-line-subtle">
            <p className="text-xs text-bone-400">
              Already have an account?{" "}
              <Link
                href="/login"
                className="text-bone-100 hover:text-field-500 font-medium"
              >
                Sign in →
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
