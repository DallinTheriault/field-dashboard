-- Slice 4 setup at v096: data shaped like prod before v097.
-- Tenant 9's letterhead moves out of the way so Sharpline's can keep prod's
-- ids (v097's data change targets ids 2 and 3).
update public.billing_entities set id = 10 where client_id = 9 and invoice_prefix = 'OTH';
insert into public."Clients" (id, business_name, business_short_name, owner_email, timezone, is_test,
  feature_estimator_enabled, feature_billing_enabled)
values (1, 'Sharpline (local copy)', 'Sharpline', 'owner@sharpline.test', 'America/Denver', true, true, false);
insert into public.billing_entities (id, client_id, name, invoice_prefix, is_default, active)
values (2, 1, 'Sharpline Painting Co.', 'SPC', true, true),
       (3, 1, 'Theriault Property Services LLC', 'TPS', false, true);
select setval(pg_get_serial_sequence('public.billing_entities', 'id'), 10);

-- Paid before payments existed: one marked paid by hand at 9 PM Mountain
-- (already the next day in UTC), one paid through Stripe.
insert into public.invoices (client_id, billing_entity_id, invoice_number, customer_name, line_items,
  subtotal_cents, total_cents, status, sent_at, paid_at, stripe_invoice_id)
values
  (1, 2, 'SPC-2026-002', 'Josh Ellis', '[{"description":"Paint","amount":1726.36}]', 172636, 172636,
   'paid', null, '2026-07-16 03:00:00+00', null),
  (1, 3, 'TPS-2026-001', 'Subash', '[{"description":"Patch","amount":435}]', 43500, 43500,
   'paid', '2026-07-15 15:00:00+00', '2026-07-15 18:30:00+00', 'in_test_backfill');
