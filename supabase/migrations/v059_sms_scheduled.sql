-- v0.5.9 — Scheduled outbound SMS (manual scheduling only).
-- See full comments in the applied migration; this file is for record-keeping
-- and replay against future Supabase environments.

CREATE TABLE IF NOT EXISTS sms_scheduled (
  id              bigserial PRIMARY KEY,
  client_id       bigint NOT NULL REFERENCES "Clients"(id) ON DELETE CASCADE,
  thread_id       bigint NOT NULL REFERENCES sms_threads(id) ON DELETE CASCADE,
  tenant_phone    text NOT NULL,
  contact_phone   text NOT NULL,
  body            text NOT NULL CHECK (length(body) > 0 AND length(body) <= 1600),
  scheduled_for   timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'sent', 'failed', 'cancelled', 'skipped_opted_out')
  ),
  scheduled_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at         timestamptz,
  twilio_message_sid text UNIQUE,
  error_code      text,
  error_message   text,
  cancelled_at    timestamptz,
  cancelled_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sms_scheduled_future_send
    CHECK (scheduled_for > created_at - interval '1 minute')
);

CREATE INDEX IF NOT EXISTS idx_sms_scheduled_due
  ON sms_scheduled (scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_sms_scheduled_thread_pending
  ON sms_scheduled (thread_id, scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_sms_scheduled_client_status
  ON sms_scheduled (client_id, status, scheduled_for);

ALTER TABLE sms_scheduled ENABLE ROW LEVEL SECURITY;

CREATE POLICY sms_scheduled_select ON sms_scheduled FOR SELECT
  USING (client_id IN (SELECT public.current_user_client_ids()));
CREATE POLICY sms_scheduled_insert ON sms_scheduled FOR INSERT
  WITH CHECK (client_id IN (
    SELECT cu.client_id FROM client_users cu
    WHERE cu.auth_user_id = auth.uid() AND cu.role IN ('owner', 'manager')
  ));
CREATE POLICY sms_scheduled_update ON sms_scheduled FOR UPDATE
  USING (client_id IN (
    SELECT cu.client_id FROM client_users cu
    WHERE cu.auth_user_id = auth.uid() AND cu.role IN ('owner', 'manager')
  ))
  WITH CHECK (client_id IN (
    SELECT cu.client_id FROM client_users cu
    WHERE cu.auth_user_id = auth.uid() AND cu.role IN ('owner', 'manager')
  ));

CREATE OR REPLACE FUNCTION set_updated_at_sms_scheduled()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS sms_scheduled_set_updated_at ON sms_scheduled;
CREATE TRIGGER sms_scheduled_set_updated_at
  BEFORE UPDATE ON sms_scheduled
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_sms_scheduled();
