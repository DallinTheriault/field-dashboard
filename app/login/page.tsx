"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/ui/logo";
import { Loader2, ArrowRight, Clock } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect") || "/app";
  const reason = params.get("reason");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push(redirect);
    router.refresh();
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <aside className="hidden md:flex relative overflow-hidden bg-ink-1 border-r border-line">
        <div className="absolute inset-0 opacity-[0.55] pointer-events-none">
          <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-salmon-500/10 blur-3xl" />
          <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full bg-salmon-600/10 blur-3xl" />
        </div>
        <div className="relative flex flex-col justify-between p-10 w-full">
          <Logo />
          <div>
            <div className="label-eyebrow text-salmon-500 mb-3">Intelligent Receptionist &amp; Intake System</div>
            <h2 className="text-3xl font-semibold text-bone-50 tracking-tight leading-[1.15] max-w-sm">
              Every call answered. Every lead captured. Every booking on your
              calendar.
            </h2>
            <p className="text-sm text-bone-300 mt-4 max-w-sm">
              Field answers your business phone like a trained receptionist — so you
              never lose a customer to voicemail.
            </p>
          </div>
          <div className="text-2xs text-bone-400 font-mono">
            © {new Date().getFullYear()} Field · Built in Utah
          </div>
        </div>
      </aside>

      <main className="flex items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-10 md:hidden">
            <Logo />
          </div>

          {reason === "idle" && (
            <div className="mb-6 px-3 py-2.5 rounded-sm border border-status-progress/30 bg-status-progress/10 flex items-start gap-2">
              <Clock size={13} className="text-status-progress shrink-0 mt-0.5" />
              <div className="text-xs text-bone-100">
                <div className="font-medium">Signed out for inactivity</div>
                <div className="text-bone-300 mt-0.5">
                  Sign in again to pick up where you left off.
                </div>
              </div>
            </div>
          )}

          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-bone-50 tracking-tight">
              Sign in
            </h1>
            <p className="text-sm text-bone-300 mt-1">
              Access your Field dashboard
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
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
              <div className="flex items-baseline justify-between mb-1.5">
                <label htmlFor="password" className="label-eyebrow">
                  Password
                </label>
                <Link
                  href="/reset-password"
                  className="text-2xs text-bone-400 hover:text-salmon-500"
                >
                  Forgot password?
                </Link>
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full h-10"
                placeholder="••••••••••••"
              />
            </div>

            {error && (
              <div
                role="alert"
                className="text-xs px-3 py-2 rounded-sm bg-status-danger/10 text-status-danger border border-status-danger/30"
              >
                {error}
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
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
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
              New here?{" "}
              <Link
                href="/onboard"
                className="text-bone-100 hover:text-salmon-500 font-medium"
              >
                Set up your business →
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
