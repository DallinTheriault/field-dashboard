import { getTenantContext } from "@/lib/supabase/request-cache";

export type TenantFeatureFlags = {
  voice: boolean;
  sms: boolean;
  calendar: boolean;
  billing: boolean;
  estimator: boolean;
  /** AI receipt scanning (platform Anthropic key). Gates extraction only —
   * manual expense entry always works. */
  receiptAi: boolean;
};

/**
 * Fetch feature flags for the signed-in user's tenant. Used by feature-gated
 * page handlers to decide whether to render the feature UI or a disabled panel.
 *
 * Returns sensible defaults if no client found (shouldn't happen for signed-in
 * users in practice, but the layout already handles that case).
 */
export async function getTenantFeatureFlags(): Promise<TenantFeatureFlags> {
  // Rides the per-request tenant-context fetch — no dedicated round-trip.
  const c = await getTenantContext();
  return {
    voice: c?.feature_voice_enabled ?? true,
    sms: c?.feature_sms_enabled ?? true,
    calendar: c?.feature_calendar_enabled ?? false,
    billing: c?.feature_billing_enabled ?? true,
    estimator: c?.feature_estimator_enabled ?? false,
    receiptAi: c?.feature_receipt_ai_enabled ?? false,
  };
}
