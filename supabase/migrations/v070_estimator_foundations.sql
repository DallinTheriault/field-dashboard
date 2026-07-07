-- v0.7.0 — Estimator foundations (M-A of the estimator→Field port)
--
-- Status: applied to production via Supabase MCP (apply_migration
-- 'v070_estimator_foundations'). This file exists for repo history;
-- re-running is safe (IF NOT EXISTS guards).
--
-- Adds the tenant-scoped estimating + invoicing schema per
-- docs/ESTIMATOR_INTEGRATION_KICKOFF.md §6.2/§6.3 (decisions confirmed
-- 2026-07-06): billing_entities (multi-DBA letterhead under one tenant),
-- settings layer, estimates with frozen snapshots attached to jobs,
-- actuals logging, invoices extension, feature_estimator_enabled flag.
--
-- Snapshot Rule: estimate rows carry resolved_* copies of every input they
-- were priced with. Settings changes must never mutate a saved estimate.

-- ---------------------------------------------------------------------------
-- Feature flag (mirrors v061 feature_* pattern)
-- ---------------------------------------------------------------------------
ALTER TABLE public."Clients"
  ADD COLUMN IF NOT EXISTS feature_estimator_enabled boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public."Clients".feature_estimator_enabled IS
  'Show Estimator pages (settings, estimate builder, insights). Admin-toggled per tenant.';

-- ---------------------------------------------------------------------------
-- Settings layer
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_entities (
  id                   bigserial PRIMARY KEY,
  client_id            bigint NOT NULL REFERENCES public."Clients"(id) ON DELETE CASCADE,
  name                 text NOT NULL,
  logo_path            text,
  license_number       text,
  address              text,
  phone                text,
  email                text,
  payment_instructions text,
  invoice_prefix       text NOT NULL CHECK (invoice_prefix ~ '^[A-Z0-9]{1,8}$'),
  default_footer_text  text,
  is_default           boolean NOT NULL DEFAULT false,
  active               boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_entities_prefix_per_client UNIQUE (client_id, invoice_prefix)
);
COMMENT ON TABLE public.billing_entities IS
  'Letterheads a tenant can estimate/invoice under (e.g. an LLC + its DBA). One tenant, many entities — never split DBAs into separate tenants.';
CREATE UNIQUE INDEX IF NOT EXISTS billing_entities_one_default_per_client
  ON public.billing_entities(client_id) WHERE is_default;
CREATE INDEX IF NOT EXISTS idx_billing_entities_client ON public.billing_entities(client_id);

CREATE TABLE IF NOT EXISTS public.pricing_settings (
  client_id                bigint PRIMARY KEY REFERENCES public."Clients"(id) ON DELETE CASCADE,
  desired_annual_owner_pay numeric NOT NULL DEFAULT 0 CHECK (desired_annual_owner_pay >= 0),
  hours_worked_per_week    numeric NOT NULL DEFAULT 40 CHECK (hours_worked_per_week > 0),
  utilization_pct          numeric NOT NULL DEFAULT 0.55 CHECK (utilization_pct > 0 AND utilization_pct <= 1),
  margin_pct               numeric NOT NULL DEFAULT 0.40 CHECK (margin_pct >= 0 AND margin_pct < 1),
  material_markup_pct      numeric NOT NULL DEFAULT 0 CHECK (material_markup_pct >= 0),
  minimum_job_charge       numeric NOT NULL DEFAULT 150 CHECK (minimum_job_charge >= 0),
  rounding_increment       numeric NOT NULL DEFAULT 5 CHECK (rounding_increment > 0),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.pricing_settings IS
  'One row per tenant. Loaded rate is DERIVED: (pay/12 + monthly overhead) / (hrs/wk × 52/12 × utilization). Margin math: price = cost / (1 − margin), never cost × (1 + margin).';

CREATE TABLE IF NOT EXISTS public.overhead_items (
  id             bigserial PRIMARY KEY,
  client_id      bigint NOT NULL REFERENCES public."Clients"(id) ON DELETE CASCADE,
  name           text NOT NULL,
  monthly_amount numeric NOT NULL DEFAULT 0 CHECK (monthly_amount >= 0),
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_overhead_items_client ON public.overhead_items(client_id);

CREATE TABLE IF NOT EXISTS public.materials (
  id                     bigserial PRIMARY KEY,
  client_id              bigint NOT NULL REFERENCES public."Clients"(id) ON DELETE CASCADE,
  name                   text NOT NULL,
  unit                   text NOT NULL,
  unit_cost              numeric NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  coverage_sqft_per_unit numeric CHECK (coverage_sqft_per_unit IS NULL OR coverage_sqft_per_unit > 0),
  purchasable_unit_size  numeric NOT NULL DEFAULT 1 CHECK (purchasable_unit_size > 0),
  is_placeholder         boolean NOT NULL DEFAULT false,
  active                 boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.materials.is_placeholder IS
  'Seed values the owner has not adopted yet. UI labels these "PLACEHOLDER — edit before relying on this."';
CREATE INDEX IF NOT EXISTS idx_materials_client ON public.materials(client_id);

CREATE TABLE IF NOT EXISTS public.service_catalog (
  id                  bigserial PRIMARY KEY,
  client_id           bigint NOT NULL REFERENCES public."Clients"(id) ON DELETE CASCADE,
  name                text NOT NULL,
  type                text NOT NULL CHECK (type IN ('MEASURED','TASK')),
  unit                text CHECK (unit IN ('sqft','lnft','each')),
  labor_hours_per_unit numeric CHECK (labor_hours_per_unit IS NULL OR labor_hours_per_unit > 0),
  flat_labor_hours    numeric CHECK (flat_labor_hours IS NULL OR flat_labor_hours > 0),
  notes               text,
  is_placeholder      boolean NOT NULL DEFAULT false,
  active              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_catalog_type_shape CHECK (
    (type = 'MEASURED' AND unit IS NOT NULL AND labor_hours_per_unit IS NOT NULL AND flat_labor_hours IS NULL)
    OR
    (type = 'TASK' AND unit IS NULL AND labor_hours_per_unit IS NULL AND flat_labor_hours IS NOT NULL)
  )
);
COMMENT ON TABLE public.service_catalog IS
  'Two line-item types by design: MEASURED (qty × hrs/unit) for painting, TASK (flat hrs) for handyman work. Forcing everything into $/sqft would leave half the business inconsistent.';
CREATE INDEX IF NOT EXISTS idx_service_catalog_client ON public.service_catalog(client_id);

CREATE TABLE IF NOT EXISTS public.service_materials (
  id           bigserial PRIMARY KEY,
  client_id    bigint NOT NULL REFERENCES public."Clients"(id) ON DELETE CASCADE,
  service_id   bigint NOT NULL REFERENCES public.service_catalog(id) ON DELETE CASCADE,
  material_id  bigint NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  basis        text NOT NULL CHECK (basis IN ('COVERAGE','PER_UNIT','FLAT')),
  coats        integer CHECK (coats IS NULL OR coats > 0),
  qty_per_unit numeric CHECK (qty_per_unit IS NULL OR qty_per_unit > 0),
  flat_qty     numeric CHECK (flat_qty IS NULL OR flat_qty > 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_materials_basis_shape CHECK (
    (basis = 'COVERAGE' AND coats IS NOT NULL AND qty_per_unit IS NULL AND flat_qty IS NULL)
    OR
    (basis = 'PER_UNIT' AND coats IS NULL AND qty_per_unit IS NOT NULL AND flat_qty IS NULL)
    OR
    (basis = 'FLAT' AND coats IS NULL AND qty_per_unit IS NULL AND flat_qty IS NOT NULL)
  ),
  CONSTRAINT service_materials_unique_link UNIQUE (service_id, material_id)
);
CREATE INDEX IF NOT EXISTS idx_service_materials_client ON public.service_materials(client_id);
CREATE INDEX IF NOT EXISTS idx_service_materials_service ON public.service_materials(service_id);
CREATE INDEX IF NOT EXISTS idx_service_materials_material ON public.service_materials(material_id);

CREATE TABLE IF NOT EXISTS public.price_modifiers (
  id         bigserial PRIMARY KEY,
  client_id  bigint NOT NULL REFERENCES public."Clients"(id) ON DELETE CASCADE,
  name       text NOT NULL,
  scope      text NOT NULL CHECK (scope IN ('LINE','JOB')),
  math       text NOT NULL CHECK (math IN ('MULTIPLIER','FLAT_ADD')),
  value      numeric NOT NULL,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.price_modifiers IS
  'Prep levels etc. LINE MULTIPLIER modifiers apply to LABOR HOURS ONLY, never materials.';
CREATE INDEX IF NOT EXISTS idx_price_modifiers_client ON public.price_modifiers(client_id);

CREATE TABLE IF NOT EXISTS public.travel_zones (
  id         bigserial PRIMARY KEY,
  client_id  bigint NOT NULL REFERENCES public."Clients"(id) ON DELETE CASCADE,
  label      text NOT NULL,
  flat_fee   numeric NOT NULL DEFAULT 0 CHECK (flat_fee >= 0),
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_travel_zones_client ON public.travel_zones(client_id);

-- ---------------------------------------------------------------------------
-- Job layer — estimates attach to Field jobs; own status lifecycle
-- (draft/sent/accepted/lost); the job pipeline stage is derived from these.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.estimates (
  id                          bigserial PRIMARY KEY,
  client_id                   bigint NOT NULL REFERENCES public."Clients"(id) ON DELETE CASCADE,
  job_id                      bigint NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  billing_entity_id           bigint REFERENCES public.billing_entities(id) ON DELETE RESTRICT,
  version                     integer NOT NULL DEFAULT 1,
  status                      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','lost')),
  travel_zone_id              bigint REFERENCES public.travel_zones(id) ON DELETE SET NULL,
  -- Frozen snapshot of every pricing input (Snapshot Rule)
  resolved_loaded_rate        numeric,
  resolved_margin_pct         numeric,
  resolved_material_markup_pct numeric,
  resolved_minimum_job_charge numeric,
  resolved_rounding_increment numeric,
  resolved_travel_fee         numeric,
  computed_cost               numeric,
  computed_price              numeric,
  -- Manual override escape hatch: stores BOTH numbers; reporting uses computed
  manual_override_price       numeric,
  override_reason             text,
  notes                       text,
  estimated_at                timestamptz,
  sent_at                     timestamptz,
  accepted_at                 timestamptz,
  lost_at                     timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT estimates_override_needs_reason CHECK (
    manual_override_price IS NULL OR (override_reason IS NOT NULL AND btrim(override_reason) <> '')
  ),
  CONSTRAINT estimates_version_per_job UNIQUE (job_id, version)
);
COMMENT ON TABLE public.estimates IS
  'Snapshot Rule: saving freezes all resolved_* inputs. Later settings changes must NEVER change a saved estimate. Only re-snapshot paths: editing the estimate, or explicit "Reprice at current settings" with confirm.';
CREATE INDEX IF NOT EXISTS idx_estimates_client ON public.estimates(client_id);
CREATE INDEX IF NOT EXISTS idx_estimates_job ON public.estimates(job_id);
CREATE INDEX IF NOT EXISTS idx_estimates_billing_entity ON public.estimates(billing_entity_id);
CREATE INDEX IF NOT EXISTS idx_estimates_travel_zone ON public.estimates(travel_zone_id);

CREATE TABLE IF NOT EXISTS public.estimate_line_items (
  id                       bigserial PRIMARY KEY,
  client_id                bigint NOT NULL REFERENCES public."Clients"(id) ON DELETE CASCADE,
  estimate_id              bigint NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  service_id               bigint REFERENCES public.service_catalog(id) ON DELETE SET NULL,
  description              text NOT NULL,
  type                     text NOT NULL CHECK (type IN ('MEASURED','TASK')),
  qty                      numeric NOT NULL CHECK (qty > 0),
  unit                     text,
  prep_modifier_id         bigint REFERENCES public.price_modifiers(id) ON DELETE SET NULL,
  sort_order               integer NOT NULL DEFAULT 0,
  -- Frozen snapshot (Snapshot Rule); resolved_client_amount is the allocated
  -- client-facing row price — rows sum EXACTLY to the estimate total.
  resolved_prep_multiplier numeric NOT NULL DEFAULT 1,
  resolved_hours_per_unit  numeric,
  resolved_labor_hours     numeric NOT NULL DEFAULT 0,
  resolved_loaded_rate     numeric NOT NULL DEFAULT 0,
  resolved_labor_cost      numeric NOT NULL DEFAULT 0,
  resolved_material_cost   numeric NOT NULL DEFAULT 0,
  resolved_line_cost       numeric NOT NULL DEFAULT 0,
  resolved_client_amount   numeric NOT NULL DEFAULT 0,
  created_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_estimate_line_items_client ON public.estimate_line_items(client_id);
CREATE INDEX IF NOT EXISTS idx_estimate_line_items_estimate ON public.estimate_line_items(estimate_id);
CREATE INDEX IF NOT EXISTS idx_estimate_line_items_service ON public.estimate_line_items(service_id);
CREATE INDEX IF NOT EXISTS idx_estimate_line_items_prep ON public.estimate_line_items(prep_modifier_id);

CREATE TABLE IF NOT EXISTS public.estimate_materials (
  id                 bigserial PRIMARY KEY,
  client_id          bigint NOT NULL REFERENCES public."Clients"(id) ON DELETE CASCADE,
  estimate_id        bigint NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  line_item_id       bigint REFERENCES public.estimate_line_items(id) ON DELETE CASCADE,
  material_id        bigint REFERENCES public.materials(id) ON DELETE SET NULL,
  description        text NOT NULL,
  qty                numeric NOT NULL CHECK (qty > 0),
  resolved_unit_cost numeric NOT NULL DEFAULT 0,
  resolved_total     numeric NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.estimate_materials.qty IS
  'Units PURCHASED — always ceil to purchasable_unit_size at pricing time (float-safe, ε=1e-9).';
CREATE INDEX IF NOT EXISTS idx_estimate_materials_client ON public.estimate_materials(client_id);
CREATE INDEX IF NOT EXISTS idx_estimate_materials_estimate ON public.estimate_materials(estimate_id);
CREATE INDEX IF NOT EXISTS idx_estimate_materials_line ON public.estimate_materials(line_item_id);
CREATE INDEX IF NOT EXISTS idx_estimate_materials_material ON public.estimate_materials(material_id);

-- ---------------------------------------------------------------------------
-- Actuals (Insights feedback loop)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.time_entries (
  id         bigserial PRIMARY KEY,
  client_id  bigint NOT NULL REFERENCES public."Clients"(id) ON DELETE CASCADE,
  job_id     bigint NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  hours      numeric NOT NULL CHECK (hours > 0),
  note       text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_time_entries_client ON public.time_entries(client_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_job ON public.time_entries(job_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_created_by ON public.time_entries(created_by);

CREATE TABLE IF NOT EXISTS public.actual_materials (
  id          bigserial PRIMARY KEY,
  client_id   bigint NOT NULL REFERENCES public."Clients"(id) ON DELETE CASCADE,
  job_id      bigint NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  material_id bigint REFERENCES public.materials(id) ON DELETE SET NULL,
  description text NOT NULL,
  qty         numeric CHECK (qty IS NULL OR qty > 0),
  actual_cost numeric NOT NULL CHECK (actual_cost >= 0),
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_actual_materials_client ON public.actual_materials(client_id);
CREATE INDEX IF NOT EXISTS idx_actual_materials_job ON public.actual_materials(job_id);
CREATE INDEX IF NOT EXISTS idx_actual_materials_material ON public.actual_materials(material_id);
CREATE INDEX IF NOT EXISTS idx_actual_materials_created_by ON public.actual_materials(created_by);

-- ---------------------------------------------------------------------------
-- Invoices extension (extend, don't duplicate)
-- ---------------------------------------------------------------------------
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS invoice_number            text,
  ADD COLUMN IF NOT EXISTS billing_entity_id         bigint REFERENCES public.billing_entities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS estimate_id               bigint REFERENCES public.estimates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tax_rate_pct              numeric NOT NULL DEFAULT 0 CHECK (tax_rate_pct >= 0),
  ADD COLUMN IF NOT EXISTS due_terms                 text NOT NULL DEFAULT 'Due on receipt',
  ADD COLUMN IF NOT EXISTS stripe_hosted_invoice_url text,
  ADD COLUMN IF NOT EXISTS pdf_path                  text;
COMMENT ON COLUMN public.invoices.invoice_number IS
  'Per-entity per-year sequence, e.g. SPC-2026-001. Assigned server-side at creation; NULL for legacy/subscription rows.';
CREATE UNIQUE INDEX IF NOT EXISTS invoices_number_per_client
  ON public.invoices(client_id, invoice_number) WHERE invoice_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_billing_entity ON public.invoices(billing_entity_id);
CREATE INDEX IF NOT EXISTS idx_invoices_estimate ON public.invoices(estimate_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'billing_entities','pricing_settings','overhead_items','materials',
    'service_catalog','service_materials','price_modifiers','travel_zones','estimates'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I;
       CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
      t, t, t, t);
  END LOOP;
END
$do$;

-- ---------------------------------------------------------------------------
-- RLS — reads for any tenant member, writes gated by user_can_write_client
-- (owner/manager), mirroring the invoices policies. Service-role bypasses.
-- ---------------------------------------------------------------------------
DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'billing_entities','pricing_settings','overhead_items','materials',
    'service_catalog','service_materials','price_modifiers','travel_zones',
    'estimates','estimate_line_items','estimate_materials',
    'time_entries','actual_materials'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon;', t);
    EXECUTE format($p$
      DROP POLICY IF EXISTS %1$s_select ON public.%1$I;
      CREATE POLICY %1$s_select ON public.%1$I FOR SELECT
        USING (client_id IN (SELECT public.current_user_client_ids()));
      DROP POLICY IF EXISTS %1$s_insert ON public.%1$I;
      CREATE POLICY %1$s_insert ON public.%1$I FOR INSERT
        WITH CHECK (public.user_can_write_client(client_id));
      DROP POLICY IF EXISTS %1$s_update ON public.%1$I;
      CREATE POLICY %1$s_update ON public.%1$I FOR UPDATE
        USING (public.user_can_write_client(client_id))
        WITH CHECK (public.user_can_write_client(client_id));
      DROP POLICY IF EXISTS %1$s_delete ON public.%1$I;
      CREATE POLICY %1$s_delete ON public.%1$I FOR DELETE
        USING (public.user_can_write_client(client_id));
    $p$, t);
  END LOOP;
END
$do$;
