-- v092 — lock down four SECURITY DEFINER RPCs that PUBLIC (and so anon) could call.
--
-- All four run as their owner, and EXECUTE was granted to PUBLIC, which every
-- role inherits — so the public anon key could call them through PostgREST.
-- rotate_stripe_webhook_secret let anyone replace the Stripe webhook signing
-- secret that verify_stripe_signature checks.
--
-- Revoke from everyone, then grant back only to the role a real caller uses:
--   list_team_members            app, as the logged-in user  → authenticated
--   lookup_client_by_secret      n8n WF1 (service-role key)   → service_role
--   verify_stripe_signature      n8n WF-Billing (service-role key) → service_role
--   rotate_stripe_webhook_secret no API caller; run from the SQL editor as the
--                                owner (postgres), which keeps EXECUTE → none
--
-- n8n's role is inferred from the RPCs those workflows already call that are
-- service_role-only (upsert_contact in WF1; upsert_subscription_from_stripe and
-- resolve_client_id_by_email in WF-Billing).

REVOKE EXECUTE ON FUNCTION public.rotate_stripe_webhook_secret(text)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.lookup_client_by_secret(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lookup_client_by_secret(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.verify_stripe_signature(text, text, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_stripe_signature(text, text, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.list_team_members(bigint)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_team_members(bigint) TO authenticated;
