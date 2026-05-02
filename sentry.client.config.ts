// Sentry initialization for the browser. Loaded automatically by @sentry/nextjs.
// SENTRY_DSN must be set in env. If unset, Sentry is a no-op (won't break dev).

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Sample rate for traces. Lower in prod once volume picks up.
    tracesSampleRate: 0.1,
    // Send PII (user emails) — useful for debugging but be aware.
    sendDefaultPii: false,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "production",
    // Ignore noisy/unactionable errors
    ignoreErrors: [
      // Browser extensions
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      // Network noise
      "Failed to fetch",
      "Load failed",
      "NetworkError",
    ],
  });
}
