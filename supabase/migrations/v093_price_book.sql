-- v093: the price book (billing redesign, slice 1). Additive; no existing row
-- changes, and every existing row already satisfies the new checks.
--
-- The price book is service_catalog. Existing MEASURED (hours per sqft / lnft /
-- each) and TASK (flat hours) rows keep their shape and keep working in the
-- estimate builder; they can now also carry a unit_price for job lines.
-- New price-book rows are PRICED: a unit (each, hour, sqft, lnft), a unit_price
-- (null shows as "needs a price") and optional typical_hours, which only
-- suggest a price and feed Insights. A PRICED row's hours never price
-- anything, so the estimate builder skips PRICED rows.
--
-- Job lines (v094) copy unit_price when picked, so editing a price here never
-- changes an existing job.

alter table public.service_catalog
  add column unit_price numeric
    constraint service_catalog_unit_price_check check (unit_price is null or unit_price >= 0),
  add column typical_hours numeric
    constraint service_catalog_typical_hours_check check (typical_hours is null or typical_hours > 0),
  add column materials_note text;

alter table public.service_catalog drop constraint service_catalog_type_check;
alter table public.service_catalog add constraint service_catalog_type_check
  check (type in ('MEASURED', 'TASK', 'PRICED'));

alter table public.service_catalog drop constraint service_catalog_unit_check;
alter table public.service_catalog add constraint service_catalog_unit_check
  check (unit in ('sqft', 'lnft', 'each', 'hour'));

-- Hours live in one column per type: labor_hours_per_unit (MEASURED),
-- flat_labor_hours (TASK), typical_hours (PRICED). "hour" is a PRICED-only
-- unit; the builder has no hours-per-hour line.
alter table public.service_catalog drop constraint service_catalog_type_shape;
alter table public.service_catalog add constraint service_catalog_type_shape check (
  (type = 'MEASURED' and unit is not null and unit <> 'hour'
     and labor_hours_per_unit is not null and flat_labor_hours is null and typical_hours is null)
  or (type = 'TASK' and unit is null
     and labor_hours_per_unit is null and flat_labor_hours is not null and typical_hours is null)
  or (type = 'PRICED' and unit is not null
     and labor_hours_per_unit is null and flat_labor_hours is null)
);

-- Target for v094's composite foreign key, so a job line can only point at a
-- price-book row in its own tenant.
alter table public.service_catalog
  add constraint service_catalog_client_id_id_key unique (client_id, id);

-- Price of the built-in "Labor, hourly" entry. Null: the price book suggests
-- the effective sell rate instead.
alter table public.pricing_settings
  add column default_hourly_rate numeric
    constraint pricing_settings_default_hourly_rate_check
      check (default_hourly_rate is null or default_hourly_rate >= 0);
