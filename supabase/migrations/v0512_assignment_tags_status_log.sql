-- v0.6.0 — assignment, tags, status log, test-tenant flag.
-- See full comments in applied migration; this is for replay against future envs.

ALTER TABLE "Clients"
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_jobs_tags ON jobs USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_contacts_tags ON contacts USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_jobs_assigned_user ON jobs (assigned_user_id) WHERE assigned_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_assigned_user ON contacts (assigned_user_id) WHERE assigned_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS job_status_log (
  id          bigserial PRIMARY KEY,
  job_id      bigint NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  client_id   bigint NOT NULL REFERENCES "Clients"(id) ON DELETE CASCADE,
  old_status  text,
  new_status  text NOT NULL,
  changed_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_status_log_job_time ON job_status_log (job_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_status_log_client_time ON job_status_log (client_id, changed_at DESC);

ALTER TABLE job_status_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY job_status_log_select ON job_status_log FOR SELECT
  USING (client_id IN (SELECT public.current_user_client_ids()));

CREATE OR REPLACE FUNCTION log_job_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO job_status_log (job_id, client_id, old_status, new_status, changed_by)
    VALUES (NEW.id, NEW.client_id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jobs_log_status_change ON jobs;
CREATE TRIGGER jobs_log_status_change
  AFTER UPDATE OF status ON jobs
  FOR EACH ROW EXECUTE FUNCTION log_job_status_change();
