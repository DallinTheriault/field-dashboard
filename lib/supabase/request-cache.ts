import { cache } from "react";
import { createClient } from "./server";

/**
 * Per-request memoization for the auth + tenant lookups that layout, page,
 * and permission helpers each repeat on EVERY navigation. Before this,
 * one click could fire 3-4 identical Supabase Auth round-trips plus
 * duplicate client_users/Clients queries, all serialized — a large chunk
 * of the multi-second page switches.
 *
 * React cache() dedupes within a single server render; nothing persists
 * across requests, so auth freshness is unchanged.
 */

export type AuthUser = { id: string; email: string | null };

/**
 * The signed-in user, verified WITHOUT an auth round-trip: getClaims()
 * checks the JWT signature locally against the project's ES256 JWKS
 * (module-global cache in supabase-js, 10-min TTL — one fetch per warm
 * function instance, not per request). Middleware still runs a full
 * network getUser() on every page request, so server-side revocation
 * checks are unchanged; this only removes the render's duplicate call.
 * On symmetric-signed tokens supabase-js falls back to a network
 * getUser() internally — same behavior as before, just not cheaper.
 */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return { id: claims.sub, email: (claims.email as string | undefined) ?? null };
});

export type TenantContext = {
  id: number;
  business_name: string | null;
  business_short_name: string | null;
  is_active: boolean | null;
  brand_logo_url: string | null;
  brand_primary_color: string | null;
  timezone: string | null;
  feature_sms_enabled: boolean | null;
  feature_voice_enabled: boolean | null;
  feature_calendar_enabled: boolean | null;
  feature_billing_enabled: boolean | null;
  feature_estimator_enabled: boolean | null;
  feature_receipt_ai_enabled: boolean | null;
};

/**
 * ONE Clients round-trip per render for everything tenant-shaped: branding
 * (layout), timezone (lib/dates), and feature flags (lib/features/flags)
 * all read from this. Before, each helper ran its own single-column select
 * — Clients was queried 3-4 separate times per navigation.
 */
export const getTenantContext = cache(async (): Promise<TenantContext | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("Clients")
    .select(
      "id, business_name, business_short_name, is_active, brand_logo_url, brand_primary_color, timezone, feature_sms_enabled, feature_voice_enabled, feature_calendar_enabled, feature_billing_enabled, feature_estimator_enabled, feature_receipt_ai_enabled",
    )
    .order("id")
    .limit(1);
  return (data?.[0] as TenantContext | undefined) ?? null;
});
