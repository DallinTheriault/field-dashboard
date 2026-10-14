-- Local test data. Two tenants so isolation can be checked:
--   8  Cascade HVAC Services LLC: same ids and pricing as prod's test tenant
--   9  Other Tenant Co: a second tenant whose rows tenant 8 must never see
-- Users are created afterwards by seed-users.mjs through the Auth API; the
-- on_auth_user_created_link_to_client trigger links each owner by owner_email.

INSERT INTO public."Clients" (id, business_name, business_short_name, owner_email, timezone, is_test,
  feature_estimator_enabled, feature_billing_enabled)
VALUES
  (8, 'Cascade HVAC Services LLC', 'Cascade HVAC', 'owner@cascade.test', 'America/Denver', true, true, false),
  (9, 'Other Tenant Co', 'Other Tenant', 'owner@other.test', 'America/Denver', true, true, false);
DO $$ BEGIN PERFORM setval(pg_get_serial_sequence('public."Clients"', 'id'), 9); END $$;

INSERT INTO public.billing_entities (client_id, name, invoice_prefix, is_default)
VALUES (8, 'Cascade HVAC Services LLC', 'CAS', true),
       (9, 'Other Tenant Co', 'OTH', true);

INSERT INTO public.pricing_settings (client_id, desired_annual_owner_pay, hours_worked_per_week,
  utilization_pct, margin_pct, material_markup_pct, minimum_job_charge, rounding_increment)
VALUES (8, 60000, 20, 0.9, 0.4, 0, 150, 5),
       (9, 80000, 40, 0.7, 0.35, 0.1, 200, 10);

INSERT INTO public.service_catalog (client_id, name, type, unit, labor_hours_per_unit, flat_labor_hours)
VALUES (8, 'Walls - 2 coats', 'MEASURED', 'sqft', 0.01, NULL),
       (8, 'Toilet swap', 'TASK', NULL, NULL, 1.5),
       (9, 'Other tenant service', 'TASK', NULL, NULL, 2);

INSERT INTO public.materials (client_id, name, unit, unit_cost, coverage_sqft_per_unit)
VALUES (8, 'Wall paint', 'gal', 38.50, 350),
       (9, 'Other tenant material', 'each', 10, NULL);

WITH c AS (
  INSERT INTO public.contacts (client_id, name, phone, email)
  VALUES (8, 'Pat Rivera', '+15555550108', 'pat@example.test'),
         (9, 'Other Customer', '+15555550109', 'other@example.test')
  RETURNING id, client_id
), p AS (
  INSERT INTO public.properties (client_id, contact_id, address, unit)
  SELECT client_id, id, CASE client_id WHEN 8 THEN '100 Test St' ELSE '900 Elsewhere Ave' END, NULL FROM c
  RETURNING id, client_id, contact_id, address
)
INSERT INTO public.jobs (client_id, contact_id, property_id, name, address, service, status, source)
SELECT client_id, contact_id, id, CASE client_id WHEN 8 THEN 'Pat Rivera' ELSE 'Other Customer' END,
       address, 'Repairs', 'scheduled', 'manual'
FROM p;
