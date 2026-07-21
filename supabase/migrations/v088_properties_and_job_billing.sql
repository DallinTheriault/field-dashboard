-- v088: CONTACTS_PROPERTIES_SPEC — properties table + job billing pointers.
-- Additive and reversible; no existing display data is mutated (jobs.name/
-- jobs.address stay inline, contacts.address untouched). Architect-approved
-- Q1-Q4 (2026-07-21).
--
-- Source-of-truth ruling (Q1): properties are seeded from jobs.address, NOT
-- contacts.address — the latter holds company names (e.g. "Vista Ventures
-- Realty LLC") while jobs.address is the displayed truth every read path uses.

-- ---- properties -----------------------------------------------------------

create table public.properties (
  id          bigint generated always as identity primary key,
  client_id   bigint not null,
  contact_id  bigint not null references public.contacts(id),
  address     text   not null,
  unit        text,
  label       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- FK covering indexes (Phase 3 hygiene lesson) + RLS scoping index.
create index idx_properties_client_id on public.properties (client_id);
create index idx_properties_contact_id on public.properties (contact_id);

alter table public.properties enable row level security;

-- Reads: any member of the tenant. Writes: owner/manager (user_can_write_client).
create policy "properties_select" on public.properties
  for select using (client_id in (select public.current_user_client_ids()));
create policy "properties_insert" on public.properties
  for insert with check (public.user_can_write_client(client_id));
create policy "properties_update" on public.properties
  for update using (public.user_can_write_client(client_id))
  with check (public.user_can_write_client(client_id));
create policy "properties_delete" on public.properties
  for delete using (public.user_can_write_client(client_id));

create or replace function public.set_properties_updated_at()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_properties_updated_at
  before update on public.properties
  for each row execute function public.set_properties_updated_at();

-- ---- jobs billing pointers -------------------------------------------------

alter table public.jobs
  add column property_id        bigint references public.properties(id),
  add column bill_to_contact_id bigint references public.contacts(id);

create index idx_jobs_property_id on public.jobs (property_id);
create index idx_jobs_bill_to_contact_id on public.jobs (bill_to_contact_id);

-- ---- seed + backfill -------------------------------------------------------
-- One property per distinct (contact_id, address) among jobs that HAVE a
-- contact. select distinct means no duplicate rows; unit stays NULL (we do
-- not over-parse existing free-text addresses per §6.1).

insert into public.properties (client_id, contact_id, address)
select distinct j.client_id, j.contact_id, trim(j.address)
from public.jobs j
where j.contact_id is not null
  and j.address is not null
  and trim(j.address) <> '';

-- Link each job to its (contact_id, address) property. Match on the trimmed
-- address against the unit-less seeded rows.
update public.jobs j
set property_id = p.id
from public.properties p
where j.contact_id = p.contact_id
  and p.unit is null
  and trim(j.address) = p.address
  and j.property_id is null
  and j.contact_id is not null
  and j.address is not null
  and trim(j.address) <> '';

-- bill_to_contact_id intentionally left NULL everywhere (preserves current
-- billing: invoices resolve customer_name from the property's contact / job).

-- =============================================================================
-- ROLLBACK (manual):
--   drop trigger trg_properties_updated_at on public.properties;
--   drop function public.set_properties_updated_at();
--   alter table public.jobs drop column property_id;
--   alter table public.jobs drop column bill_to_contact_id;
--   drop table public.properties;   -- cascades its policies + indexes
-- Nothing above touches jobs.name / jobs.address / contacts.address, so a
-- rollback fully restores the pre-v088 state with zero display impact.
-- =============================================================================
