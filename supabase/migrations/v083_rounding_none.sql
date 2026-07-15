-- v0.8.3 — "Round customer total" becomes a real choice: none / $1 / $5
--
-- HOTFIX_ROUNDING_SPEC. rounding_increment was already a per-tenant
-- setting (pricing_settings, default 5) frozen per-estimate as
-- resolved_rounding_increment — the Snapshot Rule already guarantees
-- saved estimates never move when the setting changes. This migration
-- only legalizes 0 = "none" (exact-to-the-cent totals, what invoices
-- need). Both existing tenants hold 5, so no backfill is required and
-- current behavior is preserved everywhere until a tenant opts out.
--
-- Rollback (valid while no tenant has 0; else set those to 5 first):
--   ALTER TABLE public.pricing_settings
--     DROP CONSTRAINT pricing_settings_rounding_increment_check;
--   ALTER TABLE public.pricing_settings
--     ADD CONSTRAINT pricing_settings_rounding_increment_check
--     CHECK (rounding_increment > 0);

ALTER TABLE public.pricing_settings
  DROP CONSTRAINT IF EXISTS pricing_settings_rounding_increment_check;
ALTER TABLE public.pricing_settings
  ADD CONSTRAINT pricing_settings_rounding_increment_check
  CHECK (rounding_increment >= 0);
