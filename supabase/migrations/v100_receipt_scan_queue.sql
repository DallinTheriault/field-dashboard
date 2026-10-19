-- v100: receipts save first, scan second. Additive except one relaxed
-- constraint (purchases.vendor may be null).
--
-- The photo is saved the moment it's taken; the scan runs on its own
-- afterwards (a Netlify background function) and leaves its read on the
-- purchase for the owner to check. Nothing it reads is saved as the
-- purchase until the owner accepts it.
--
--   scan_status   null         no scan asked for (manual purchases, old rows)
--                 queued       saved, waiting for the scanner
--                 scanning     the scanner has it
--                 ready        a read is waiting in scan_result: "Check this"
--                 needs_entry  the scan failed; the photo is kept: "Needs entry"
--
-- vendor goes nullable so a failed scan never leaves a made-up vendor name
-- ("Receipt (scanning…)") on a purchase. Saving a purchase still requires
-- one (the app checks).

alter table public.purchases
  alter column vendor drop not null,
  add column scan_status text
    constraint purchases_scan_status_check
      check (scan_status is null or scan_status in ('queued', 'scanning', 'ready', 'needs_entry')),
  add column scan_result jsonb,
  add column scan_error text,
  add column scan_requested_at timestamptz,
  add column scan_finished_at timestamptz,
  add column scan_job_id bigint references public.jobs(id) on delete set null,
  add column scan_paths text[] not null default '{}';

comment on column public.purchases.scan_status is
  'Background receipt scan: queued | scanning | ready (read waiting in scan_result) | needs_entry (scan failed, photo kept). Null = no scan asked for.';
comment on column public.purchases.scan_result is
  'The latest read, as the scanner returned it ({vendor, date, subtotal, tax, total, items, check}). Not the purchase: nothing is saved from it until the owner accepts.';
comment on column public.purchases.scan_error is
  'Why the last scan failed, for support. Never shown as the vendor.';
comment on column public.purchases.scan_job_id is
  'The job the receipt was scanned from, so the check screen starts on it.';
comment on column public.purchases.scan_paths is
  'What the scanner reads, in order, when a receipt was too tall to read whole: overlapping pieces cut on the phone. Empty = read receipt_paths.';

-- Its own meter status for API failures (auth, overload, network), so they
-- no longer count as parse failures.
alter table public.receipt_scans drop constraint receipt_scans_status_check;
alter table public.receipt_scans
  add constraint receipt_scans_status_check
    check (status in ('ok', 'parse_failed', 'rejected', 'api_error'));
