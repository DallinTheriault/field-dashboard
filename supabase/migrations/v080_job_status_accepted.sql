-- v0.8.0 — jobs.status gains 'accepted' (job restructure handoff 1)
--
-- Status: NOT YET APPLIED. Per the architect's sequencing note, apply only
-- AFTER the hub/nav deploy (0a60e90) is verified in production.
--
-- Architect decisions (2026-07-14): keep every existing value untouched,
-- reuse 'estimated' (no 'estimating'), add exactly one value: 'accepted'.
-- No 'invoiced' job status — invoices carry their own status (§6.3-2).
--
-- Rollback: reversible while no job rows have status='accepted'
-- (if any exist, first UPDATE public.jobs SET status='estimated' WHERE status='accepted'):
--   ALTER TABLE public.jobs DROP CONSTRAINT jobs_status_check;
--   ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_check
--     CHECK (status = ANY (ARRAY['lead'::text, 'estimated'::text, 'scheduled'::text,
--       'in_progress'::text, 'completed'::text, 'cancelled'::text,
--       'callback'::text, 'callback_complete'::text]));

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_check
  CHECK (status = ANY (ARRAY[
    'lead'::text,
    'estimated'::text,
    'accepted'::text,
    'scheduled'::text,
    'in_progress'::text,
    'completed'::text,
    'cancelled'::text,
    'callback'::text,
    'callback_complete'::text
  ]));
