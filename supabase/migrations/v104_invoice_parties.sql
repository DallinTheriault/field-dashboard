-- v104: an invoice prints who pays (Bill To) apart from where the work was
-- (Service address), keeps both in step while it's a draft, and freezes them
-- when it goes out. Jobs get an optional work order number and all-day
-- schedules.
--
--   1. jobs.work_order_number: printed on the invoice when filled.
--      jobs.all_day: a scheduled job with a date and no time.
--   2. invoices.customer_address: the bill-to contact's mailing address.
--      invoices.service_address / service_resident / work_order_number /
--      job_number: the service block and job number as the invoice went out.
--   3. While an invoice is a draft, every save takes the bill-to name,
--      company, address, email and phone from the bill-to contact (the payer
--      only: never the resident's). When it goes out, by any route (marked
--      sent, card link, a payment recorded), they're taken one last time and
--      the service block is stamped from the job.
--   4. Once out, those fields are final, like its lines and totals.
--
-- No existing row is changed: drafts take the contact's details on their next
-- save, and invoices that already went out keep what they have.

-- 1. Jobs ------------------------------------------------------------------------------

alter table public.jobs
  add column work_order_number text
    constraint jobs_work_order_number_check
      check (work_order_number is null or char_length(btrim(work_order_number)) between 1 and 40),
  add column all_day boolean not null default false;

comment on column public.jobs.work_order_number is 'The customer''s work order number (e.g. a property manager''s); printed on the invoice when filled.';
comment on column public.jobs.all_day is 'Scheduled for a day (or days, to end_datetime) with no time: start_datetime is midnight in the business''s time zone.';

-- 2. Invoices --------------------------------------------------------------------------

alter table public.invoices
  add column customer_address text,
  add column service_address text,
  add column service_resident text,
  add column work_order_number text,
  add column job_number text;

comment on column public.invoices.customer_address is 'Bill-to contact''s mailing address; follows the contact while a draft, final once sent.';
comment on column public.invoices.service_address is 'Where the work was (the job''s property + unit), as the invoice went out.';
comment on column public.invoices.service_resident is 'First name of the job''s contact when they aren''t the payer, as the invoice went out.';

-- 3. Drafts follow the bill-to contact; sending stamps the service block -----------------

create function public.invoices_follow_parties()
  returns trigger
  language plpgsql
  set search_path = public
as $$
declare
  v_draft boolean := tg_op = 'INSERT' or (old.status = 'draft' and old.stripe_invoice_id is null);
  c record;
begin
  if not v_draft then
    return new;
  end if;

  if new.bill_to_contact_id is not null then
    select name, company, address, email, phone into c
      from public.contacts
     where id = new.bill_to_contact_id and client_id = new.client_id;
    if found then
      new.customer_name := coalesce(nullif(btrim(c.name), ''), new.customer_name);
      new.customer_company := nullif(btrim(c.company), '');
      new.customer_address := nullif(btrim(c.address), '');
      new.customer_email := nullif(btrim(c.email), '');
      new.customer_phone := nullif(btrim(c.phone), '');
    end if;
  end if;

  -- Going out: the service block and job number as they are now.
  if tg_op = 'UPDATE' and new.job_id is not null
     and (new.status <> 'draft' or new.stripe_invoice_id is not null) then
    select coalesce(
             case when j.property_id is not null and nullif(btrim(p.address), '') is not null
                  then btrim(p.address) || coalesce(', Unit ' || nullif(btrim(p.unit), ''), '') end,
             nullif(btrim(j.address), '')),
           case when j.contact_id is not null and j.contact_id is distinct from new.bill_to_contact_id
                then nullif(split_part(btrim(jc.name), ' ', 1), '') end,
           nullif(btrim(j.work_order_number), ''),
           j.job_number
      into new.service_address, new.service_resident, new.work_order_number, new.job_number
      from public.jobs j
      left join public.properties p on p.id = j.property_id
      left join public.contacts jc on jc.id = j.contact_id
     where j.id = new.job_id;
  end if;
  return new;
end;
$$;
revoke execute on function public.invoices_follow_parties() from public, anon, authenticated, service_role;

-- Before the guards (triggers fire in name order), so sending stamps first.
create trigger invoices_follow_parties
  before insert or update on public.invoices
  for each row execute function public.invoices_follow_parties();

-- 4. What went out is final ------------------------------------------------------------
-- As v096, plus who it bills and where the work was.
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
           new.stripe_invoice_id, new.billing_entity_id, new.invoice_number, new.job_id)
          is distinct from (old.line_items, old.subtotal_cents, old.tax_cents, old.total_cents, old.tax_rate_pct,
           old.stripe_invoice_id, old.billing_entity_id, old.invoice_number, old.job_id)
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
