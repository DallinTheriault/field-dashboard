-- v105: an accepted estimate bills through the job's invoice.
--
-- Job 14's accepted estimate never reached its invoice: the job's invoice
-- builder reads work lines, extras and hours, never the estimate, and the
-- estimate's own "Create invoice" was a second path that knew nothing of the
-- job's claims. The job's invoice is now the one path:
--
--   1. A draft claims an estimate the way it claims lines: its rows carry
--      estimate_id, invoices.estimate_id records the claim, and an estimate
--      is on at most one invoice that isn't voided. Only the job's newest
--      accepted version can be claimed, and only while no version of the
--      job's estimate is on another invoice that isn't voided (older versions
--      stay "accepted" after a revision, so this stops a revision being
--      billed on top of the version it replaced).
--   2. invoice_create_from_job numbers the invoice itself, and the old
--      estimate-only path (estimator_create_invoice) goes.
--   3. Sending checks the rows still bill exactly the claimed estimate, and
--      that it's still accepted. Voiding releases the claim (voided invoices
--      don't count); deleting a draft releases it with the row.
--   4. An estimate on an invoice that went out is final: no change to it or
--      its lines, no delete. invoices.estimate_id is final with the rest.
--   5. Ready to invoice counts a completed job's accepted estimate that no
--      invoice has sent.
--
-- No invoice or estimate row is changed. Every invoice that claims an
-- estimate today went out (all paid); no draft claims one.

-- 1. Claims ------------------------------------------------------------------------------

-- One estimate per invoice that isn't voided (the claim checks below give the
-- friendly message; this is the backstop).
create unique index invoices_estimate_once on public.invoices (estimate_id)
  where estimate_id is not null and status <> 'voided';

-- The estimate a draft's rows bill (null: none). Many rows share it.
create function public.invoice_row_estimate_id(p_rows jsonb)
  returns bigint
  language plpgsql
  immutable
  set search_path = public
as $$
declare
  v_ids bigint[] := array(
    select distinct (e->>'estimate_id')::bigint
      from jsonb_array_elements(coalesce(p_rows, '[]')) e
     where e->>'estimate_id' is not null);
begin
  if cardinality(v_ids) > 1 then
    raise exception 'An invoice bills one estimate. Reload the draft.' using errcode = 'P0001';
  end if;
  return v_ids[1];
end;
$$;
revoke execute on function public.invoice_row_estimate_id(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.invoice_row_estimate_id(jsonb) to authenticated, service_role;

-- Can p_invoice_id (null: a draft being made) claim this estimate? Locks the
-- estimate so two drafts made at once can't both take it.
create function public.invoice_check_estimate(p_estimate_id bigint, p_job_id bigint, p_client_id bigint, p_invoice_id bigint)
  returns void
  language plpgsql
  set search_path = public
as $$
declare
  v_est public.estimates%rowtype;
  v_on text;
begin
  select * into v_est from public.estimates
   where id = p_estimate_id and client_id = p_client_id
     for update;
  if not found or v_est.job_id is distinct from p_job_id then
    raise exception 'That estimate isn''t on this job. Reload the page.' using errcode = 'P0001';
  end if;
  if v_est.status <> 'accepted' then
    raise exception 'Estimate v% isn''t accepted, so it can''t be billed.', v_est.version using errcode = 'P0001';
  end if;
  if exists (select 1 from public.estimates
              where job_id = p_job_id and status = 'accepted'
                and (version, id) > (v_est.version, v_est.id)) then
    raise exception 'A newer accepted version of this estimate exists; bill that one. Reload the page.'
      using errcode = 'P0001';
  end if;
  select coalesce(i.invoice_number, 'another invoice') into v_on
    from public.invoices i
    join public.estimates e on e.id = i.estimate_id
   where e.job_id = p_job_id
     and i.status <> 'voided'
     and i.id is distinct from p_invoice_id
   limit 1;
  if found then
    raise exception 'This job''s estimate is already on invoice %.', v_on using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function public.invoice_check_estimate(bigint, bigint, bigint, bigint) from public, anon, authenticated, service_role;
grant execute on function public.invoice_check_estimate(bigint, bigint, bigint, bigint) to authenticated, service_role;

-- 2. A new draft from the job: numbered here (as v072 did), claims its lines,
-- extras, hours and estimate. p: client_id, job_id, billing_entity_id,
-- bill_to_contact_id, customer_name/email/phone/company, line_items,
-- subtotal_cents, tax_rate_pct, tax_cents, total_cents, due_terms.
create or replace function public.invoice_create_from_job(p jsonb)
  returns jsonb
  language plpgsql
  set search_path = public
as $$
declare
  v_client_id bigint := (p->>'client_id')::bigint;
  v_job_id bigint := (p->>'job_id')::bigint;
  v_entity_id bigint := (p->>'billing_entity_id')::bigint;
  v_task_ids bigint[] := public.invoice_row_ids(p->'line_items', 'task_id');
  v_expense_ids bigint[] := public.invoice_row_ids(p->'line_items', 'extra_expense_id');
  v_hour_ids bigint[] := public.invoice_row_hour_ids(p->'line_items');
  v_estimate_id bigint := public.invoice_row_estimate_id(p->'line_items');
  v_prefix text;
  v_year text := to_char(now(), 'YYYY');
  v_number text;
  v_invoice_id bigint;
  v_n integer;
begin
  perform 1 from public.jobs where id = v_job_id and client_id = v_client_id;
  if not found then
    raise exception 'Job not found.' using errcode = 'P0001';
  end if;
  if v_estimate_id is not null then
    perform public.invoice_check_estimate(v_estimate_id, v_job_id, v_client_id, null);
  end if;

  select invoice_prefix into v_prefix
    from public.billing_entities
   where id = v_entity_id and client_id = v_client_id;
  if v_prefix is null then
    raise exception 'Billing entity not found.' using errcode = 'P0001';
  end if;

  -- PREFIX-YYYY-NNN per business, letterhead and year. The lock serializes
  -- numbering; the unique index invoices_number_per_client is the backstop.
  perform pg_advisory_xact_lock(
    hashtext('estimator_invoice_number'),
    hashtext(v_client_id::text || ':' || v_prefix || ':' || v_year));
  select v_prefix || '-' || v_year || '-'
         || lpad((coalesce(max(substring(invoice_number from '\d{3}$')::integer), 0) + 1)::text, 3, '0')
    into v_number
    from public.invoices
   where client_id = v_client_id
     and invoice_number like v_prefix || '-' || v_year || '-%';

  insert into public.invoices (
    client_id, job_id, estimate_id, billing_entity_id, invoice_number,
    bill_to_contact_id, customer_name, customer_email, customer_phone, customer_company,
    line_items, subtotal_cents, tax_rate_pct, tax_cents, total_cents, due_terms, status
  ) values (
    v_client_id, v_job_id, v_estimate_id, v_entity_id, v_number,
    (p->>'bill_to_contact_id')::bigint,
    p->>'customer_name',
    p->>'customer_email',
    p->>'customer_phone',
    nullif(btrim(p->>'customer_company'), ''),
    coalesce(p->'line_items', '[]'::jsonb),
    coalesce((p->>'subtotal_cents')::integer, 0),
    coalesce((p->>'tax_rate_pct')::numeric, 0),
    coalesce((p->>'tax_cents')::integer, 0),
    coalesce((p->>'total_cents')::integer, 0),
    coalesce(nullif(p->>'due_terms', ''), 'Due on receipt'),
    'draft'
  ) returning id into v_invoice_id;

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

  return jsonb_build_object('invoice_id', v_invoice_id, 'invoice_number', v_number);
end;
$$;

drop function public.estimator_create_invoice(jsonb);

-- A draft's rows replaced: as v103, plus the estimate follows the rows (taken
-- when they bill it, released when none do).
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
  v_estimate_id bigint := public.invoice_row_estimate_id(p->'line_items');
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
  if v_estimate_id is not null and v_estimate_id is distinct from v_inv.estimate_id then
    perform public.invoice_check_estimate(v_estimate_id, v_inv.job_id, v_inv.client_id, v_invoice_id);
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
         estimate_id = v_estimate_id,
         updated_at = now()
   where id = v_invoice_id;
end;
$$;

-- 3. Sending: as v103, plus the rows bill exactly the claimed estimate, and
-- it's still accepted.
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
                            where invoice_id = new.id and covered_at is null)
       or public.invoice_row_estimate_id(new.line_items) is distinct from new.estimate_id then
      raise exception 'Invoice %''s lines no longer match the job. Reload the draft, check it and save it, then send.',
        new.invoice_number using errcode = '23514';
    end if;

    if new.estimate_id is not null
       and not exists (select 1 from public.estimates where id = new.estimate_id and status = 'accepted') then
      raise exception 'The estimate on invoice % isn''t accepted any more. Take it off the draft, or mark it accepted, then send.',
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

-- 4. What went out is final ---------------------------------------------------------------

-- As v104, plus the estimate it bills.
create or replace function public.invoices_guard_final()
  returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if old.status = 'voided' then
    if new.status <> 'voided'
       or (new.line_items, new.subtotal_cents, new.tax_cents, new.total_cents)
          is distinct from (old.line_items, old.subtotal_cents, old.tax_cents, old.total_cents) then
      raise exception 'Invoice % is void.', old.invoice_number using errcode = '42501';
    end if;
    return new;
  end if;
  if new.status = 'voided' then
    raise exception 'Void invoices from the invoice page, so the card link and lines are handled.'
      using errcode = '42501';
  end if;
  if old.status <> 'draft' or old.stripe_invoice_id is not null then
    if (old.status <> 'draft' and new.status = 'draft')
       or (new.line_items, new.subtotal_cents, new.tax_cents, new.total_cents, new.tax_rate_pct,
           new.stripe_invoice_id, new.billing_entity_id, new.invoice_number, new.job_id, new.estimate_id)
          is distinct from (old.line_items, old.subtotal_cents, old.tax_cents, old.total_cents, old.tax_rate_pct,
           old.stripe_invoice_id, old.billing_entity_id, old.invoice_number, old.job_id, old.estimate_id)
       or (new.bill_to_contact_id, new.customer_name, new.customer_company, new.customer_address,
           new.customer_email, new.customer_phone, new.service_address, new.service_resident,
           new.work_order_number, new.job_number)
          is distinct from (old.bill_to_contact_id, old.customer_name, old.customer_company, old.customer_address,
           old.customer_email, old.customer_phone, old.service_address, old.service_resident,
           old.work_order_number, old.job_number) then
      raise exception 'Invoice % went out; its lines, totals and who it bills are final. Void it and re-invoice to change them.',
        old.invoice_number using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.invoices_guard_final() from public, anon, authenticated, service_role;

-- The invoice that went out with this estimate on it, if any.
create function public.estimate_sent_invoice(p_estimate_id bigint)
  returns text
  language sql
  stable
  set search_path = public
as $$
  select coalesce(invoice_number, 'an invoice')
    from public.invoices
   where estimate_id = p_estimate_id
     and status <> 'voided'
     and (status <> 'draft' or stripe_invoice_id is not null)
   limit 1
$$;
revoke execute on function public.estimate_sent_invoice(bigint) from public, anon, authenticated, service_role;
grant execute on function public.estimate_sent_invoice(bigint) to authenticated, service_role;

-- An estimate on an invoice that went out can't change or go. Server code
-- (no signed-in user) is exempt.
create function public.estimates_guard_billed()
  returns trigger
  language plpgsql
  set search_path = public
as $$
declare
  v_invoice text;
begin
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_invoice := public.estimate_sent_invoice(old.id);
  if v_invoice is not null then
    if tg_op = 'DELETE' then
      raise exception 'Estimate v% is on invoice %, which went out. Void the invoice to change it.', old.version, v_invoice
        using errcode = '42501';
    end if;
    if to_jsonb(new) - 'updated_at' is distinct from to_jsonb(old) - 'updated_at' then
      raise exception 'Estimate v% is on invoice %, which went out; it''s final. Start a new version instead.', old.version, v_invoice
        using errcode = '42501';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke execute on function public.estimates_guard_billed() from public, anon, authenticated, service_role;

create trigger estimates_guard_billed
  before update or delete on public.estimates
  for each row execute function public.estimates_guard_billed();

create function public.estimate_lines_guard_billed()
  returns trigger
  language plpgsql
  set search_path = public
as $$
declare
  v_invoice text;
begin
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    v_invoice := public.estimate_sent_invoice(old.estimate_id);
  end if;
  if v_invoice is null and tg_op in ('INSERT', 'UPDATE') then
    v_invoice := public.estimate_sent_invoice(new.estimate_id);
  end if;
  if v_invoice is not null then
    raise exception 'This estimate is on invoice %, which went out; its lines are final. Start a new version instead.', v_invoice
      using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke execute on function public.estimate_lines_guard_billed() from public, anon, authenticated, service_role;

create trigger estimate_lines_guard_billed
  before insert or update or delete on public.estimate_line_items
  for each row execute function public.estimate_lines_guard_billed();

-- 5. Ready to invoice counts an accepted estimate no invoice has sent -------------------

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
-- A completed job's accepted estimate, while no version of it is on an
-- invoice that went out (on an unsent draft it still counts, like a line).
estimate as (
  select distinct e.job_id
    from public.estimates e
    join public.jobs j on j.id = e.job_id
   where e.status = 'accepted'
     and j.status = 'completed'
     and not exists (select 1
                       from public.invoices i
                       join public.estimates e2 on e2.id = i.estimate_id
                      where e2.job_id = e.job_id
                        and i.status <> 'voided'
                        and i.id not in (select id from unsent))
),
facts as (
  select j.id as job_id,
         j.client_id,
         j.paid_outside_at,
         j.paid_outside_note,
         coalesce(l.ready_lines, 0) + coalesce(x.ready_extras, 0) + coalesce(hr.ready_hours, 0)
           + (case when es.job_id is not null then 1 else 0 end) as ready_count,
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
    left join estimate es on es.job_id = j.id
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
  'Billing state per job (ready | invoiced | part_paid | paid | null), computed from tasks, job extras, hours not yet billed and accepted estimates not yet invoiced on completed jobs, invoices and payments, plus jobs.paid_outside_at. security_invoker: RLS of the caller applies.';
