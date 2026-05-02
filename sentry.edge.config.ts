// Sentry initialization for the Edge runtime (middleware.ts, route handlers
// using `runtime = "edge"`). Loaded automatically by @sentry/nextjs.

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    environment: process.env.VERCEL_ENV ?? "production",
  });
}
