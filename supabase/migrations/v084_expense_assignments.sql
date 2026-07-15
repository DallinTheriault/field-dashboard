-- v0.8.4 — Expenses handoff 3: item assignment model + scan metering
--
-- Architect rulings 2026-07-15 (Q1–Q4). The existing header+lines pair
-- (purchases = receipt header, expenses = line items) IS the spec's data
-- model with inverted names — extended in place, no parallel system.
-- purchases had 0 rows and the receipts bucket 0 objects at migration
-- time, so the header reshape touches nothing real.
--
-- expenses.assignment — the four-way item model (+unassigned):
--   job_in_bid   bid covered it        -> job cost,  never invoiced
--   job_extra    genuinely additional  -> job cost,  invoiced AT COST
--   job_internal eaten cost at a job   -> job cost,  never invoiced
--   stock        company keeps it      -> company expense only
-- invoiced_on stamps a job_extra item with the invoice that includes it
-- (Q1 refinement): makes "already invoiced" blocking-warnings reliable
-- and lets the job page surface uninvoiced extras (the real money leak).
--
-- receipt_scans is a billing meter: SELECT for tenant members, NO write
-- policies — only the service role (scan route) writes it, success or
-- failure. Deliberate deviation from the standard RLS pair so a client
-- can never forge or erase meter rows.
--
-- Backfill (Q3 approved): the 7 existing job-assigned rows -> job_in_bid
-- (logged actuals under accepted fixed bids, never separately invoiced).
--
-- Rollback:
--   ALTER TABLE public."Clients" DROP COLUMN IF EXISTS feature_receipt_ai_enabled;
--   DROP TABLE IF EXISTS public.receipt_scans;
--   ALTER TABLE public.expenses
--     DROP CONSTRAINT IF EXISTS expenses_job_assignment_chk,
--     DROP COLUMN IF EXISTS sku, DROP COLUMN IF EXISTS unit_price,
--     DROP COLUMN IF EXISTS assignment, DROP COLUMN IF EXISTS customer_notified,
--     DROP COLUMN IF EXISTS stock_category, DROP COLUMN IF EXISTS invoiced_on;
--   ALTER TABLE public.purchases
--     DROP COLUMN IF EXISTS subtotal, DROP COLUMN IF EXISTS tax,
--     DROP COLUMN IF EXISTS total, DROP COLUMN IF EXISTS source,
--     DROP COLUMN IF EXISTS receipt_paths;

-- Receipt header (spec §5.1, adapted names; money = numeric dollars per Q4)
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS subtotal numeric,
  ADD COLUMN IF NOT EXISTS tax numeric,
  ADD COLUMN IF NOT EXISTS total numeric,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('scan', 'manual')),
  ADD COLUMN IF NOT EXISTS receipt_paths text[] NOT NULL DEFAULT '{}';
-- Fold the legacy single path into the array (no rows today; safe forever).
UPDATE public.purchases
  SET receipt_paths = ARRAY[receipt_path]
  WHERE receipt_path IS NOT NULL AND receipt_paths = '{}';

-- Line items (spec §5.2, adapted names)
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS unit_price numeric,
  ADD COLUMN IF NOT EXISTS assignment text NOT NULL DEFAULT 'unassigned'
    CHECK (assignment IN ('unassigned', 'job_in_bid', 'job_extra', 'job_internal', 'stock')),
  ADD COLUMN IF NOT EXISTS customer_notified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stock_category text,
  ADD COLUMN IF NOT EXISTS invoiced_on bigint REFERENCES public.invoices(id) ON DELETE SET NULL;
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_job_assignment_chk;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_job_assignment_chk
  CHECK (assignment NOT IN ('job_in_bid', 'job_extra', 'job_internal') OR job_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_expenses_assignment ON public.expenses(assignment);
CREATE INDEX IF NOT EXISTS idx_expenses_invoiced_on ON public.expenses(invoiced_on);

-- Q3 backfill: existing job-logged actuals are bid-covered materials.
UPDATE public.expenses
  SET assignment = 'job_in_bid'
  WHERE job_id IS NOT NULL AND assignment = 'unassigned';

-- Scan meter (spec §5.3) — service-role writes only
CREATE TABLE IF NOT EXISTS public.receipt_scans (
  id            bigserial PRIMARY KEY,
  client_id     bigint NOT NULL REFERENCES public."Clients"(id) ON DELETE CASCADE,
  purchase_id   bigint REFERENCES public.purchases(id) ON DELETE SET NULL,
  model         text NOT NULL,
  input_tokens  integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  status        text NOT NULL CHECK (status IN ('ok', 'parse_failed', 'rejected')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_receipt_scans_client ON public.receipt_scans(client_id);
ALTER TABLE public.receipt_scans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.receipt_scans FROM anon;
DROP POLICY IF EXISTS receipt_scans_select ON public.receipt_scans;
CREATE POLICY receipt_scans_select ON public.receipt_scans FOR SELECT
  USING (client_id IN (SELECT public.current_user_client_ids()));
-- no insert/update/delete policies on purpose (see header)

-- Entitlement (spec §8.1) — default OFF everywhere
ALTER TABLE public."Clients"
  ADD COLUMN IF NOT EXISTS feature_receipt_ai_enabled boolean NOT NULL DEFAULT false;
