-- v0.5.8 — Per-tenant SMS reply templates.
--
-- Owners save common replies ("on my way", "running 10 min late",
-- "estimate sent — let me know if you have questions") so operators can
-- insert them into the reply box with one tap. No automation logic here —
-- pure stored snippets.

CREATE TABLE IF NOT EXISTS sms_reply_templates (
  id           bigserial PRIMARY KEY,
  client_id    bigint NOT NULL REFERENCES "Clients"(id) ON DELETE CASCADE,
  label        text NOT NULL,
  body         text NOT NULL CHECK (length(body) <= 1600),
  sort_order   smallint NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  archived_at  timestamptz,
  CONSTRAINT sms_reply_templates_label_not_empty CHECK (length(trim(label)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_sms_reply_templates_client_active
  ON sms_reply_templates (client_id, sort_order)
  WHERE archived_at IS NULL;

ALTER TABLE sms_reply_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY sms_reply_templates_select
  ON sms_reply_templates FOR SELECT
  USING (client_id IN (SELECT public.current_user_client_ids()));

CREATE POLICY sms_reply_templates_write
  ON sms_reply_templates FOR ALL
  USING (
    client_id IN (
      SELECT cu.client_id FROM client_users cu
      WHERE cu.auth_user_id = auth.uid() AND cu.role IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    client_id IN (
      SELECT cu.client_id FROM client_users cu
      WHERE cu.auth_user_id = auth.uid() AND cu.role IN ('owner', 'manager')
    )
  );

CREATE OR REPLACE FUNCTION set_updated_at_sms_reply_templates()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS sms_reply_templates_set_updated_at ON sms_reply_templates;
CREATE TRIGGER sms_reply_templates_set_updated_at
  BEFORE UPDATE ON sms_reply_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_sms_reply_templates();
