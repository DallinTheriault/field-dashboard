-- v099: a job's billing state, worked out from its lines, extras, invoices and
-- payments; never set by hand. Additive.
--
--   ready      finished billable lines or job extras not on an invoice that
--              went out (unclaimed, or only on an unsent draft), or the job
--              is completed and nothing has gone out for it. On a completed
--              job every billable line counts as finished, checked or not.
--   invoiced   an invoice went out and nothing is paid yet
--   part_paid  some money in, and an invoice that went out still has a balance
--   paid       nothing owed: every invoice that went out is fully paid, even
--              if billable work isn't finished yet
--   (null)     nothing to bill yet
--
-- "Went out" is the same test Home and the invoice guards use: sent, paid or
-- overdue, or issued through Stripe; a voided invoice doesn't count.
--
-- Old jobs paid before Field had invoices can be marked paid outside Field
-- (owner only). That only settles what Field can't see: it clears "ready to
-- invoice" and counts the job as paid. It records no payment, so no income,
-- and it can't hide money owed on an invoice Field sent.

alter table public.jobs
  add column paid_outside_at timestamptz,
  add column paid_outside_note text,
  add column paid_outside_by uuid;

comment on column public.jobs.paid_outside_at is
  'Owner marked this job paid outside Field (old jobs paid before Field had invoices). Not income: no payment row.';

-- Who may set it, and when. Owner only; refused while an invoice that went out
-- still has a balance (record that payment on the invoice instead).
create or replace function public.jobs_guard_paid_outside()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE'
     and new.paid_outside_at is not distinct from old.paid_outside_at
     and new.paid_outside_note is not distinct from old.paid_outside_note
     and new.paid_outside_by is not distinct from old.paid_outside_by then
    return new;
  end if;
  if tg_op = 'INSERT' and new.paid_outside_at is null and new.paid_outside_note is null and new.paid_outside_by is null then
    return new;
  end if;
  -- Service role and migrations (no signed-in user) are trusted.
  if auth.uid() is null then
    return new;
  end if;
  if public.user_role_in_client(new.client_id) is distinct from 'owner' then
    raise exception 'Only an owner can mark a job paid outside Field.' using errcode = '42501';
  end if;
  if new.paid_outside_at is null then
    new.paid_outside_note := null;
    new.paid_outside_by := null;
    return new;
  end if;
  if exists (
    select 1
      from public.invoices i
     where i.job_id = new.id
       and i.status <> 'voided'
       and (i.status in ('sent', 'paid', 'overdue') or i.stripe_invoice_id is not null)
       and i.total_cents > coalesce((select sum(p.amount_cents) from public.payments p where p.invoice_id = i.id), 0)
  ) then
    raise exception 'This job has an invoice with money owed. Record the payment on that invoice instead.'
      using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' or old.paid_outside_at is null then
    new.paid_outside_at := now();
  else
    new.paid_outside_at := old.paid_outside_at;
  end if;
  new.paid_outside_by := auth.uid();
  return new;
end;
$$;

revoke execute on function public.jobs_guard_paid_outside() from public, anon, authenticated, service_role;

create trigger jobs_guard_paid_outside
  before insert or update on public.jobs
  for each row execute function public.jobs_guard_paid_outside();

-- The state. security_invoker: the caller's row-level security applies to
-- every table read, so a tenant only ever sees its own jobs.
create view public.job_billing with (security_invoker = true) as
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
facts as (
  select j.id as job_id,
         j.client_id,
         j.paid_outside_at,
         j.paid_outside_note,
         coalesce(l.ready_lines, 0) + coalesce(x.ready_extras, 0) as ready_count,
         (j.status = 'completed' and inv.job_id is null) as completed_nothing_sent,
         inv.job_id is not null as went_out,
         coalesce(inv.invoiced_cents, 0) as invoiced_cents,
         coalesce(inv.paid_cents, 0) as paid_cents,
         coalesce(inv.owed_cents, 0) as owed_cents
    from public.jobs j
    left join invoiced inv on inv.job_id = j.id
    left join lines l on l.job_id = j.id
    left join extras x on x.job_id = j.id
)
select job_id,
       client_id,
       case
         -- Money still owed on an invoice that went out shows, unless new work
         -- is ready to invoice (the owner's next step); a paid-outside mark
         -- never hides it.
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
  'Billing state per job (ready | invoiced | part_paid | paid | null), computed from tasks, job extras, invoices and payments, plus jobs.paid_outside_at. security_invoker: RLS of the caller applies.';

revoke all on public.job_billing from public, anon, authenticated;
grant select on public.job_billing to authenticated, service_role;
