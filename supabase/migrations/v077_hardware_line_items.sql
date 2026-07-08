-- v0.7.7 — Hardware line items on estimates
--
-- Status: applied to production via Supabase MCP. Repo copy for history.
--
-- A line can now be a hardware part (unit cost + optional SKU) instead of
-- hourly labor — so the owner stops fudging hours to fold a $159 door lock
-- into the price (which also poisoned Insights, since fake hours got
-- attributed to catalog rates). Everything the reprice/edit paths need to
-- reconstruct the line lives ON the line — no material-row join.
--
--   is_hardware      true = priced from unit cost, not hours
--   sku              model / SKU (free text, optional)
--   resolved_unit_price   frozen per-unit cost at save time
--   hardware_markup  true = marked up by job margin; false = passed
--                    through at cost (margin only on the rest of the job)

ALTER TABLE public.estimate_line_items
  ADD COLUMN IF NOT EXISTS is_hardware boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS resolved_unit_price numeric,
  ADD COLUMN IF NOT EXISTS hardware_markup boolean;
