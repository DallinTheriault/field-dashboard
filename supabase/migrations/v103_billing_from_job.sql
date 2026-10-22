-- v103: billing from the job. Logged hours become billable (claimed by a
-- draft, final once it goes out), expenses on a sent invoice are final in the
-- database too, and jobs get plain per-business numbers ("Job 14").
--
--   1. Job numbers: a counter per business replaces Name-MMYYNN. Every job is
--      renumbered in the order it was created, archived ones included.
--   2. Hours: time_entries.invoice_id (the invoice that billed or covered
--      them) and covered_at (handled without a line of their own). Hours on a
--      job that already had an invoice go out, or was marked paid outside
--      Field, count as covered from now on, so none of them reopens a job.
--   3. Claims: an invoice row lists the hours it bills in time_entry_ids. The
--      draft RPCs claim and release them with the job lines and extras; a
--      draft follows its hours (deleted or changed hours update the labor
--      line); sending checks them and covers every hour left unticked;
--      voiding releases them.
--   4. Hours are final once their invoice goes out, like job lines.
--   5. Expenses on an invoice that went out can't be deleted or have their
--      money changed (the app already refused; now the database does).
--   6. "Ready to invoice" counts hours not yet billed on a completed job.
--
-- No invoice row is changed. Drafts made before this carry no hours.

-- 1. Job numbers ---------------------------------------------------------------------

create table public.job_counters (
  client_id    bigint primary key references public."Clients"(id) on delete cascade,
  last_job_seq integer not null default 0 check (last_job_seq >= 0)
);
alter table public.job_counters enable row level security; -- the trigger writes it; no one else
revoke all on public.job_counters from anon, authenticated;

alter table public.jobs add column job_seq integer check (job_seq > 0);

-- Renumber without touching anything else on the job (updated_at, phones).
alter table public.jobs disable trigger user;
with n as (
  select id, row_number() over (partition by client_id order by created_at, id)::integer as seq
    from public.jobs
)
update public.jobs j
   set job_seq = n.seq,
       job_number = 'Job ' || n.seq
  from n
 where n.id = j.id;
alter table public.jobs enable trigger user;

create unique index jobs_client_job_seq_uniq on public.jobs (client_id, job_seq);

insert into public.job_counters (client_id, last_job_seq)
select client_id, max(job_seq) from public.jobs group by client_id;

comment on column public.jobs.job_seq is 'Per-business job number, counted from 1 in the order jobs were created; shown as "Job N" (job_number).';

-- Each new job takes the next number for its business. The counter row is
-- the lock: two jobs created at once get consecutive numbers. Numbers aren't
-- reused after a delete.
create or replace function public.set_job_number()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_seq integer;
begin
  insert into public.job_counters as c (client_id, last_job_seq)
  values (new.client_id, 1)
  on conflict (client_id) do update set last_job_seq = c.last_job_seq + 1
  returning last_job_seq into v_seq;
  new.job_seq := v_seq;
  new.job_number := 'Job ' || v_seq;
  return new;
end;
$$;
revoke execute on function public.set_job_number() from public, anon, authenticated, service_role;

drop function public.job_number_slug(text);

-- 2. Hours: billed or covered --------------------------------------------------------

alter table public.time_entries
  add column invoice_id bigint,
  add column covered_at timestamptz,
  add constraint time_entries_invoice_same_tenant
    foreign key (client_id, invoice_id) references public.invoices (client_id, id) on delete set null (invoice_id);
create index idx_time_entries_invoice on public.time_entries (invoice_id) where invoice_id is not null;

comment on column public.time_entries.invoice_id is
  'The invoice that bills these hours (a labor line lists them in time_entry_ids) or covered them when it went out.';
comment on column public.time_entries.covered_at is
  'Set when the hours are handled without a line of their own: left unticked on an invoice that went out, or settled before hours were billable.';

-- Hours already settled: on a job whose invoice went out (covered by the
-- newest one, so voiding it releases them), or marked paid outside Field.
with went_out as (
  select distinct on (job_id) job_id, id
    from public.invoices
   where job_id is not null
     and status <> 'voided'
     and (status in ('sent', 'paid', 'overdue') or stripe_invoice_id is not null)
   order by job_id, coalesce(sent_at, created_at) desc, id desc
)
update public.time_entries t
   set invoice_id = w.id, covered_at = now()
  from went_out w
 where w.job_id = t.job_id;

update public.time_entries t
   set covered_at = now()
  from public.jobs j
 where j.id = t.job_id and j.paid_outside_at is not null and t.covered_at is null;

-- 3. Claims ----------------------------------------------------------------------------

-- The hours a draft bills, read from its rows' time_entry_ids.
create function public.invoice_row_hour_ids(p_rows jsonb)
  returns bigint[]
  language plpgsql
  immutable
  set search_path = public
as $$
declare
  v_ids bigint[] := array(
    select h::bigint
      from jsonb_array_elements(coalesce(p_rows, '[]')) e
     cross join lateral jsonb_array_elements_text(
       case when jsonb_typeof(e->'time_entry_ids') = 'array' then e->'time_entry_ids' else '[]'::jsonb end) h);
begin
  if cardinality(v_ids) <> (select count(distinct x) from unnest(v_ids) x) then
    raise exception 'The same hours are on this invoice twice. Reload the draft.' using errcode = 'P0001';
  end if;
  return v_ids;
end;
$$;
revoke execute on function public.invoice_row_hour_ids(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.invoice_row_hour_ids(jsonb) to authenticated, service_role;

create or replace function public.invoice_create_from_job(p jsonb)
  returns jsonb
  language plpgsql
  set search_path = public
as $$
declare
  v_client_id bigint := (p->>'client_id')::bigint;
  v_job_id bigint := (p->>'job_id')::bigint;
  v_task_ids bigint[] := public.invoice_row_ids(p->'line_items', 'task_id');
  v_expense_ids bigint[] := public.invoice_row_ids(p->'line_items', 'extra_expense_id');
  v_hour_ids bigint[] := public.invoice_row_hour_ids(p->'line_items');
  v_created jsonb;
  v_invoice_id bigint;
  v_n integer;
begin
  perform 1 from public.jobs where id = v_job_id and client_id = v_client_id;
  if not found then
    raise exception 'Job not found.' using errcode = 'P0001';
  end if;

  v_created := public.estimator_create_invoice(p - 'customer_company' - 'bill_to_contact_id');
  v_invoice_id := (v_created->>'invoice_id')::bigint;
  update public.invoices
     set customer_company = nullif(btrim(p->>'customer_company'), ''),
         bill_to_contact_id = (p->>'bill_to_contact_id')::bigint
   where id = v_invoice_id;

  perform set_config('field.task_claim', 'on', true);
  update public.tasks set invoice_id = v_invoice_id
   where id = any(v_task_ids) and job_id = v_job_id and client_id = v_client_id
     and invoice_id is null and billable and unit_price is not null;
  get diagnostics v_n = row_count;
  if v_n <> cardinality(v_task_ids) then
    raise exception 'Some job lines changed or went on another invoice while this draft was being made. Try again.'
      using errcode = 'P0001';
  end if;

  update public.expenses set invoiced_on = v_invoice_id
   where id = any(v_expense_ids) and job_id = v_job_id and client_id = v_client_id
     and assignment = 'job_extra' and invoiced_on is null;
  get diagnostics v_n = row_count;
  if v_n <> cardinality(v_expense_ids) then
    raise exception 'Some extras changed or went on another invoice while this draft was being made. Try again.'
      using errcode = 'P0001';
  end if;

  update public.time_entries set invoice_id = v_invoice_id
   where id = any(v_hour_ids) and job_id = v_job_id and client_id = v_client_id
     and invoice_id is null and covered_at is null;
  get diagnostics v_n = row_count;
  if v_n <> cardinality(v_hour_ids) then
    raise exception 'Some hours changed or went on another invoice while this draft was being made. Try again.'
      using errcode = 'P0001';
  end if;

  return v_created;
end;
$$;

create or replace function public.invoice_set_draft(p jsonb)
  returns void
  language plpgsql
  set search_path = public
as $$
declare
  v_invoice_id bigint := (p->>'invoice_id')::bigint;
  v_task_ids bigint[] := public.invoice_row_ids(p->'line_items', 'task_id');
  v_expense_ids bigint[] := public.invoice_row_ids(p->'line_items', 'extra_expense_id');
  v_hour_ids bigint[] := public.invoice_row_hour_ids(p->'line_items');
  v_inv public.invoices%rowtype;
  v_n integer;
begin
  select * into v_inv from public.invoices where id = v_invoice_id for update;
  if not found then
    raise exception 'Invoice not found.' using errcode = 'P0001';
  end if;
  if v_inv.status <> 'draft' or v_inv.stripe_invoice_id is not null then
    raise exception 'Only draft invoices can be edited; % went out.', v_inv.invoice_number
      using errcode = '42501';
  end if;

  perform set_config('field.task_claim', 'on', true);
  update public.tasks set invoice_id = null
   where invoice_id = v_invoice_id and not (id = any(v_task_ids));
  update public.expenses set invoiced_on = null
   where invoiced_on = v_invoice_id and not (id = any(v_expense_ids));
  update public.time_entries set invoice_id = null
   where invoice_id = v_invoice_id and not (id = any(v_hour_ids));

  update public.tasks set invoice_id = v_invoice_id
   where id = any(v_task_ids) and invoice_id is null
     and job_id = v_inv.job_id and client_id = v_inv.client_id
     and billable and unit_price is not null;
  select count(*) into v_n from public.tasks
   where id = any(v_task_ids) and invoice_id = v_invoice_id;
  if v_n <> cardinality(v_task_ids) then
    raise exception 'Some job lines changed or went on another invoice. Reload the draft.'
      using errcode = 'P0001';
  end if;

  update public.expenses set invoiced_on = v_invoice_id
   where id = any(v_expense_ids) and invoiced_on is null
     and job_id = v_inv.job_id and client_id = v_inv.client_id
     and assignment = 'job_extra';
  select count(*) into v_n from public.expenses
   where id = any(v_expense_ids) and invoiced_on = v_invoice_id;
  if v_n <> cardinality(v_expense_ids) then
    raise exception 'Some extras changed or went on another invoice. Reload the draft.'
      using errcode = 'P0001';
  end if;

  update public.time_entries set invoice_id = v_invoice_id
   where id = any(v_hour_ids) and invoice_id is null and covered_at is null
     and job_id = v_inv.job_id and client_id = v_inv.client_id;
  select count(*) into v_n from public.time_entries
   where id = any(v_hour_ids) and invoice_id = v_invoice_id;
  if v_n <> cardinality(v_hour_ids) then
    raise exception 'Some hours changed or went on another invoice. Reload the draft.'
      using errcode = 'P0001';
  end if;

  update public.invoices
     set line_items = coalesce(p->'line_items', '[]'::jsonb),
         subtotal_cents = (p->>'subtotal_cents')::integer,
         tax_cents = (p->>'tax_cents')::integer,
         total_cents = (p->>'total_cents')::integer,
         updated_at = now()
   where id = v_invoice_id;
end;
$$;

-- Sending: the rows bill exactly the lines, extras and hours the invoice
-- claims; then every hour on the job not billed by any invoice counts as
-- covered by this one (left unticked on purpose, or the work's price covers
-- labor).
create or replace function public.invoices_guard_send()
  returns trigger
  language plpgsql
  set search_path = public
as $$
declare
  v_n integer;
  v_titles text;
begin
  if old.status = 'draft' and old.stripe_invoice_id is null
     and (new.status in ('sent', 'paid', 'overdue') or new.stripe_invoice_id is not null)
     and new.job_id is not null then
    select count(*), string_agg('"' || title || '"', ', ' order by sort_order, id)
      into v_n, v_titles
      from public.tasks
     where job_id = new.job_id and billable and unit_price is null
       and (invoice_id is null or invoice_id = new.id);
    if v_n > 0 then
      raise exception 'Still needs a price: %. Price it or mark it not billable before sending.', v_titles
        using errcode = '23514';
    end if;

    if (select array_agg(x order by x) from unnest(public.invoice_row_ids(new.line_items, 'task_id')) x)
         is distinct from (select array_agg(id order by id) from public.tasks where invoice_id = new.id)
       or (select array_agg(x order by x) from unnest(public.invoice_row_ids(new.line_items, 'extra_expense_id')) x)
         is distinct from (select array_agg(id order by id) from public.expenses where invoiced_on = new.id)
       or (select array_agg(x order by x) from unnest(public.invoice_row_hour_ids(new.line_items)) x)
         is distinct from (select array_agg(id order by id) from public.time_entries
                            where invoice_id = new.id and covered_at is null) then
      raise exception 'Invoice %''s lines no longer match the job. Reload the draft, check it and save it, then send.',
        new.invoice_number using errcode = '23514';
    end if;

    perform set_config('field.task_claim', 'on', true);
    update public.time_entries
       set invoice_id = new.id, covered_at = now()
     where job_id = new.job_id and invoice_id is null and covered_at is null;
  end if;
  return new;
end;
$$;
revoke execute on function public.invoices_guard_send() from public, anon, authenticated, service_role;

create or replace function public.invoice_void(p_invoice_id bigint)
  returns void
  language plpgsql
  set search_path = public
as $$
declare
  v_inv public.invoices%rowtype;
begin
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found.' using errcode = 'P0001';
  end if;
  if v_inv.status = 'voided' then
    return;
  end if;
  if v_inv.status = 'paid' then
    raise exception 'A paid invoice can''t be voided.' using errcode = '42501';
  end if;
  if v_inv.status = 'draft' and v_inv.stripe_invoice_id is null then
    raise exception 'An unsent draft is deleted, not voided.' using errcode = '42501';
  end if;
  if exists (select 1 from public.payments where invoice_id = p_invoice_id) then
    raise exception 'Invoice % has payments recorded. Remove them first if they were a mistake.', v_inv.invoice_number
      using errcode = '42501';
  end if;

  update public.tasks set invoice_id = null where invoice_id = p_invoice_id;
  update public.expenses set invoiced_on = null where invoiced_on = p_invoice_id;
  update public.time_entries set invoice_id = null, covered_at = null where invoice_id = p_invoice_id;
  update public.invoices
     set status = 'voided', voided_at = now(), updated_at = now()
   where id = p_invoice_id;
end;
$$;
revoke execute on function public.invoice_void(bigint) from public, anon, authenticated, service_role;
grant execute on function public.invoice_void(bigint) to service_role;

-- 4. Hours are final once their invoice goes out ---------------------------------------

create function public.time_entries_guard_billing()
  returns trigger
  language plpgsql
  set search_path = public
as $$
declare
  v_invoice text;
begin
  -- Claims change through the invoice only. The foreign key clearing a claim
  -- after its draft is deleted is the one direct change allowed.
  if tg_op <> 'DELETE'
     and auth.uid() is not null
     and current_setting('field.task_claim', true) is distinct from 'on'
     and (case when tg_op = 'INSERT' then new.invoice_id is not null or new.covered_at is not null
               else new.invoice_id is distinct from old.invoice_id or new.covered_at is distinct from old.covered_at end)
     and not (tg_op = 'UPDATE' and new.invoice_id is null and new.covered_at is not distinct from old.covered_at
              and not exists (select 1 from public.invoices where id = old.invoice_id)) then
    raise exception 'Hours go on invoices from the invoice, not edited directly.' using errcode = '42501';
  end if;

  if tg_op in ('UPDATE', 'DELETE') and old.invoice_id is not null then
    select coalesce(invoice_number, 'an invoice') into v_invoice
      from public.invoices
     where id = old.invoice_id
       and status <> 'voided'
       and (status <> 'draft' or stripe_invoice_id is not null);
    if found then
      if tg_op = 'DELETE' then
        raise exception 'These hours are on invoice %, which went out. Void the invoice to change them.', v_invoice
          using errcode = '42501';
      end if;
      if (new.hours, new.entry_date, new.job_id) is distinct from (old.hours, old.entry_date, old.job_id) then
        raise exception 'These hours are on invoice %, which went out; they''re final.', v_invoice
          using errcode = '42501';
      end if;
    elsif tg_op = 'UPDATE' and new.job_id is distinct from old.job_id
          and new.invoice_id is not distinct from old.invoice_id then
      new.invoice_id := null; -- moved to another job: off this job's draft
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
revoke execute on function public.time_entries_guard_billing() from public, anon, authenticated, service_role;

create trigger time_entries_guard_billing
  before insert or update or delete on public.time_entries
  for each row execute function public.time_entries_guard_billing();

-- "0.5", "2", "1.25": hours on an invoice line, as the app writes them.
create function public.hours_label(p numeric)
  returns text
  language sql
  immutable
  set search_path = public
as $$
  select rtrim(rtrim(to_char(round(p, 2), 'FM999999990.00'), '0'), '.')
$$;

-- One invoice row after hour p_removed left it (null: none left, only hours
-- changed). A labor line re-prices from its hours and rate; without hours it
-- goes. A line that only lists hours (the minimum charge, a covered labor
-- line) keeps its amount.
create function public.invoice_hour_row(p_row jsonb, p_removed bigint)
  returns jsonb
  language plpgsql
  stable
  set search_path = public
as $$
declare
  v_ids bigint[];
  v_hours numeric;
  v_rate numeric := (p_row->>'rate')::numeric;
  v_row jsonb := p_row;
begin
  if jsonb_typeof(p_row->'time_entry_ids') is distinct from 'array' then
    return p_row;
  end if;
  v_ids := array(select h::bigint from jsonb_array_elements_text(p_row->'time_entry_ids') h where h::bigint is distinct from p_removed);
  v_row := jsonb_set(v_row, '{time_entry_ids}', to_jsonb(v_ids));
  if p_row->>'kind' = 'labor' then
    if cardinality(v_ids) = 0 then
      return null;
    end if;
    if coalesce((p_row->>'covered')::boolean, false) is false and v_rate is not null then
      select coalesce(sum(hours), 0) into v_hours from public.time_entries where id = any(v_ids);
      v_row := jsonb_set(v_row, '{amount}', to_jsonb(round(v_hours * v_rate, 2)));
      v_row := jsonb_set(v_row, '{qtyLabel}',
        to_jsonb(public.hours_label(v_hours) || ' hr × $' || to_char(v_rate, 'FM999999990.00') || '/hr'));
    end if;
  end if;
  return v_row;
end;
$$;
-- Called by drafts_follow_hours, which runs as whoever changed the hours.
revoke execute on function public.hours_label(numeric) from public, anon, authenticated, service_role;
grant execute on function public.hours_label(numeric) to authenticated, service_role;
revoke execute on function public.invoice_hour_row(jsonb, bigint) from public, anon, authenticated, service_role;
grant execute on function public.invoice_hour_row(jsonb, bigint) to authenticated, service_role;

-- An unsent draft follows its hours: deleted, moved, or changed.
create function public.drafts_follow_hours()
  returns trigger
  language plpgsql
  set search_path = public
as $$
declare
  v_removed bigint;
begin
  if current_setting('field.task_claim', true) = 'on' then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.invoice_id is not distinct from old.invoice_id and new.hours = old.hours then
    return null;
  end if;
  v_removed := case when tg_op = 'DELETE' or new.invoice_id is distinct from old.invoice_id then old.id end;
  update public.invoices i
     set line_items = kept.items,
         subtotal_cents = kept.sub,
         tax_cents = round(kept.sub * i.tax_rate_pct / 100)::integer,
         total_cents = kept.sub + round(kept.sub * i.tax_rate_pct / 100)::integer,
         updated_at = now()
    from (select coalesce(jsonb_agg(r.v order by r.n) filter (where r.v is not null), '[]'::jsonb) as items,
                 coalesce(sum(round((r.v->>'amount')::numeric * 100)) filter (where r.v is not null), 0)::integer as sub
            from public.invoices i2
           cross join lateral jsonb_array_elements(i2.line_items) with ordinality as e(v0, n)
           cross join lateral (select public.invoice_hour_row(e.v0, v_removed) as v, e.n) r
           where i2.id = old.invoice_id) kept
   where i.id = old.invoice_id
     and i.status = 'draft' and i.stripe_invoice_id is null
     and exists (select 1 from jsonb_array_elements(i.line_items) e where e->'time_entry_ids' @> to_jsonb(old.id));
  return null;
end;
$$;
revoke execute on function public.drafts_follow_hours() from public, anon, authenticated, service_role;

create trigger time_entries_follow_draft
  after update on public.time_entries
  for each row when (old.invoice_id is not null
                     and (new.invoice_id is distinct from old.invoice_id or new.hours is distinct from old.hours))
  execute function public.drafts_follow_hours();
create trigger time_entries_follow_draft_on_delete
  after delete on public.time_entries
  for each row when (old.invoice_id is not null)
  execute function public.drafts_follow_hours();

-- 5. Expenses on an invoice that went out are final ------------------------------------

create or replace function public.expenses_guard_billing()
  returns trigger
  language plpgsql
  set search_path = public
as $$
declare
  v_invoice text;
begin
  if old.invoiced_on is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select coalesce(invoice_number, 'an invoice') into v_invoice from public.invoices
   where id = old.invoiced_on and status <> 'voided' and (status <> 'draft' or stripe_invoice_id is not null);
  if found and auth.uid() is not null then
    if tg_op = 'DELETE' then
      raise exception 'This expense is on invoice %, which went out. Void the invoice to change it.', v_invoice
        using errcode = '42501';
    end if;
    if new.invoiced_on is distinct from old.invoiced_on then
      raise exception 'This extra is on invoice %, which went out. Void the invoice to bill it again.', v_invoice
        using errcode = '42501';
    end if;
    if (new.description, new.amount, new.qty, new.unit_price, new.assignment, new.job_id, new.bill_markup)
       is distinct from (old.description, old.amount, old.qty, old.unit_price, old.assignment, old.job_id, old.bill_markup) then
      raise exception 'This expense is on invoice %, which went out; it''s final.', v_invoice
        using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if new.invoiced_on is not distinct from old.invoiced_on
     and (new.assignment is distinct from 'job_extra' or new.job_id is distinct from old.job_id)
     and exists (select 1 from public.invoices
                  where id = old.invoiced_on and status = 'draft' and stripe_invoice_id is null) then
    new.invoiced_on := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.expenses_guard_billing() from public, anon, authenticated, service_role;

create trigger expenses_guard_delete
  before delete on public.expenses
  for each row execute function public.expenses_guard_billing();

-- 6. Ready to invoice counts hours not yet billed on a completed job --------------------

create or replace view public.job_billing with (security_invoker = true) as
with unsent as (
  select i.id
    from public.invoices i
   where i.status = 'draft' and i.stripe_invoice_id is null
),
went_out as (
  select i.job_id,
         i.total_cents,
         coalesce((select sum(p.amount_cents) from public.payments p where p.invoice_id = i.id), 0) as paid_cents
    from public.invoices i
   where i.job_id is not null
     and i.status <> 'voided'
     and (i.status in ('sent', 'paid', 'overdue') or i.stripe_invoice_id is not null)
),
invoiced as (
  select job_id,
         sum(total_cents)::bigint as invoiced_cents,
         sum(least(paid_cents, total_cents))::bigint as paid_cents,
         sum(greatest(total_cents - paid_cents, 0))::bigint as owed_cents
    from went_out
   group by job_id
),
lines as (
  select t.job_id, count(*) as ready_lines
    from public.tasks t
    join public.jobs j on j.id = t.job_id
   where t.billable
     and (t.status = 'done' or j.status = 'completed')
     and (t.invoice_id is null or t.invoice_id in (select id from unsent))
   group by t.job_id
),
extras as (
  select e.job_id, count(*) as ready_extras
    from public.expenses e
   where e.assignment = 'job_extra'
     and e.job_id is not null
     and (e.invoiced_on is null or e.invoiced_on in (select id from unsent))
   group by e.job_id
),
hours as (
  select h.job_id, count(*) as ready_hours
    from public.time_entries h
    join public.jobs j on j.id = h.job_id
   where j.status = 'completed'
     and h.covered_at is null
     and (h.invoice_id is null or h.invoice_id in (select id from unsent))
   group by h.job_id
),
facts as (
  select j.id as job_id,
         j.client_id,
         j.paid_outside_at,
         j.paid_outside_note,
         coalesce(l.ready_lines, 0) + coalesce(x.ready_extras, 0) + coalesce(hr.ready_hours, 0) as ready_count,
         (j.status = 'completed' and inv.job_id is null) as completed_nothing_sent,
         inv.job_id is not null as went_out,
         coalesce(inv.invoiced_cents, 0) as invoiced_cents,
         coalesce(inv.paid_cents, 0) as paid_cents,
         coalesce(inv.owed_cents, 0) as owed_cents
    from public.jobs j
    left join invoiced inv on inv.job_id = j.id
    left join lines l on l.job_id = j.id
    left join extras x on x.job_id = j.id
    left join hours hr on hr.job_id = j.id
)
select job_id,
       client_id,
       case
         when owed_cents > 0 and paid_cents = 0 and (paid_outside_at is not null or ready_count = 0) then 'invoiced'
         when owed_cents > 0 and (paid_outside_at is not null or ready_count = 0) then 'part_paid'
         when paid_outside_at is not null then 'paid'
         when ready_count > 0 or completed_nothing_sent then 'ready'
         when not went_out then null
         else 'paid'
       end as state,
       ready_count,
       invoiced_cents,
       paid_cents,
       owed_cents,
       paid_outside_at,
       paid_outside_note
  from facts;

comment on view public.job_billing is
  'Billing state per job (ready | invoiced | part_paid | paid | null), computed from tasks, job extras, hours not yet billed on completed jobs, invoices and payments, plus jobs.paid_outside_at. security_invoker: RLS of the caller applies.';
revoke all on public.job_billing from public, anon, authenticated;
grant select on public.job_billing to authenticated, service_role;
