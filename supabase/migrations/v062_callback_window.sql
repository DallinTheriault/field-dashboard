-- v062_callback_window
-- Per-client callback-window wording, templated into n8n tool responses + SMS
-- bodies (WF2/4/6/8/9). Default 'within the hour' for new/demo tenants.
-- Sharpline keeps its existing "within one business day" promise so its
-- customer-facing wording is unchanged.
--
-- Applied to remote via Supabase MCP apply_migration on 2026-06-09.
-- NOTE: local supabase/migrations is known out-of-sync with remote (~12 local
-- vs ~90 applied); this file exists for git history. Reconcile via `db pull`
-- is a separate roadmap task.

ALTER TABLE public."Clients"
  ADD COLUMN IF NOT EXISTS callback_window text NOT NULL DEFAULT 'within the hour';

UPDATE public."Clients" SET callback_window = 'within one business day' WHERE id = 1;  -- Sharpline (real tenant)
UPDATE public."Clients" SET callback_window = 'within the hour'        WHERE id = 8;  -- Cascade (demo tenant)
