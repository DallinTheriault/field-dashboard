-- v095: priced tasks (billing slice 2). A job's tasks become its billable
-- lines. Additive; prod has no task rows yet, so nothing is backfilled and
-- existing tasks would default to non-billable with no price.
--
-- Line total = qty × unit_price. Picking a price-book entry copies its unit
-- and price onto the task, so editing the price book never changes a job.

-- Same-tenant targets for the composite foreign keys below.
alter table public.jobs add constraint jobs_client_id_id_key unique (client_id, id);
alter table public.invoices add constraint invoices_client_id_id_key unique (client_id, id);

-- Close an existing hole: RLS checks a task's own client_id, so a writer
-- could attach a task to another tenant's job. Once tasks are billable that
-- line would land on the other tenant's invoice. The composite key replaces
-- the plain one.
alter table public.tasks
  add constraint tasks_job_same_tenant foreign key (client_id, job_id)
    references public.jobs (client_id, id) on delete cascade;
alter table public.tasks drop constraint tasks_job_id_fkey;

alter table public.tasks
  add column service_id bigint,
  add column qty numeric not null default 1
    constraint tasks_qty_check check (qty > 0),
  add column unit text
    constraint tasks_unit_check check (unit in ('each', 'hour', 'sqft', 'lnft')),
  add column unit_price numeric
    constraint tasks_unit_price_check check (unit_price is null or unit_price >= 0),
  add column billable boolean not null default false,
  -- The invoice this line is billed on: claimed when a draft is created,
  -- final once that invoice is sent, released on void or delete (slice 3).
  add column invoice_id bigint,
  add constraint tasks_billable_priced check (not billable or unit_price is not null),
  add constraint tasks_service_same_tenant foreign key (client_id, service_id)
    references public.service_catalog (client_id, id) on delete set null (service_id),
  add constraint tasks_invoice_same_tenant foreign key (client_id, invoice_id)
    references public.invoices (client_id, id) on delete set null (invoice_id);

create index idx_tasks_invoice on public.tasks (invoice_id) where invoice_id is not null;
create index idx_tasks_service on public.tasks (client_id, service_id) where service_id is not null;

-- Tasks are written straight from the browser under RLS, so the billing rules
-- live here rather than in the UI:
--   * only invoice code claims or releases a line (invoice_id); it marks its
--     transaction with field.task_claim, which an API caller can't set
--   * a line on an invoice that went out (sent, paid, overdue, or issued
--     through Stripe; not voided) keeps its price
create function public.tasks_guard_billing()
  returns trigger
  language plpgsql
  set search_path = public
as $$
declare
  v_invoice text;
begin
  if auth.uid() is not null
     and current_setting('field.task_claim', true) is distinct from 'on'
     and (case when tg_op = 'INSERT' then new.invoice_id is not null
               else new.invoice_id is distinct from old.invoice_id end) then
    raise exception 'Lines are added to invoices from the invoice, not edited directly.'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and old.invoice_id is not null
     and (new.qty, new.unit, new.unit_price, new.billable, new.service_id)
         is distinct from (old.qty, old.unit, old.unit_price, old.billable, old.service_id) then
    select coalesce(invoice_number, 'an invoice') into v_invoice
    from public.invoices
    where id = old.invoice_id
      and status <> 'voided'
      and (status <> 'draft' or stripe_invoice_id is not null);
    if found then
      raise exception 'This line is on invoice %, which went out; its price is final.', v_invoice
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.tasks_guard_billing() from public, anon, authenticated, service_role;

create trigger tasks_guard_billing
  before insert or update on public.tasks
  for each row execute function public.tasks_guard_billing();
