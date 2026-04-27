'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords don\u2019t match.');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push('/dashboard');
    router.refresh();
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
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Set a new password</h1>
          <p className="muted small" style={{ textAlign: 'center', marginTop: 0 }}>
            Pick something you&rsquo;ll remember. At least 8 characters.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 16 }}>
          <div>
            <label htmlFor="password">New password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="confirm">Confirm new password</label>
            <input
              id="confirm"
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          {error && <div className="error">{error}</div>}

          <button type="submit" disabled={loading}>
            {loading ? 'Updating\u2026' : 'Update password'}
          </button>
        </form>
      </div>
    </main>
  );
}
