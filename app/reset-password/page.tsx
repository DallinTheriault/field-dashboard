'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const origin = typeof window !== 'undefined' ? window.location.origin : '';

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
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    }}>
      <div className="card" style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <Image src="/logo.png" alt="Field" width={64} height={64} priority />
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Reset password</h1>
        </div>

        {sent ? (
          <div style={{ display: 'grid', gap: 14 }}>
            <div className="success">
              If an account exists for <strong>{email}</strong>, a reset link is on its way.
              Check your inbox (and spam folder) within a minute or two.
            </div>
            <p className="small muted">
              The link opens a page where you can set a new password. It expires after one hour.
            </p>
            <Link href="/login" className="btn-secondary" style={{ textAlign: 'center', textDecoration: 'none' }}>
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <p className="muted small" style={{ marginBottom: 16 }}>
              Enter the email tied to your account and we&rsquo;ll send a link to reset your password.
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 16 }}>
              <div>
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>

              {error && <div className="error">{error}</div>}

              <button type="submit" disabled={loading}>
                {loading ? 'Sending\u2026' : 'Send reset link'}
              </button>

              <Link
                href="/login"
                className="small"
                style={{ textAlign: 'center', color: 'var(--muted)', textDecoration: 'none' }}
              >
                Back to sign in
              </Link>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
