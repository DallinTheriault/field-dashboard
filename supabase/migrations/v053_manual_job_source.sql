-- v0.5.3 — Allow 'manual' as a job source
--
-- The Jobs page now has an "Add job" button that creates jobs from the
-- dashboard (vs the existing 'phone-call' source from VAPI). Add 'manual'
-- to the source check, plus 'sms' (forward-looking for v0.5.4 templated
-- outbound that auto-creates jobs from inbound texts) and 'web-form' (which
-- WF6 already uses but was never added to the constraint).

BEGIN;

-- Existing source values seen in production: 'phone-call' (VAPI), 'web-form'
-- (WF6 webhook). Now adding 'manual' (this dashboard ship) and 'sms'
-- (planned). Constraint replaced wholesale to keep the list explicit.

DO $$
BEGIN
  -- Only enforce a check if there isn't one yet, but if there is, replace.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jobs_source_check' AND conrelid = 'public.jobs'::regclass
  ) THEN
    ALTER TABLE jobs DROP CONSTRAINT jobs_source_check;
  END IF;
END $$;

ALTER TABLE jobs ADD CONSTRAINT jobs_source_check
  CHECK (
    source IS NULL
    OR source = ANY (ARRAY[
      'phone-call'::text,
      'web-form'::text,
      'manual'::text,
      'sms'::text
    ])
  );

COMMIT;
