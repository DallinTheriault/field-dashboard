-- v089: JOB_NUMBERING_SPEC Part B — immutable job numbers at the DB layer.
-- Architect ruling (2026-07-24): a BEFORE INSERT trigger numbers EVERY new
-- job (app createJob + inbound Aria/n8n phone-call leads) atomically. The
-- server action no longer owns numbering. Existing 28 jobs stay NULL — the
-- trigger fires on INSERT only, no backfill.

alter table public.jobs add column job_number text;

-- Concurrency guard + uniqueness. Partial so the 28 NULL rows don't collide.
create unique index jobs_client_job_number_uniq
  on public.jobs (client_id, job_number)
  where job_number is not null;

-- ---- 5.2 slug rule, ported to plpgsql (unit-tested directly) ----------------
-- Derive from a name: strip a trailing legal suffix, take the last
-- whitespace-delimited token, keep alphanumerics, preserve casing as typed.
-- Empty / numeric-only / nothing-usable → 'Job'.
create or replace function public.job_number_slug(p_name text)
returns text
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  v text;
  v_token text;
begin
  v := btrim(coalesce(p_name, ''));              -- trailing/leading whitespace
  if v = '' then return 'Job'; end if;
  -- strip ONE trailing legal suffix (case-insensitive); (^|sep) so a name that
  -- is ONLY a suffix strips to empty and falls back to 'Job'.
  v := regexp_replace(
         v,
         '(^|[[:space:],]+)(LLC\.?|L\.L\.C\.?|INC\.?|CO\.?|CORP\.?|LTD\.?)$',
         '',
         'i');
  v := btrim(v);
  if v = '' then return 'Job'; end if;
  -- last whitespace-delimited token (greedy up to the final whitespace)
  v_token := regexp_replace(v, '^.*\s', '');
  -- alphanumerics only
  v_token := regexp_replace(v_token, '[^A-Za-z0-9]', '', 'g');
  if v_token = '' or v_token ~ '^[0-9]+$' then
    return 'Job';
  end if;
  return v_token;
end;
$$;

-- ---- BEFORE INSERT trigger --------------------------------------------------
-- Fires after auto_link_contact_on_jobs (alphabetical: 's' > 'a'), so
-- NEW.contact_id is resolved by then. Slug from the contact's name, else the
-- job's own name. Period MM/YY from created_at in the tenant timezone.
-- Sequence keyed on (client_id, slug, MMYY) — two same-surname contacts share
-- it, so the generated string is always tenant-unique.
create or replace function public.set_job_number()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_name   text;
  v_slug   text;
  v_tz     text;
  v_mmyy   text;
  v_prefix text;
  v_next   int;
begin
  if NEW.job_number is not null then
    return NEW;                                  -- never overwrite (immutable)
  end if;

  if NEW.contact_id is not null then
    select name into v_name from public.contacts where id = NEW.contact_id;
  end if;
  v_slug := public.job_number_slug(coalesce(v_name, NEW.name));

  select timezone into v_tz from public."Clients" where id = NEW.client_id;
  v_tz := coalesce(v_tz, 'America/Denver');
  v_mmyy := to_char((coalesce(NEW.created_at, now()) at time zone v_tz), 'MMYY');

  v_prefix := v_slug || '-' || v_mmyy;

  -- serialize concurrent inserts for the same (client, slug, MMYY); the unique
  -- index is the ultimate backstop.
  perform pg_advisory_xact_lock(
    hashtextextended(NEW.client_id::text || ':' || v_prefix, 0));

  select coalesce(
           max((substring(job_number from char_length(v_prefix) + 1))::int),
           0) + 1
    into v_next
  from public.jobs
  where client_id = NEW.client_id
    and job_number like v_prefix || '%'
    and substring(job_number from char_length(v_prefix) + 1) ~ '^[0-9]+$';

  NEW.job_number := v_prefix || lpad(v_next::text, 2, '0');  -- grows to 3+ past 99
  return NEW;
end;
$$;

create trigger set_job_number
  before insert on public.jobs
  for each row execute function public.set_job_number();

-- =============================================================================
-- ROLLBACK (manual):
--   drop trigger set_job_number on public.jobs;
--   drop function public.set_job_number();
--   drop function public.job_number_slug(text);
--   drop index public.jobs_client_job_number_uniq;
--   alter table public.jobs drop column job_number;
-- Nothing above writes to existing rows; a rollback fully restores pre-v089.
-- =============================================================================
