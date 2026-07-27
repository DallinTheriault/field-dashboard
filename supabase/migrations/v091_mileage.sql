-- v091: MILEAGE_SPEC — the mileage log. All additive, no backfill (there is
-- no historical mileage data), reversible.
--
-- Mileage is its OWN record type: it never writes purchases/expenses rows and
-- never enters job costing or the P&L net (standard mileage and actual vehicle
-- costs are alternative methods, never summed).

create table public.mileage_entries (
  id          bigint generated always as identity primary key,
  client_id   bigint not null,
  trip_date   date not null,
  job_id      bigint references public.jobs(id) on delete set null,
  destination text not null,
  purpose     text not null,
  miles       numeric not null check (miles >= 0),
  round_trip  boolean not null default true,
  vehicle     text,
  source      text not null check (source in ('manual','proposed')),
  -- The contemporaneity record: when the log was actually made. trip_date is
  -- editable (back-dating a forgotten trip is legitimate); this is not.
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_mileage_entries_client_date
  on public.mileage_entries (client_id, trip_date desc);
create index idx_mileage_entries_job
  on public.mileage_entries (job_id);

-- Structural duplicate guard for the PROPOSAL path (architect requirement):
-- a cleared browser or a new device must never be able to produce a second
-- proposed trip for the same job + day. Deliberate manual second trips to the
-- same job in one day stay possible — that's a real thing, and it's an
-- explicit user act rather than a repeated prompt.
create unique index mileage_proposed_job_day_uniq
  on public.mileage_entries (client_id, job_id, trip_date)
  where source = 'proposed' and job_id is not null;

alter table public.mileage_entries enable row level security;

create policy "mileage_entries_select" on public.mileage_entries
  for select using (client_id in (select public.current_user_client_ids()));
create policy "mileage_entries_insert" on public.mileage_entries
  for insert with check (public.user_can_write_client(client_id));
create policy "mileage_entries_update" on public.mileage_entries
  for update using (public.user_can_write_client(client_id))
  with check (public.user_can_write_client(client_id));
create policy "mileage_entries_delete" on public.mileage_entries
  for delete using (public.user_can_write_client(client_id));

-- created_at is immutable; updated_at maintained.
create or replace function public.mileage_entries_touch()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.created_at := old.created_at;   -- never editable, at any layer
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_mileage_entries_touch
  before update on public.mileage_entries
  for each row execute function public.mileage_entries_touch();

-- ---- per-year rates ---------------------------------------------------------
-- Rates change annually and are NEVER hardcoded: if a year has no row, the UI
-- shows miles only and a "rate not set" state. Keyed child table, matching the
-- house settings pattern (travel_zones / materials / service_catalog).
create table public.mileage_rates (
  client_id     bigint not null,
  year          int not null check (year between 2000 and 2100),
  rate_per_mile numeric not null check (rate_per_mile >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (client_id, year)
);

alter table public.mileage_rates enable row level security;

create policy "mileage_rates_select" on public.mileage_rates
  for select using (client_id in (select public.current_user_client_ids()));
create policy "mileage_rates_insert" on public.mileage_rates
  for insert with check (public.user_can_write_client(client_id));
create policy "mileage_rates_update" on public.mileage_rates
  for update using (public.user_can_write_client(client_id))
  with check (public.user_can_write_client(client_id));
create policy "mileage_rates_delete" on public.mileage_rates
  for delete using (public.user_can_write_client(client_id));

-- ---- settings + property distance cache -------------------------------------
alter table public.pricing_settings add column mileage_base_address text;
alter table public.properties add column miles_from_base numeric
  check (miles_from_base is null or miles_from_base >= 0);

-- =============================================================================
-- ROLLBACK (manual):
--   alter table public.properties drop column miles_from_base;
--   alter table public.pricing_settings drop column mileage_base_address;
--   drop table public.mileage_rates;
--   drop trigger trg_mileage_entries_touch on public.mileage_entries;
--   drop function public.mileage_entries_touch();
--   drop table public.mileage_entries;   -- cascades its indexes + policies
-- Nothing above touches existing rows; rollback fully restores pre-v091.
-- =============================================================================
