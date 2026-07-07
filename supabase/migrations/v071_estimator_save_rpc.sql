-- v0.7.1 — Estimator save RPC (M-C)
--
-- Status: applied to production via Supabase MCP (apply_migration
-- 'v071_estimator_save_rpc'). Repo copy for history.
--
-- One transactional entry point for writing an estimate snapshot:
-- estimate row + line items + frozen materials, all-or-nothing. The server
-- action assembles the payload (raw inputs re-priced server-side with the
-- ported engine); this function never computes prices.
--
-- SECURITY INVOKER on purpose: every INSERT/UPDATE/DELETE inside runs
-- against RLS as the signed-in user, so tenant isolation and the
-- owner/manager write gate (user_can_write_client) apply unchanged.
--
-- Editing (p->>'estimate_id' present) is a RE-SNAPSHOT: the old frozen rows
-- are deleted and rewritten — one of the two sanctioned re-snapshot paths
-- (edit / explicit reprice). Nothing else may mutate a saved estimate.

CREATE OR REPLACE FUNCTION public.estimator_save_estimate(p jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
DECLARE
  e jsonb := p->'estimate';
  v_estimate_id bigint := (p->>'estimate_id')::bigint;
  v_job_id bigint := (e->>'job_id')::bigint;
  v_client_id bigint := (e->>'client_id')::bigint;
  v_version integer;
  rec jsonb;
  v_line_id bigint;
  v_line_ids bigint[] := '{}';
BEGIN
  IF v_estimate_id IS NOT NULL THEN
    UPDATE public.estimates SET
      billing_entity_id            = (e->>'billing_entity_id')::bigint,
      travel_zone_id               = (e->>'travel_zone_id')::bigint,
      resolved_loaded_rate         = (e->>'resolved_loaded_rate')::numeric,
      resolved_margin_pct          = (e->>'resolved_margin_pct')::numeric,
      resolved_material_markup_pct = (e->>'resolved_material_markup_pct')::numeric,
      resolved_minimum_job_charge  = (e->>'resolved_minimum_job_charge')::numeric,
      resolved_rounding_increment  = (e->>'resolved_rounding_increment')::numeric,
      resolved_travel_fee          = (e->>'resolved_travel_fee')::numeric,
      computed_cost                = (e->>'computed_cost')::numeric,
      computed_price               = (e->>'computed_price')::numeric,
      manual_override_price        = (e->>'manual_override_price')::numeric,
      override_reason              = e->>'override_reason',
      notes                        = e->>'notes',
      estimated_at                 = now(),
      updated_at                   = now()
    WHERE id = v_estimate_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Estimate % not found or not writable', v_estimate_id;
    END IF;
    DELETE FROM public.estimate_materials WHERE estimate_id = v_estimate_id;
    DELETE FROM public.estimate_line_items WHERE estimate_id = v_estimate_id;
  ELSE
    SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
    FROM public.estimates WHERE job_id = v_job_id;

    INSERT INTO public.estimates (
      client_id, job_id, billing_entity_id, version, status, travel_zone_id,
      resolved_loaded_rate, resolved_margin_pct, resolved_material_markup_pct,
      resolved_minimum_job_charge, resolved_rounding_increment,
      resolved_travel_fee, computed_cost, computed_price,
      manual_override_price, override_reason, notes, estimated_at
    ) VALUES (
      v_client_id, v_job_id, (e->>'billing_entity_id')::bigint, v_version,
      'draft', (e->>'travel_zone_id')::bigint,
      (e->>'resolved_loaded_rate')::numeric,
      (e->>'resolved_margin_pct')::numeric,
      (e->>'resolved_material_markup_pct')::numeric,
      (e->>'resolved_minimum_job_charge')::numeric,
      (e->>'resolved_rounding_increment')::numeric,
      (e->>'resolved_travel_fee')::numeric,
      (e->>'computed_cost')::numeric,
      (e->>'computed_price')::numeric,
      (e->>'manual_override_price')::numeric,
      e->>'override_reason',
      e->>'notes',
      now()
    ) RETURNING id INTO v_estimate_id;
  END IF;

  FOR rec IN SELECT value FROM jsonb_array_elements(COALESCE(p->'lines', '[]'::jsonb)) AS t(value) LOOP
    INSERT INTO public.estimate_line_items (
      client_id, estimate_id, service_id, description, type, qty, unit,
      prep_modifier_id, sort_order,
      resolved_prep_multiplier, resolved_hours_per_unit, resolved_labor_hours,
      resolved_loaded_rate, resolved_labor_cost, resolved_material_cost,
      resolved_line_cost, resolved_client_amount
    ) VALUES (
      v_client_id, v_estimate_id,
      (rec->>'service_id')::bigint,
      rec->>'description',
      rec->>'type',
      (rec->>'qty')::numeric,
      rec->>'unit',
      (rec->>'prep_modifier_id')::bigint,
      COALESCE((rec->>'sort_order')::integer, 0),
      COALESCE((rec->>'resolved_prep_multiplier')::numeric, 1),
      (rec->>'resolved_hours_per_unit')::numeric,
      COALESCE((rec->>'resolved_labor_hours')::numeric, 0),
      COALESCE((rec->>'resolved_loaded_rate')::numeric, 0),
      COALESCE((rec->>'resolved_labor_cost')::numeric, 0),
      COALESCE((rec->>'resolved_material_cost')::numeric, 0),
      COALESCE((rec->>'resolved_line_cost')::numeric, 0),
      COALESCE((rec->>'resolved_client_amount')::numeric, 0)
    ) RETURNING id INTO v_line_id;
    v_line_ids := v_line_ids || v_line_id;
  END LOOP;

  FOR rec IN SELECT value FROM jsonb_array_elements(COALESCE(p->'materials', '[]'::jsonb)) AS t(value) LOOP
    INSERT INTO public.estimate_materials (
      client_id, estimate_id, line_item_id, material_id, description, qty,
      resolved_unit_cost, resolved_total
    ) VALUES (
      v_client_id, v_estimate_id,
      CASE WHEN rec->>'line_index' IS NOT NULL
           THEN v_line_ids[(rec->>'line_index')::integer + 1] END,
      (rec->>'material_id')::bigint,
      rec->>'description',
      (rec->>'qty')::numeric,
      COALESCE((rec->>'resolved_unit_cost')::numeric, 0),
      COALESCE((rec->>'resolved_total')::numeric, 0)
    );
  END LOOP;

  RETURN v_estimate_id;
END
$fn$;

-- Match the project's RPC permission posture: signed-in users only.
REVOKE ALL ON FUNCTION public.estimator_save_estimate(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estimator_save_estimate(jsonb) TO authenticated, service_role;
