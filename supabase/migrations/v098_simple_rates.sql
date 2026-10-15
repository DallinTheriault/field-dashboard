-- v098: simple pricing (billing redesign, step 3). Additive.
--
-- The settings screen now asks for four things: a general and a skilled
-- hourly rate, a minimum job charge and a material markup. General is the
-- existing default_hourly_rate ("Labor, hourly"); skilled is new ("Skilled
-- labor, hourly"). The calculator's columns (owner pay, hours, utilization,
-- margin, rounding, overhead_items) stay as they are: the old estimate
-- builder and saved estimates still price from them.
--
-- Each price-book row bills at one of the two rates. Its job-line price is
-- its own unit_price when set, else its typical hours × that rate, worked
-- out when a line is added (lib/estimator/price-book.ts). Job lines copy the
-- price, so changing a rate never changes a line already on a job.

alter table public.pricing_settings
  add column skilled_hourly_rate numeric
    constraint pricing_settings_skilled_hourly_rate_check
      check (skilled_hourly_rate is null or skilled_hourly_rate >= 0);

comment on column public.pricing_settings.default_hourly_rate is
  'General hourly rate: "Labor, hourly" on job lines and the rate for general price-book rows. Null = not set (lines need a price).';
comment on column public.pricing_settings.skilled_hourly_rate is
  'Skilled hourly rate: "Skilled labor, hourly" on job lines and the rate for skilled price-book rows. Null = not set.';

alter table public.service_catalog
  add column rate_type text not null default 'general'
    constraint service_catalog_rate_type_check check (rate_type in ('general', 'skilled'));

comment on column public.service_catalog.rate_type is
  'Which hourly rate prices this row on job lines when it has no unit_price: general or skilled.';

-- Sharpline's rates, as given by the owner: general $95/hr, skilled $125/hr,
-- minimum job charge $150, materials at cost (0% markup).
update public.pricing_settings ps
   set default_hourly_rate = 95,
       skilled_hourly_rate = 125,
       minimum_job_charge = 150,
       material_markup_pct = 0
  from public."Clients" c
 where ps.client_id = c.id
   and c.id = 1
   and c.business_name = 'Sharpline Painting Co.';
