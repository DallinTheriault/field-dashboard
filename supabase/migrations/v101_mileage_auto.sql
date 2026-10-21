-- v101: automatic mileage. Additive except one relaxed constraint
-- (mileage_entries.miles may be empty while it can't be worked out).
--
-- One mileage system, for taxes only. It never touches estimates, invoices,
-- job costing or the P&L net.
--
--   mileage_bases          where trips start, with the date each takes effect
--   job_site_days          days on site entered by hand (a job completed with
--                          no hours logged; the catch-up screen)
--   jobs.site_days_done_at  "no more days to add" for a job with none
--   geocode_cache          every address looked up (Census, then an exact
--                          house-number match from OpenStreetMap), per tenant
--   route_cache            every driving distance worked out, per pair of points
--   mileage_rate_periods   IRS rate by the date it takes effect
--
-- Trips (mileage_entries) gain a kind:
--   auto     one loop per day on site: base, each job in start-time order,
--            back to base. Recalculated when hours, days, bases or addresses
--            change.
--   edited   an automatic trip someone changed. Never recalculated.
--   removed  an automatic trip someone deleted, kept so it isn't made again.
--   manual   added by hand (supply runs, work before Field). Never touched.
--
-- The old pieces stay in the database, unused: mileage_rates (per year),
-- pricing_settings.mileage_base_address, properties.miles_from_base.

create table public.mileage_bases (
  id             bigint generated always as identity primary key,
  client_id      bigint not null references public."Clients"(id) on delete cascade,
  address        text not null check (length(btrim(address)) > 0),
  effective_from date not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (client_id, effective_from)
);

create table public.job_site_days (
  client_id  bigint not null references public."Clients"(id) on delete cascade,
  job_id     bigint not null references public.jobs(id) on delete cascade,
  day        date not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (job_id, day)
);
create index idx_job_site_days_client_day on public.job_site_days (client_id, day);

alter table public.jobs add column site_days_done_at timestamptz;
comment on column public.jobs.site_days_done_at is
  'Owner said there are no (more) days on site to add for this job (mileage catch-up).';

create table public.geocode_cache (
  client_id       bigint not null references public."Clients"(id) on delete cascade,
  address_key     text not null,
  address         text not null,
  status          text not null check (status in ('ok', 'not_found')),
  lat             double precision,
  lon             double precision,
  matched_address text,
  source          text check (source in ('census', 'nominatim')),
  checked_at      timestamptz not null default now(),
  primary key (client_id, address_key),
  check (status <> 'ok' or (lat is not null and lon is not null and source is not null))
);

create table public.route_cache (
  client_id  bigint not null references public."Clients"(id) on delete cascade,
  from_point text not null,
  to_point   text not null,
  miles      numeric not null check (miles >= 0),
  source     text not null check (source in ('valhalla', 'osrm')),
  created_at timestamptz not null default now(),
  primary key (client_id, from_point, to_point)
);

create table public.mileage_rate_periods (
  client_id      bigint not null references public."Clients"(id) on delete cascade,
  effective_from date not null,
  rate_per_mile  numeric not null check (rate_per_mile >= 0 and rate_per_mile < 10),
  note           text,
  created_at     timestamptz not null default now(),
  primary key (client_id, effective_from)
);

alter table public.mileage_entries
  alter column miles drop not null,
  add column kind text not null default 'manual'
    constraint mileage_entries_kind_check check (kind in ('auto', 'edited', 'removed', 'manual')),
  add column base_id bigint references public.mileage_bases(id) on delete set null,
  add column start_address text,
  add column stops jsonb not null default '[]'::jsonb,
  add column miles_status text
    constraint mileage_entries_miles_status_check
      check (miles_status is null or miles_status in ('ok', 'pending', 'no_base', 'no_address', 'route_failed')),
  add column miles_note text,
  add column calculated_at timestamptz;

comment on column public.mileage_entries.kind is
  'auto (worked out from days on site) | edited (an auto trip someone changed; never recalculated) | removed (deleted auto trip, kept so it is not made again) | manual (added by hand).';
comment on column public.mileage_entries.stops is
  'The jobs visited, in order: [{job_id, property_id, address, label}]. Base to each stop and back.';

-- One day trip per date: the automatic loop, or what it became.
create unique index mileage_day_trip_uniq on public.mileage_entries (client_id, trip_date)
  where kind in ('auto', 'edited', 'removed');

-- ---- row-level security: read by the tenant, written by owners/managers ----
alter table public.mileage_bases enable row level security;
alter table public.job_site_days enable row level security;
alter table public.geocode_cache enable row level security;
alter table public.route_cache enable row level security;
alter table public.mileage_rate_periods enable row level security;

create policy mileage_bases_select on public.mileage_bases for select
  using (client_id in (select public.current_user_client_ids()));
create policy mileage_bases_insert on public.mileage_bases for insert
  with check (public.user_can_write_client(client_id));
create policy mileage_bases_update on public.mileage_bases for update
  using (public.user_can_write_client(client_id)) with check (public.user_can_write_client(client_id));
create policy mileage_bases_delete on public.mileage_bases for delete
  using (public.user_can_write_client(client_id));

create policy job_site_days_select on public.job_site_days for select
  using (client_id in (select public.current_user_client_ids()));
create policy job_site_days_insert on public.job_site_days for insert
  with check (public.user_can_write_client(client_id));
create policy job_site_days_delete on public.job_site_days for delete
  using (public.user_can_write_client(client_id));

create policy mileage_rate_periods_select on public.mileage_rate_periods for select
  using (client_id in (select public.current_user_client_ids()));
create policy mileage_rate_periods_insert on public.mileage_rate_periods for insert
  with check (public.user_can_write_client(client_id));
create policy mileage_rate_periods_update on public.mileage_rate_periods for update
  using (public.user_can_write_client(client_id)) with check (public.user_can_write_client(client_id));
create policy mileage_rate_periods_delete on public.mileage_rate_periods for delete
  using (public.user_can_write_client(client_id));

-- The caches are written by the server only.
create policy geocode_cache_select on public.geocode_cache for select
  using (client_id in (select public.current_user_client_ids()));
create policy route_cache_select on public.route_cache for select
  using (client_id in (select public.current_user_client_ids()));

revoke all on public.mileage_bases, public.job_site_days, public.geocode_cache,
  public.route_cache, public.mileage_rate_periods from anon;

create trigger trg_mileage_bases_updated_at before update on public.mileage_bases
  for each row execute function public.set_updated_at();

-- ---- the 2026 IRS business rates, for every tenant ---------------------------
-- 72.5 cents from Jan 1, 2026 (IR-2025-128); 76 cents from Jul 1, 2026
-- (IR-2026-29). https://www.irs.gov/tax-professionals/standard-mileage-rates
insert into public.mileage_rate_periods (client_id, effective_from, rate_per_mile, note)
select c.id, r.effective_from, r.rate, r.note
  from public."Clients" c
 cross join (values
   (date '2026-01-01', 0.725, 'IRS business rate, Jan 1 to Jun 30, 2026 (IR-2025-128)'),
   (date '2026-07-01', 0.76,  'IRS business rate from Jul 1, 2026 (IR-2026-29)')
 ) as r(effective_from, rate, note)
on conflict do nothing;
