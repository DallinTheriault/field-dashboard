-- v0.7.9 — One source of truth for money out (M-money unification)
--
-- Status: applied to production via Supabase MCP. Repo copy for history.
--
-- Before: job material actuals lived in actual_materials and business
-- expenses in expenses — the Money page glued them together as one
-- anonymous "Job materials" lump. Now every dollar out is an EXPENSE LINE:
--   - optional job_id  → job-assigned (feeds job variance) — no job = Stock
--   - optional qty     → "2 × $5.98" display; amount stays the line TOTAL
--   - optional purchase_id → lines bought together on one receipt
--
-- purchases groups a multi-item receipt (vendor + date + receipt image).
-- Existing actual_materials rows are copied into expenses (idempotent);
-- the old table stays but nothing reads or writes it anymore.

CREATE TABLE IF NOT EXISTS public.purchases (
  id            bigserial PRIMARY KEY,
  client_id     bigint NOT NULL REFERENCES public."Clients"(id) ON DELETE CASCADE,
  vendor        text NOT NULL,
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  receipt_path  text,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_purchases_client ON public.purchases(client_id);
CREATE INDEX IF NOT EXISTS idx_purchases_created_by ON public.purchases(created_by);

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.purchases FROM anon;

DROP POLICY IF EXISTS purchases_select ON public.purchases;
CREATE POLICY purchases_select ON public.purchases FOR SELECT
  USING (client_id IN (SELECT public.current_user_client_ids()));
DROP POLICY IF EXISTS purchases_insert ON public.purchases;
CREATE POLICY purchases_insert ON public.purchases FOR INSERT
  WITH CHECK (public.user_can_write_client(client_id));
DROP POLICY IF EXISTS purchases_update ON public.purchases;
CREATE POLICY purchases_update ON public.purchases FOR UPDATE
  USING (public.user_can_write_client(client_id))
  WITH CHECK (public.user_can_write_client(client_id));
DROP POLICY IF EXISTS purchases_delete ON public.purchases;
CREATE POLICY purchases_delete ON public.purchases FOR DELETE
  USING (public.user_can_write_client(client_id));

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS qty numeric CHECK (qty IS NULL OR qty > 0),
  ADD COLUMN IF NOT EXISTS purchase_id bigint REFERENCES public.purchases(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_expenses_purchase ON public.expenses(purchase_id);

-- One-time copy of job material actuals into the unified table. Idempotent:
-- skips rows already copied (matched on the immutable created_at + identity).
INSERT INTO public.expenses
  (client_id, expense_date, category, description, amount, qty, job_id, created_by, created_at)
SELECT
  am.client_id,
  am.created_at::date,
  'Materials & supplies',
  am.description,
  am.actual_cost,
  am.qty,
  am.job_id,
  am.created_by,
  am.created_at
FROM public.actual_materials am
WHERE NOT EXISTS (
  SELECT 1 FROM public.expenses e
  WHERE e.client_id = am.client_id
    AND e.job_id IS NOT DISTINCT FROM am.job_id
    AND e.description = am.description
    AND e.amount = am.actual_cost
    AND e.created_at = am.created_at
);
