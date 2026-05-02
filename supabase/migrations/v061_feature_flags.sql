-- v0.6.1 — Feature flags per tenant
--
-- Status: ALREADY APPLIED to production via Supabase MCP.
-- Adds boolean columns on Clients for admin-toggle gating of major features.

ALTER TABLE public."Clients"
  ADD COLUMN IF NOT EXISTS feature_sms_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS feature_voice_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS feature_calendar_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS feature_billing_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public."Clients".feature_sms_enabled IS 'Show SMS pages and route SMS through. False = "Disabled by admin" panel.';
COMMENT ON COLUMN public."Clients".feature_voice_enabled IS 'Show Calls pages and route VAPI calls through.';
COMMENT ON COLUMN public."Clients".feature_calendar_enabled IS 'Show calendar integration. Defaults false until v0.7+ when implemented.';
COMMENT ON COLUMN public."Clients".feature_billing_enabled IS 'Show Billing page. Hide for tenants on custom contracts.';
