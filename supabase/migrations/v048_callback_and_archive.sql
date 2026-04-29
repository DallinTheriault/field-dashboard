-- v0.4.8 migration
-- 1. Add 'callback' and 'callback_complete' to jobs.status enum check
-- 2. Add archived_at column for soft-delete
-- 3. Add 'callback_received' to notifications.kind check

BEGIN;

-- Drop existing status check, add new one with callback statuses
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check
  CHECK (status = ANY (ARRAY[
    'lead'::text,
    'estimated'::text,
    'scheduled'::text,
    'in_progress'::text,
    'completed'::text,
    'cancelled'::text,
    'callback'::text,
    'callback_complete'::text
  ]));

-- Soft-delete column. NULL = visible. Set to a timestamp = archived from default views.
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Index so the "exclude archived" filter is cheap
CREATE INDEX IF NOT EXISTS idx_jobs_archived_at ON jobs (archived_at) WHERE archived_at IS NULL;

-- Notifications kind for callbacks
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind = ANY (ARRAY[
    'estimate_saved'::text,
    'booking_saved'::text,
    'booking_rescheduled'::text,
    'booking_cancelled'::text,
    'message_left'::text,
    'invoice_paid'::text,
    'callback_received'::text
  ]));

-- call_summaries.outcome for callbacks
ALTER TABLE call_summaries DROP CONSTRAINT IF EXISTS call_summaries_outcome_check;
ALTER TABLE call_summaries ADD CONSTRAINT call_summaries_outcome_check
  CHECK (outcome IS NULL OR (outcome = ANY (ARRAY[
    'estimate_saved'::text,
    'booking_saved'::text,
    'booking_rescheduled'::text,
    'booking_cancelled'::text,
    'message_left'::text,
    'callback_received'::text,
    'no_action'::text,
    'transferred'::text,
    'dropped'::text,
    'error'::text
  ])));

-- call_summaries.intent for callbacks
ALTER TABLE call_summaries DROP CONSTRAINT IF EXISTS call_summaries_intent_check;
ALTER TABLE call_summaries ADD CONSTRAINT call_summaries_intent_check
  CHECK (intent IS NULL OR (intent = ANY (ARRAY[
    'estimate'::text,
    'booking'::text,
    'message'::text,
    'callback'::text,
    'inquiry'::text,
    'other'::text,
    'unknown'::text
  ])));

COMMIT;
