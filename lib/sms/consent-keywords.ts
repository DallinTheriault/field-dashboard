/**
 * A2P 10DLC compliant keyword detection for inbound SMS.
 *
 * Twilio enforces certain "magic" keywords at the carrier level — STOP,
 * UNSUBSCRIBE, etc. always opt the user out and Twilio will block our
 * outbound messages until they reply START. We layer our OWN handling on
 * top so:
 *   1. We update sms_threads.consent_status to reflect carrier state
 *   2. We can refuse outbound SMS in the dashboard (defense in depth)
 *   3. We surface "stopped" status visibly in the UI
 *   4. HELP returns a useful response, not just our default silence
 *
 * Keywords list per CTIA SMS Compliance Guidelines & Twilio docs:
 *   https://www.twilio.com/docs/messaging/compliance/handling-incoming-sms
 *
 * Detection rules:
 *   - Case-insensitive
 *   - Whole-message match only (a stray "STOP" inside a longer message
 *     is NOT treated as opt-out — we only act when STOP is essentially
 *     the entire body, allowing for surrounding whitespace/punctuation)
 *   - This matches Twilio's own carrier-level matching behavior
 */

export type KeywordKind = "stop" | "start" | "help" | null;

/**
 * Standard opt-out keywords. Any one of these as the full message body
 * triggers consent_status='stopped'.
 */
const STOP_KEYWORDS = [
  "STOP",
  "STOPALL",
  "UNSUBSCRIBE",
  "CANCEL",
  "END",
  "QUIT",
];

/**
 * Standard opt-back-in keywords.
 */
const START_KEYWORDS = ["START", "YES", "UNSTOP"];

/**
 * Standard help keywords.
 */
const HELP_KEYWORDS = ["HELP", "INFO"];

/**
 * Normalize body for keyword matching. Strip whitespace and trailing
 * punctuation, uppercase. We don't strip leading punctuation because
 * that's not realistic input.
 */
function normalize(body: string): string {
  return body.trim().replace(/[.!?,]+$/g, "").toUpperCase();
}

/**
 * Detect compliance keyword in an inbound message body.
 * Returns null if this is a normal message with no keyword intent.
 */
export function detectKeyword(body: string): KeywordKind {
  const n = normalize(body);
  if (!n) return null;
  if (STOP_KEYWORDS.includes(n)) return "stop";
  if (START_KEYWORDS.includes(n)) return "start";
  if (HELP_KEYWORDS.includes(n)) return "help";
  return null;
}

/**
 * Build the auto-reply body for STOP/HELP keywords.
 *
 * For STOP: a confirmation that's clearer than Twilio's default and
 * tells the user how to opt back in.
 *
 * For HELP: surface the business name and a way to reach a human, since
 * the recipient may have texted in confusion.
 *
 * Returns null for non-keyword messages and for START (Twilio handles
 * the carrier-level resume; our auto-reply would be redundant and
 * potentially count as a marketing touch).
 */
export function autoReplyBody(
  kind: KeywordKind,
  businessName: string,
): string | null {
  if (kind === "stop") {
    return `${businessName}: You are unsubscribed and will not receive further messages. Reply START to resume.`;
  }
  if (kind === "help") {
    return `${businessName}: For help, please call us back or reply with your question. Reply STOP to opt out.`;
  }
  return null;
}
