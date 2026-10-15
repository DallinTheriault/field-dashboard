-- Step 3 setup at v097: a Sharpline stand-in shaped like prod before v098
-- (no hourly rate yet), and a markup on Cascade so the percent display and
-- "other tenants untouched" can be checked.
insert into public."Clients" (id, business_name, business_short_name, owner_email, timezone, is_test,
  feature_estimator_enabled, feature_billing_enabled)
values (1, 'Sharpline Painting Co.', 'Sharpline', 'owner@sharpline.test', 'America/Denver', true, true, false);
insert into public.pricing_settings (client_id, desired_annual_owner_pay, hours_worked_per_week,
  utilization_pct, margin_pct, material_markup_pct, minimum_job_charge, rounding_increment)
values (1, 60000, 20, 0.85, 0.4, 0.2, 100, 0);
update public.pricing_settings set material_markup_pct = 0.15 where client_id = 8;
