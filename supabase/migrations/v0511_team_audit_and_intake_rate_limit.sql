-- v0.5.11 — Team audit log + intake rate limiting.
-- (Identical to applied migration; kept in repo for replay against future envs.)

CREATE TABLE IF NOT EXISTS team_audit_log (
  id            bigserial PRIMARY KEY,
  client_id     bigint NOT NULL REFERENCES "Clients"(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role_at_time text NOT NULL CHECK (actor_role_at_time IN ('owner','manager','member')),
  action        text NOT NULL CHECK (action IN ('member_added','member_removed','role_changed')),
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_email  text NOT NULL,
  old_role      text CHECK (old_role IS NULL OR old_role IN ('owner','manager','member')),
  new_role      text CHECK (new_role IS NULL OR new_role IN ('owner','manager','member')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_audit_log_client_time
  ON team_audit_log (client_id, created_at DESC);

ALTER TABLE team_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY team_audit_log_select ON team_audit_log FOR SELECT
  USING (client_id IN (
    SELECT cu.client_id FROM client_users cu
    WHERE cu.auth_user_id = auth.uid() AND cu.role IN ('owner', 'manager')
  ));

CREATE TABLE IF NOT EXISTS onboard_intake_log (
  id            bigserial PRIMARY KEY,
  ip_hash       text NOT NULL,
  email         text,
  business_name text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  accepted      boolean NOT NULL DEFAULT true,
  rejection_reason text
);

CREATE INDEX IF NOT EXISTS idx_onboard_intake_log_ip_time
  ON onboard_intake_log (ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_onboard_intake_log_time
  ON onboard_intake_log (created_at DESC);

ALTER TABLE onboard_intake_log ENABLE ROW LEVEL SECURITY;
