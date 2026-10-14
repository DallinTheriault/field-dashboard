-- v096: invoice from the job (billing slice 3). No estimate needed: a draft is
-- built from the job's done, billable lines plus its uninvoiced extras.
-- Claim at draft, final at send, released on void or delete.

-- 1. "Needs a price" becomes its own state ------------------------------------
-- A draft lists lines that still need a price and won't send until each is
-- priced or marked not billable, so the two must differ: billable with no
-- price = needs a price; not billable = never bills. v095 required a price on
-- every billable line, which made them the same state.
alter table public.tasks drop constraint tasks_billable_priced;
-- Lines slice 2 showed as "needs a price" (a unit, no price) were stored
-- non-billable only because of that rule; they were meant to bill.
update public.tasks set billable = true
where unit is not null and unit_price is null and not billable;

-- 2. Billing entity per job ------------------------------------------------------
-- Which letterhead and invoice numbering a job bills under. Null until the
-- job's first invoice picks one (its latest estimate's entity, else the
-- tenant default); editable there after.
alter table public.billing_entities
  add constraint billing_entities_client_id_id_key unique (client_id, id);
alter table public.jobs
  add column billing_entity_id bigint,
  add constraint jobs_billing_entity_same_tenant foreign key (client_id, billing_entity_id)
    references public.billing_entities (client_id, id) on delete set null (billing_entity_id);

-- 3. Contacts: company, property manager, card-link preference ------------------
alter table public.contacts
  add column company text,
  -- Drives slice 5's approval default: work orders from a manager need none.
  add column is_property_manager boolean not null default false,
  -- The last "Add card payment link" choice for this bill-to contact.
  add column card_link_default boolean not null default false;

-- 4. Extras: markup and receipt attachments -------------------------------------
alter table public.expenses
  -- Bill this extra marked up by pricing_settings.material_markup_pct
  -- instead of at cost.
  add column bill_markup boolean not null default false,
  -- Share the receipt photo along with the invoice PDF.
  add column attach_receipt boolean not null default false;
-- Same-tenant stamp: an expense can only be invoiced on its own tenant's invoice.
alter table public.expenses
  add constraint expenses_invoice_same_tenant foreign key (client_id, invoiced_on)
    references public.invoices (client_id, id) on delete set null (invoiced_on);
alter table public.expenses drop constraint expenses_invoiced_on_fkey;

-- 5. Invoices ---------------------------------------------------------------------
alter table public.contacts add constraint contacts_client_id_id_key unique (client_id, id);
alter table public.invoices
  -- Who the invoice bills: an email prompted at send is saved back to this
  -- contact, and so is the card-link choice. The name/email/phone/company
  -- columns stay the snapshot printed on the invoice.
  add column bill_to_contact_id bigint,
  -- Bill-to company snapshot, printed under the contact's name.
  add column customer_company text,
  add column voided_at timestamptz,
  add constraint invoices_bill_to_same_tenant foreign key (client_id, bill_to_contact_id)
    references public.contacts (client_id, id) on delete set null (bill_to_contact_id);

-- 6. Claims -----------------------------------------------------------------------
-- Creating or editing a draft claims its lines in the same transaction, so two
-- drafts can't bill the same line. Both run as the caller (RLS applies) and
-- mark the transaction with field.task_claim, which tasks_guard_billing
-- requires before invoice_id can change.

-- What a draft claims is read from its own rows (task_id, extra_expense_id),
-- never passed separately, so a row and its claim can't disagree, and the same
-- line can't be on one invoice twice.
create function public.invoice_row_ids(p_rows jsonb, p_key text)
  returns bigint[]
  language plpgsql
  immutable
  set search_path = public
as $$
declare
  v_ids bigint[] := array(
    select (e->>p_key)::bigint from jsonb_array_elements(coalesce(p_rows, '[]')) e
     where e->>p_key is not null);
begin
  if cardinality(v_ids) <> (select count(distinct x) from unnest(v_ids) x) then
    raise exception 'A line is on this invoice twice. Reload the draft.' using errcode = 'P0001';
  end if;
  return v_ids;
end;
$$;

-- A new draft from the job. p: estimator_create_invoice's fields plus
-- bill_to_contact_id and customer_company.
create function public.invoice_create_from_job(p jsonb)
  returns jsonb
  language plpgsql
  set search_path = public
as $$
declare
  v_client_id bigint := (p->>'client_id')::bigint;
  v_job_id bigint := (p->>'job_id')::bigint;
  v_task_ids bigint[] := public.invoice_row_ids(p->'line_items', 'task_id');
  v_expense_ids bigint[] := public.invoice_row_ids(p->'line_items', 'extra_expense_id');
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

  return v_created;
end;
$$;

-- Replace a draft's lines. p: invoice_id, line_items, subtotal_cents,
-- tax_cents, total_cents: everything the draft carries afterwards. Lines
-- dropped from the draft are released; lines added are claimed.
create function public.invoice_set_draft(p jsonb)
  returns void
  language plpgsql
  set search_path = public
as $$
declare
  v_invoice_id bigint := (p->>'invoice_id')::bigint;
  v_task_ids bigint[] := public.invoice_row_ids(p->'line_items', 'task_id');
  v_expense_ids bigint[] := public.invoice_row_ids(p->'line_items', 'extra_expense_id');
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

  update public.invoices
     set line_items = coalesce(p->'line_items', '[]'::jsonb),
         subtotal_cents = (p->>'subtotal_cents')::integer,
         tax_cents = (p->>'tax_cents')::integer,
         total_cents = (p->>'total_cents')::integer,
         updated_at = now()
   where id = v_invoice_id;
end;
$$;

-- Void an invoice that went out, releasing its lines and extras so they can be
-- billed again. Server code only: a Stripe-issued invoice must be voided in
-- Stripe first, so this isn't callable from the browser. An unsent draft is
-- deleted instead (its claims release through the foreign keys).
create function public.invoice_void(p_invoice_id bigint)
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

  update public.tasks set invoice_id = null where invoice_id = p_invoice_id;
  update public.expenses set invoiced_on = null where invoiced_on = p_invoice_id;
  update public.invoices
     set status = 'voided', voided_at = now(), updated_at = now()
   where id = p_invoice_id;
end;
$$;

revoke execute on function public.invoice_row_ids(jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.invoice_row_ids(jsonb, text) to authenticated, service_role;
revoke execute on function public.invoice_create_from_job(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.invoice_create_from_job(jsonb) to authenticated;
revoke execute on function public.invoice_set_draft(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.invoice_set_draft(jsonb) to authenticated;
revoke execute on function public.invoice_void(bigint) from public, anon, authenticated, service_role;
grant execute on function public.invoice_void(bigint) to service_role;

-- 7. Nothing goes out with an unpriced line, or out of step with its claims ------
-- An invoice leaves draft (sent, paid, or issued through Stripe) only when no
-- billable line on its job is still waiting for a price, and when its rows
-- bill exactly the lines and extras it claims, each once. The second check is
-- a backstop: the triggers in section 10 keep drafts in step.
create function public.invoices_guard_send()
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
         is distinct from (select array_agg(id order by id) from public.expenses where invoiced_on = new.id) then
      raise exception 'Invoice %''s lines no longer match the job. Reload the draft, check it and save it, then send.',
        new.invoice_number using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.invoices_guard_send() from public, anon, authenticated, service_role;

create trigger invoices_guard_send
  before update on public.invoices
  for each row execute function public.invoices_guard_send();

-- 8. Deleting a draft releases its lines ---------------------------------------------
-- The foreign key clears tasks.invoice_id once the draft row is gone; the
-- v095 guard now allows exactly that (the claim's invoice no longer exists).
create or replace function public.tasks_guard_billing()
  returns trigger
  language plpgsql
  set search_path = public
as $$
declare
  v_invoice text;
begin
  if tg_op <> 'DELETE'
     and auth.uid() is not null
     and current_setting('field.task_claim', true) is distinct from 'on'
     and (case when tg_op = 'INSERT' then new.invoice_id is not null
               else new.invoice_id is distinct from old.invoice_id end)
     and not (tg_op = 'UPDATE' and new.invoice_id is null
              and not exists (select 1 from public.invoices where id = old.invoice_id)) then
    raise exception 'Lines are added to invoices from the invoice, not edited directly.'
      using errcode = '42501';
  end if;

  if tg_op in ('UPDATE', 'DELETE') and old.invoice_id is not null then
    select coalesce(invoice_number, 'an invoice') into v_invoice
    from public.invoices
    where id = old.invoice_id
      and status <> 'voided'
      and (status <> 'draft' or stripe_invoice_id is not null);
    if found then
      if tg_op = 'DELETE' then
        raise exception '"%" is on invoice %, which went out. Void the invoice to remove it.', old.title, v_invoice
          using errcode = '42501';
      end if;
      if (new.qty, new.unit, new.unit_price, new.billable, new.service_id)
         is distinct from (old.qty, old.unit, old.unit_price, old.billable, old.service_id) then
        raise exception 'This line is on invoice %, which went out; its price is final.', v_invoice
          using errcode = '42501';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- An invoice that went out is voided, never deleted (the app already said so;
-- now the database does). Server maintenance (no signed-in user) is exempt.
create function public.invoices_guard_delete()
  returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  if auth.uid() is not null and (old.status <> 'draft' or old.stripe_invoice_id is not null) then
    raise exception 'Invoice % went out; void it instead of deleting it.', old.invoice_number
      using errcode = '42501';
  end if;
  return old;
end;
$$;

revoke execute on function public.invoices_guard_delete() from public, anon, authenticated, service_role;

create trigger invoices_guard_delete
  before delete on public.invoices
  for each row execute function public.invoices_guard_delete();

-- 10. Drafts follow their lines; what went out stays put ------------------------------
-- A line or extra that stops belonging on an unsent draft leaves it: deleted,
-- marked not billable, its price cleared, moved to another job, or (extras)
-- moved out of job extras. Its row comes off the draft and the totals are
-- recomputed, the same way the app computes them. The claim RPCs write their
-- own rows, so they're skipped (field.task_claim).

-- After a claim is released or its line deleted: drop that line's row from
-- the unsent draft and recompute the totals. tg_argv: the row key
-- (task_id / extra_expense_id), then the claim column (invoice_id / invoiced_on).
create function public.drafts_follow_lines()
  returns trigger
  language plpgsql
  set search_path = public
as $$
declare
  v_old jsonb := to_jsonb(old);
  v_invoice_id bigint := (v_old->>tg_argv[1])::bigint;
  v_key text := tg_argv[0];
  v_id text := v_old->>'id';
begin
  if current_setting('field.task_claim', true) = 'on' then
    return null;
  end if;
  update public.invoices i
     set line_items = kept.items,
         subtotal_cents = kept.sub,
         tax_cents = round(kept.sub * i.tax_rate_pct / 100)::integer,
         total_cents = kept.sub + round(kept.sub * i.tax_rate_pct / 100)::integer,
         updated_at = now()
    from (select coalesce(jsonb_agg(e.v order by e.n), '[]'::jsonb) as items,
                 coalesce(sum(round((e.v->>'amount')::numeric * 100)), 0)::integer as sub
            from public.invoices i2
           cross join lateral jsonb_array_elements(i2.line_items) with ordinality as e(v, n)
           where i2.id = v_invoice_id
             and (e.v->>v_key) is distinct from v_id) kept
   where i.id = v_invoice_id
     and i.status = 'draft' and i.stripe_invoice_id is null
     and exists (select 1 from jsonb_array_elements(i.line_items) e where e->>v_key = v_id);
  return null;
end;
$$;

-- Runs after tasks_guard_billing (triggers fire in name order), which already
-- refuses these edits on a line whose invoice went out.
create function public.tasks_leave_draft()
  returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  if old.invoice_id is not null and new.invoice_id is not distinct from old.invoice_id
     and (not new.billable or new.unit_price is null or new.job_id is distinct from old.job_id)
     and exists (select 1 from public.invoices
                  where id = old.invoice_id and status = 'draft' and stripe_invoice_id is null) then
    new.invoice_id := null;
  end if;
  return new;
end;
$$;

-- Extras: an extra on an invoice that went out can't be released except by
-- voiding (the app's check, now the database's too). On an unsent draft,
-- moving it off the job or out of extras releases it.
create function public.expenses_guard_billing()
  returns trigger
  language plpgsql
  set search_path = public
as $$
declare
  v_invoice text;
begin
  if old.invoiced_on is null then
    return new;
  end if;
  if new.invoiced_on is distinct from old.invoiced_on and auth.uid() is not null then
    select coalesce(invoice_number, 'an invoice') into v_invoice from public.invoices
     where id = old.invoiced_on and status <> 'voided' and (status <> 'draft' or stripe_invoice_id is not null);
    if found then
      raise exception 'This extra is on invoice %, which went out. Void the invoice to bill it again.', v_invoice
        using errcode = '42501';
    end if;
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

-- An invoice that went out keeps its money: no going back to draft, no edits
-- to its rows or totals, and voiding only through the app (so Stripe's link
-- dies first and its lines are released). A void stays void. Server code
-- (no signed-in user: the Stripe webhook, invoice_void) is exempt.
create function public.invoices_guard_final()
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
           old.stripe_invoice_id, old.billing_entity_id, old.invoice_number, old.job_id) then
      raise exception 'Invoice % went out; its lines and totals are final. Void it and re-invoice to change them.',
        old.invoice_number using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.drafts_follow_lines() from public, anon, authenticated, service_role;
revoke execute on function public.tasks_leave_draft() from public, anon, authenticated, service_role;
revoke execute on function public.expenses_guard_billing() from public, anon, authenticated, service_role;
revoke execute on function public.invoices_guard_final() from public, anon, authenticated, service_role;

create trigger tasks_leave_draft
  before update on public.tasks
  for each row execute function public.tasks_leave_draft();
create trigger tasks_follow_draft
  after update on public.tasks
  for each row when (old.invoice_id is not null and new.invoice_id is distinct from old.invoice_id)
  execute function public.drafts_follow_lines('task_id', 'invoice_id');
create trigger tasks_follow_draft_on_delete
  after delete on public.tasks
  for each row when (old.invoice_id is not null)
  execute function public.drafts_follow_lines('task_id', 'invoice_id');
create trigger expenses_guard_billing
  before update on public.expenses
  for each row execute function public.expenses_guard_billing();
create trigger expenses_follow_draft
  after update on public.expenses
  for each row when (old.invoiced_on is not null and new.invoiced_on is distinct from old.invoiced_on)
  execute function public.drafts_follow_lines('extra_expense_id', 'invoiced_on');
create trigger expenses_follow_draft_on_delete
  after delete on public.expenses
  for each row when (old.invoiced_on is not null)
  execute function public.drafts_follow_lines('extra_expense_id', 'invoiced_on');
create trigger invoices_guard_final
  before update on public.invoices
  for each row execute function public.invoices_guard_final();

-- 9. Approved data change (Dallin, 2026-10-13): contact 58 carries its
-- company in the address field. Move it to company, clear the address and
-- flag the contact as a property manager. No-op anywhere else.
update public.contacts
   set company = address, address = null, is_property_manager = true
 where id = 58 and client_id = 1 and address = 'Vista Ventures Realty LLC';
