/**
 * Email sending wrapper for Field.
 *
 * Thin abstraction over Resend so call sites don't depend on the SDK directly.
 * Replace the implementation if Anthropic ever changes providers — only this
 * file changes, not the dozens of call sites.
 *
 * REQUIRED ENV VARS:
 *   RESEND_API_KEY      - from resend.com dashboard (re_...)
 *   EMAIL_FROM_NOREPLY  - e.g. "Field <noreply@getfield.co>"
 *   EMAIL_FROM_SUPPORT  - e.g. "Field Support <support@getfield.co>"
 *
 * SETUP STEPS (one-time):
 *   1. resend.com → Domains → Add `getfield.co`
 *   2. Copy the SPF/DKIM/DMARC records they provide
 *   3. Paste those into Porkbun DNS for the domain
 *   4. Wait for verification (5-30 min)
 *   5. API Keys → Create one with sending access only
 *   6. Add the env vars above to Netlify (Site settings → Environment variables)
 */

import { Resend } from "resend";

let _client: Resend | null = null;
function getClient(): Resend {
  if (_client) return _client;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error(
      "RESEND_API_KEY is not set. Email sending is unavailable. " +
        "Set it in Netlify env vars or .env.local for local dev.",
    );
  }
  _client = new Resend(key);
  return _client;
}

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  /** Plain HTML — the caller is responsible for escaping any user content. */
  html: string;
  /** Optional plain-text fallback. Auto-derived from html if omitted. */
  text?: string;
  /** Defaults to EMAIL_FROM_NOREPLY. Pass "support" to use the support address. */
  from?: "noreply" | "support" | string;
  /** Optional reply-to override. */
  replyTo?: string;
};

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Send a single transactional email.
 *
 * Returns a Result object instead of throwing — callers decide whether to
 * surface the error to the user, retry, or log silently. Most transactional
 * flows should NOT block on email — fire-and-forget with logging is fine.
 *
 * In dev (no RESEND_API_KEY set), this returns a stub success and logs to
 * console instead of actually sending. Lets you build the UI without
 * needing real DNS/Resend setup locally.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  // Dev mode — no API key, log and pretend success
  if (!process.env.RESEND_API_KEY) {
    console.warn(
      "[email] RESEND_API_KEY not set, email NOT sent. Would send:",
      JSON.stringify(
        {
          to: input.to,
          subject: input.subject,
          from: input.from,
        },
        null,
        2,
      ),
    );
    return { ok: true, id: "dev-stub-" + Date.now() };
  }

  const fromEnv = (() => {
    const v = input.from ?? "noreply";
    if (v === "noreply") return process.env.EMAIL_FROM_NOREPLY;
    if (v === "support") return process.env.EMAIL_FROM_SUPPORT;
    return v; // raw "Display Name <addr@domain>" string
  })();

  if (!fromEnv) {
    return {
      ok: false,
      error:
        "EMAIL_FROM_NOREPLY or EMAIL_FROM_SUPPORT env var not set. " +
        "Configure in Netlify env vars.",
    };
  }

  try {
    const result = await getClient().emails.send({
      from: fromEnv,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
    });

    if (result.error) {
      return { ok: false, error: result.error.message };
    }
    if (!result.data?.id) {
      return { ok: false, error: "Resend returned no message ID" };
    }
    return { ok: true, id: result.data.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

/**
 * Strip HTML tags for a plain-text fallback. Tiny helper so callers don't
 * have to write both versions for simple emails.
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
