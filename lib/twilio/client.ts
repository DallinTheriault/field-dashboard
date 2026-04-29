import twilio from "twilio";

/**
 * Lazy-initialized Twilio client. Singleton per process to avoid recreating
 * on every API call. Throws synchronously if env vars are missing — better
 * than letting Twilio's SDK return a confusing "username required" error
 * downstream.
 */
let _client: ReturnType<typeof twilio> | null = null;

export function getTwilioClient() {
  if (_client) return _client;

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;

  if (!sid || !token) {
    throw new Error(
      "Twilio credentials missing. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.",
    );
  }

  _client = twilio(sid, token);
  return _client;
}

/**
 * Public base URL for callbacks. Twilio needs an absolute URL for status
 * callbacks. Defaults to fielddashboard.netlify.app; override via env if
 * you switch domains.
 */
export function getPublicBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.PUBLIC_BASE_URL ||
    "https://fielddashboard.netlify.app"
  ).replace(/\/$/, "");
}
