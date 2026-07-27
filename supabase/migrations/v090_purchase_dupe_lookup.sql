-- v090: RECEIPTS_VIEW_SPEC §5.2 — support the duplicate-candidate lookup.
-- The check runs on every scan confirm and manual purchase save: find rows in
-- the same tenant with the same date + total, then compare normalized vendor
-- in app code (the normalization rule lives in one pure helper so it can be
-- tuned against real vendor strings later).

create index if not exists idx_purchases_client_date_total
  on public.purchases (client_id, purchase_date, total);

-- =============================================================================
-- ROLLBACK:  drop index if exists public.idx_purchases_client_date_total;
-- =============================================================================
