import { createClient } from "@/lib/supabase/server";

export type TenantFeatureFlags = {
  voice: boolean;
  sms: boolean;
  calendar: boolean;
  billing: boolean;
  estimator: boolean;
};

/**
 * Fetch feature flags for the signed-in user's tenant. Used by feature-gated
 * page handlers to decide whether to render the feature UI or a disabled panel.
 *
 * Returns sensible defaults if no client found (shouldn't happen for signed-in
 * users in practice, but the layout already handles that case).
 */
export async function getTenantFeatureFlags(): Promise<TenantFeatureFlags> {
  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("Clients")
    .select(
      "feature_sms_enabled, feature_voice_enabled, feature_calendar_enabled, feature_billing_enabled, feature_estimator_enabled",
    )
    .limit(1);
  const c = clients?.[0];
  return {
    voice: c?.feature_voice_enabled ?? true,
    sms: c?.feature_sms_enabled ?? true,
    calendar: c?.feature_calendar_enabled ?? false,
    billing: c?.feature_billing_enabled ?? true,
    estimator: c?.feature_estimator_enabled ?? false,
  };
}
