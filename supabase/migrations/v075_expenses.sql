-- v0.7.5 — Business expenses (tax P&L)
--
-- Status: applied to production via Supabase MCP. Repo copy for history.
--
-- One place for tax season: logged expenses + logged job materials
-- (actual_materials) as the cost side, paid estimator invoices as the
-- income side. Categories align loosely with Schedule C lines; they're
-- plain text so the UI list can evolve without migrations.

CREATE TABLE IF NOT EXISTS public.expenses (
  id           bigserial PRIMARY KEY,
  client_id    bigint NOT NULL REFERENCES public."Clients"(id) ON DELETE CASCADE,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  category     text NOT NULL,
  description  text NOT NULL,
  amount       numeric NOT NULL CHECK (amount >= 0),
  -- Optional job attribution (not surfaced in v1 UI; job materials already
  -- flow in from actual_materials).
  job_id       bigint REFERENCES public.jobs(id) ON DELETE SET NULL,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expenses_client ON public.expenses(client_id);
CREATE INDEX IF NOT EXISTS idx_expenses_client_date ON public.expenses(client_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_job ON public.expenses(job_id);
CREATE INDEX IF NOT EXISTS idx_expenses_created_by ON public.expenses(created_by);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.expenses FROM anon;

DROP POLICY IF EXISTS expenses_select ON public.expenses;
CREATE POLICY expenses_select ON public.expenses FOR SELECT
  USING (client_id IN (SELECT public.current_user_client_ids()));
DROP POLICY IF EXISTS expenses_insert ON public.expenses;
CREATE POLICY expenses_insert ON public.expenses FOR INSERT
  WITH CHECK (public.user_can_write_client(client_id));
DROP POLICY IF EXISTS expenses_update ON public.expenses;
CREATE POLICY expenses_update ON public.expenses FOR UPDATE
  USING (public.user_can_write_client(client_id))
  WITH CHECK (public.user_can_write_client(client_id));
DROP POLICY IF EXISTS expenses_delete ON public.expenses;
CREATE POLICY expenses_delete ON public.expenses FOR DELETE
  USING (public.user_can_write_client(client_id));
