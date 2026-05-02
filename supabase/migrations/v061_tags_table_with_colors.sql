-- v0.6.1 — First-class tags table with colors
--
-- Status: ALREADY APPLIED to production via Supabase MCP.
-- This file exists for repo history; running again is safe (IF NOT EXISTS guards).

CREATE TABLE IF NOT EXISTS public.tags (
  id          bigserial PRIMARY KEY,
  client_id   bigint NOT NULL REFERENCES public."Clients"(id) ON DELETE CASCADE,
  name        text NOT NULL,
  color_hex   text NOT NULL CHECK (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  use_count   integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT tags_unique_name_per_client UNIQUE (client_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tags_client ON public.tags(client_id);
CREATE INDEX IF NOT EXISTS idx_tags_use_count ON public.tags(client_id, use_count DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS public.job_tags (
  job_id      bigint NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  tag_id      bigint NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  client_id   bigint NOT NULL REFERENCES public."Clients"(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_job_tags_tag ON public.job_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_job_tags_client ON public.job_tags(client_id);

CREATE TABLE IF NOT EXISTS public.contact_tags (
  contact_id  bigint NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  tag_id      bigint NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  client_id   bigint NOT NULL REFERENCES public."Clients"(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contact_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_tags_tag ON public.contact_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_contact_tags_client ON public.contact_tags(client_id);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY tags_tenant_select ON public.tags FOR SELECT
  USING (client_id IN (SELECT public.current_user_client_ids()));
CREATE POLICY tags_tenant_insert ON public.tags FOR INSERT
  WITH CHECK (client_id IN (SELECT public.current_user_client_ids()));
CREATE POLICY tags_tenant_update ON public.tags FOR UPDATE
  USING (client_id IN (SELECT public.current_user_client_ids()))
  WITH CHECK (client_id IN (SELECT public.current_user_client_ids()));
CREATE POLICY tags_tenant_delete ON public.tags FOR DELETE
  USING (client_id IN (SELECT public.current_user_client_ids()));

CREATE POLICY job_tags_tenant_select ON public.job_tags FOR SELECT
  USING (client_id IN (SELECT public.current_user_client_ids()));
CREATE POLICY job_tags_tenant_insert ON public.job_tags FOR INSERT
  WITH CHECK (client_id IN (SELECT public.current_user_client_ids()));
CREATE POLICY job_tags_tenant_delete ON public.job_tags FOR DELETE
  USING (client_id IN (SELECT public.current_user_client_ids()));

CREATE POLICY contact_tags_tenant_select ON public.contact_tags FOR SELECT
  USING (client_id IN (SELECT public.current_user_client_ids()));
CREATE POLICY contact_tags_tenant_insert ON public.contact_tags FOR INSERT
  WITH CHECK (client_id IN (SELECT public.current_user_client_ids()));
CREATE POLICY contact_tags_tenant_delete ON public.contact_tags FOR DELETE
  USING (client_id IN (SELECT public.current_user_client_ids()));

CREATE OR REPLACE FUNCTION public.tags_increment_use_count()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.tags SET use_count = use_count + 1 WHERE id = NEW.tag_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tags_decrement_use_count()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.tags SET use_count = GREATEST(use_count - 1, 0) WHERE id = OLD.tag_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_tags_inc_count ON public.job_tags;
CREATE TRIGGER trg_job_tags_inc_count AFTER INSERT ON public.job_tags
  FOR EACH ROW EXECUTE FUNCTION public.tags_increment_use_count();

DROP TRIGGER IF EXISTS trg_job_tags_dec_count ON public.job_tags;
CREATE TRIGGER trg_job_tags_dec_count AFTER DELETE ON public.job_tags
  FOR EACH ROW EXECUTE FUNCTION public.tags_decrement_use_count();

DROP TRIGGER IF EXISTS trg_contact_tags_inc_count ON public.contact_tags;
CREATE TRIGGER trg_contact_tags_inc_count AFTER INSERT ON public.contact_tags
  FOR EACH ROW EXECUTE FUNCTION public.tags_increment_use_count();

DROP TRIGGER IF EXISTS trg_contact_tags_dec_count ON public.contact_tags;
CREATE TRIGGER trg_contact_tags_dec_count AFTER DELETE ON public.contact_tags
  FOR EACH ROW EXECUTE FUNCTION public.tags_decrement_use_count();
