/**
 * Phone number normalization. SMS comes in from Twilio in E.164 already
 * (e.g. "+18015551234"), but defensive normalization here so dashboard-typed
 * phones, contact upserts from VAPI, and webhook params all converge on the
 * same canonical format.
 *
 * Rules:
 *   - Strip everything but digits and the leading +
 *   - If 11 digits starting with 1, prefix with + → "+1XXXXXXXXXX"
 *   - If 10 digits, prefix with +1
 *   - Otherwise return null (callers should treat as invalid)
 */
export function toE164US(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;

  // Already E.164-shaped?
  if (/^\+1\d{10}$/.test(trimmed)) return trimmed;

  // Strip non-digits
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;

  return null;
}

/**
 * Display formatting. "+18015551234" → "(801) 555-1234".
 * Falls back to the input unchanged for non-US/E164 strings.
 */
export function fmtPhoneDisplay(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  if (!m) return e164;
  return `(${m[1]}) ${m[2]}-${m[3]}`;
}
