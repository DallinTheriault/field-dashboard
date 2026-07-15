-- v0.8.5 — feature flags are platform grants, not tenant self-serve
--
-- Architect §8 correction (2026-07-15): receipt AI consumes the
-- PLATFORM's Anthropic key, so the entitlement is admin-granted only.
-- Tenant owners can UPDATE their Clients row (clients_update_own), and
-- trg_clients_protect_system_fields is what stops them touching
-- platform-only columns. It guarded sms/voice/calendar/billing flags
-- but NOT feature_estimator_enabled (pre-existing gap, same class) and
-- not the new feature_receipt_ai_enabled. This adds both guards.
-- Service role and platform admins bypass (unchanged), so the admin
-- console PATCH route keeps working.
--
-- Rollback: recreate the function without the two added IF blocks.

CREATE OR REPLACE FUNCTION public.trg_clients_protect_system_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Service role bypass: auth.uid() returns NULL
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Platform admin bypass
  IF public.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  -- Infra / integration config (system-breaking)
  IF NEW.twilio_number              IS DISTINCT FROM OLD.twilio_number              THEN RAISE EXCEPTION 'twilio_number is platform-admin only'; END IF;
  IF NEW.vapi_assistant_id          IS DISTINCT FROM OLD.vapi_assistant_id          THEN RAISE EXCEPTION 'vapi_assistant_id is platform-admin only'; END IF;
  IF NEW.vapi_voice_id              IS DISTINCT FROM OLD.vapi_voice_id              THEN RAISE EXCEPTION 'vapi_voice_id is platform-admin only'; END IF;
  IF NEW.system_prompt              IS DISTINCT FROM OLD.system_prompt              THEN RAISE EXCEPTION 'system_prompt is platform-admin only'; END IF;
  IF NEW.calendar_id                IS DISTINCT FROM OLD.calendar_id                THEN RAISE EXCEPTION 'calendar_id is platform-admin only'; END IF;
  IF NEW.stripe_connect_account_id  IS DISTINCT FROM OLD.stripe_connect_account_id  THEN RAISE EXCEPTION 'stripe_connect_account_id is platform-admin only'; END IF;
  IF NEW.intake_mode                IS DISTINCT FROM OLD.intake_mode                THEN RAISE EXCEPTION 'intake_mode is platform-admin only'; END IF;
  IF NEW.is_test                    IS DISTINCT FROM OLD.is_test                    THEN RAISE EXCEPTION 'is_test is platform-admin only'; END IF;
  IF NEW.is_active                  IS DISTINCT FROM OLD.is_active                  THEN RAISE EXCEPTION 'is_active is platform-admin only'; END IF;
  IF NEW.feature_sms_enabled        IS DISTINCT FROM OLD.feature_sms_enabled        THEN RAISE EXCEPTION 'feature_sms_enabled is platform-admin only'; END IF;
  IF NEW.feature_voice_enabled      IS DISTINCT FROM OLD.feature_voice_enabled      THEN RAISE EXCEPTION 'feature_voice_enabled is platform-admin only'; END IF;
  IF NEW.feature_calendar_enabled   IS DISTINCT FROM OLD.feature_calendar_enabled   THEN RAISE EXCEPTION 'feature_calendar_enabled is platform-admin only'; END IF;
  IF NEW.feature_billing_enabled    IS DISTINCT FROM OLD.feature_billing_enabled    THEN RAISE EXCEPTION 'feature_billing_enabled is platform-admin only'; END IF;
  IF NEW.feature_estimator_enabled  IS DISTINCT FROM OLD.feature_estimator_enabled  THEN RAISE EXCEPTION 'feature_estimator_enabled is platform-admin only'; END IF;
  IF NEW.feature_receipt_ai_enabled IS DISTINCT FROM OLD.feature_receipt_ai_enabled THEN RAISE EXCEPTION 'feature_receipt_ai_enabled is platform-admin only'; END IF;
  IF NEW.webhook_secret             IS DISTINCT FROM OLD.webhook_secret             THEN RAISE EXCEPTION 'webhook_secret is platform-admin only'; END IF;

  -- Identity / billing linkage
  IF NEW.owner_email                IS DISTINCT FROM OLD.owner_email                THEN RAISE EXCEPTION 'owner_email is platform-admin only'; END IF;

  -- Prompt content (changes assistant behavior / what it says aloud)
  IF NEW.business_name              IS DISTINCT FROM OLD.business_name              THEN RAISE EXCEPTION 'business_name change requires platform admin (prompt content)'; END IF;
  IF NEW.business_short_name        IS DISTINCT FROM OLD.business_short_name        THEN RAISE EXCEPTION 'business_short_name change requires platform admin (prompt content)'; END IF;
  IF NEW.business_phone             IS DISTINCT FROM OLD.business_phone             THEN RAISE EXCEPTION 'business_phone change requires platform admin (prompt content)'; END IF;
  IF NEW.business_website           IS DISTINCT FROM OLD.business_website           THEN RAISE EXCEPTION 'business_website change requires platform admin (prompt content)'; END IF;
  IF NEW.business_hours             IS DISTINCT FROM OLD.business_hours             THEN RAISE EXCEPTION 'business_hours change requires platform admin (prompt content)'; END IF;
  IF NEW.service_type               IS DISTINCT FROM OLD.service_type               THEN RAISE EXCEPTION 'service_type change requires platform admin (prompt content)'; END IF;
  IF NEW.primary_service            IS DISTINCT FROM OLD.primary_service            THEN RAISE EXCEPTION 'primary_service change requires platform admin (prompt content)'; END IF;
  IF NEW.service_area               IS DISTINCT FROM OLD.service_area               THEN RAISE EXCEPTION 'service_area change requires platform admin (prompt content)'; END IF;
  IF NEW.service_constraints        IS DISTINCT FROM OLD.service_constraints        THEN RAISE EXCEPTION 'service_constraints change requires platform admin (prompt content)'; END IF;
  IF NEW.scope_values               IS DISTINCT FROM OLD.scope_values               THEN RAISE EXCEPTION 'scope_values change requires platform admin (prompt content)'; END IF;
  IF NEW.pricing_block              IS DISTINCT FROM OLD.pricing_block              THEN RAISE EXCEPTION 'pricing_block change requires platform admin (prompt content)'; END IF;

  RETURN NEW;
END;
$function$;
