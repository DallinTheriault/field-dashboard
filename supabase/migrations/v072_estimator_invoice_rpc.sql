-- v0.7.2 — Estimator invoice creation RPC (M-D)
--
-- Status: applied to production via Supabase MCP (apply_migration
-- 'v072_estimator_invoice_rpc'). Repo copy for history.
--
-- Creates a customer invoice with per-entity per-year numbering
-- (PREFIX-YYYY-NNN, e.g. SPC-2026-001) in one transaction. An advisory
-- xact lock serializes numbering per (tenant, prefix, year) so concurrent
-- creates can't mint duplicates; the partial unique index
-- invoices_number_per_client is the backstop.
--
-- SECURITY INVOKER: the insert runs against RLS as the signed-in user
-- (owner/manager write gate on invoices applies unchanged).

CREATE OR REPLACE FUNCTION public.estimator_create_invoice(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_client_id bigint := (p->>'client_id')::bigint;
  v_entity_id bigint := (p->>'billing_entity_id')::bigint;
  v_prefix text;
  v_year text := to_char(now(), 'YYYY');
  v_seq integer;
  v_number text;
  v_invoice_id bigint;
BEGIN
  SELECT invoice_prefix INTO v_prefix
  FROM public.billing_entities
  WHERE id = v_entity_id AND client_id = v_client_id;
  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'Billing entity % not found', v_entity_id;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('estimator_invoice_number'),
    hashtext(v_client_id::text || ':' || v_prefix || ':' || v_year)
  );

  SELECT COALESCE(MAX(substring(invoice_number FROM '\d{3}$')::integer), 0) + 1
  INTO v_seq
  FROM public.invoices
  WHERE client_id = v_client_id
    AND invoice_number LIKE v_prefix || '-' || v_year || '-%';

  v_number := v_prefix || '-' || v_year || '-' || lpad(v_seq::text, 3, '0');

  INSERT INTO public.invoices (
    client_id, job_id, estimate_id, billing_entity_id, invoice_number,
    customer_name, customer_email, customer_phone,
    line_items, subtotal_cents, tax_rate_pct, tax_cents, total_cents,
    due_terms, status
  ) VALUES (
    v_client_id,
    (p->>'job_id')::bigint,
    (p->>'estimate_id')::bigint,
    v_entity_id,
    v_number,
    p->>'customer_name',
    p->>'customer_email',
    p->>'customer_phone',
    COALESCE(p->'line_items', '[]'::jsonb),
    COALESCE((p->>'subtotal_cents')::integer, 0),
    COALESCE((p->>'tax_rate_pct')::numeric, 0),
    COALESCE((p->>'tax_cents')::integer, 0),
    COALESCE((p->>'total_cents')::integer, 0),
    COALESCE(NULLIF(p->>'due_terms', ''), 'Due on receipt'),
    'draft'
  ) RETURNING id INTO v_invoice_id;

  RETURN jsonb_build_object('invoice_id', v_invoice_id, 'invoice_number', v_number);
END
$fn$;

REVOKE ALL ON FUNCTION public.estimator_create_invoice(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estimator_create_invoice(jsonb) TO authenticated, service_role;
