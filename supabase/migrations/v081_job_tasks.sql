-- v0.8.1 — Job tasks with photos (handoff 2)
--
-- Tasks belong to the JOB (never an estimate): scoping list during the
-- walkthrough, traceability for estimate lines, punch list during the work.
-- Deliberately minimal: two statuses, no assignee/priority/due date.
--
-- task_photos.client_id is denormalized so RLS runs directly on the table.
-- Photos live in the PRIVATE job-photos bucket — same convention as
-- receipts (v076): no storage.objects policies; all access goes through
-- authenticated API routes (service role + tenant check, signed URLs).
--
-- estimate_line_items.task_id: ON DELETE SET NULL — deleting a task must
-- never delete pricing.
--
-- Rollback:
--   ALTER TABLE public.estimate_line_items DROP COLUMN IF EXISTS task_id;
--   DROP TABLE IF EXISTS public.task_photos;
--   DROP TABLE IF EXISTS public.tasks;
--   -- bucket: empty it in Storage, then DELETE FROM storage.buckets WHERE id='job-photos';

CREATE TABLE IF NOT EXISTS public.tasks (
  id          bigserial PRIMARY KEY,
  client_id   bigint NOT NULL REFERENCES public."Clients"(id) ON DELETE CASCADE,
  job_id      bigint NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  title       text NOT NULL,
  note        text,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tasks_job ON public.tasks(job_id);
CREATE INDEX IF NOT EXISTS idx_tasks_client ON public.tasks(client_id);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tasks FROM anon;

DROP POLICY IF EXISTS tasks_select ON public.tasks;
CREATE POLICY tasks_select ON public.tasks FOR SELECT
  USING (client_id IN (SELECT public.current_user_client_ids()));
DROP POLICY IF EXISTS tasks_insert ON public.tasks;
CREATE POLICY tasks_insert ON public.tasks FOR INSERT
  WITH CHECK (public.user_can_write_client(client_id));
DROP POLICY IF EXISTS tasks_update ON public.tasks;
CREATE POLICY tasks_update ON public.tasks FOR UPDATE
  USING (public.user_can_write_client(client_id))
  WITH CHECK (public.user_can_write_client(client_id));
DROP POLICY IF EXISTS tasks_delete ON public.tasks;
CREATE POLICY tasks_delete ON public.tasks FOR DELETE
  USING (public.user_can_write_client(client_id));

CREATE TABLE IF NOT EXISTS public.task_photos (
  id            bigserial PRIMARY KEY,
  client_id     bigint NOT NULL REFERENCES public."Clients"(id) ON DELETE CASCADE,
  task_id       bigint NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  storage_path  text NOT NULL,
  caption       text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_photos_task ON public.task_photos(task_id);
CREATE INDEX IF NOT EXISTS idx_task_photos_client ON public.task_photos(client_id);

ALTER TABLE public.task_photos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.task_photos FROM anon;

DROP POLICY IF EXISTS task_photos_select ON public.task_photos;
CREATE POLICY task_photos_select ON public.task_photos FOR SELECT
  USING (client_id IN (SELECT public.current_user_client_ids()));
DROP POLICY IF EXISTS task_photos_insert ON public.task_photos;
CREATE POLICY task_photos_insert ON public.task_photos FOR INSERT
  WITH CHECK (public.user_can_write_client(client_id));
DROP POLICY IF EXISTS task_photos_update ON public.task_photos;
CREATE POLICY task_photos_update ON public.task_photos FOR UPDATE
  USING (public.user_can_write_client(client_id))
  WITH CHECK (public.user_can_write_client(client_id));
DROP POLICY IF EXISTS task_photos_delete ON public.task_photos;
CREATE POLICY task_photos_delete ON public.task_photos FOR DELETE
  USING (public.user_can_write_client(client_id));

ALTER TABLE public.estimate_line_items
  ADD COLUMN IF NOT EXISTS task_id bigint REFERENCES public.tasks(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_estimate_line_items_task ON public.estimate_line_items(task_id);

INSERT INTO storage.buckets (id, name, public)
VALUES ('job-photos', 'job-photos', false)
ON CONFLICT (id) DO NOTHING;
