-- v0.7.6 — Receipt attachments on expenses
--
-- Status: applied to production via Supabase MCP. Repo copy for history.
--
-- Receipts are tax documents, not brand assets: the bucket is PRIVATE
-- (unlike tenant-logos). All access goes through authenticated API routes
-- using the service role + tenant checks; viewing uses short-lived signed
-- URLs. No storage.objects policies on purpose — anon/authenticated have
-- no direct storage access to this bucket.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS receipt_path text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;
