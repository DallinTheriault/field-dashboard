-- Field production schema snapshot
--
-- Source: Supabase project pxgkrxhxnnxfckgjpkah (prod), Postgres 17.6.
-- Captured 2026-10-13 with read-only catalog queries (supabase/schema/snapshot.sql);
-- every section below matched prod's md5 for that section at capture time.
-- Latest applied migration at capture: v091_mileage (112 entries in prod's
-- migration history; the repo's supabase/migrations holds 34 of them).
--
-- Schema only: no row data except storage bucket config. Supabase-managed
-- objects (auth/storage/realtime internals, supabase_admin default privileges,
-- event triggers) are left to the platform; a fresh project already has them.
--
-- Rebuild on a fresh Supabase project, as the postgres role:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/schema/prod.sql

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET client_min_messages = warning;
SET search_path = public, extensions;

-- ==========================================================================
-- Extensions
-- ==========================================================================

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- ==========================================================================
-- Sequences
-- ==========================================================================

CREATE SEQUENCE public.actual_materials_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;

CREATE SEQUENCE public.audit_log_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;

CREATE SEQUENCE public.billing_entities_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;

CREATE SEQUENCE public.estimate_line_items_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;

CREATE SEQUENCE public.estimate_materials_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;

CREATE SEQUENCE public.estimates_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;

CREATE SEQUENCE public.expenses_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;

CREATE SEQUENCE public.job_status_log_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;

CREATE SEQUENCE public.lead_intake_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;

CREATE SEQUENCE public.materials_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;

CREATE SEQUENCE public.onboard_intake_log_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;

CREATE SEQUENCE public.overhead_items_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;

CREATE SEQUENCE public.price_modifiers_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;

CREATE SEQUENCE public.purchases_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;

CREATE SEQUENCE public.receipt_scans_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;

CREATE SEQUENCE public.service_catalog_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;

CREATE SEQUENCE public.service_materials_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;

CREATE SEQUENCE public.sms_reply_templates_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;

CREATE SEQUENCE public.sms_scheduled_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;

CREATE SEQUENCE public.tags_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;

CREATE SEQUENCE public.task_photos_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;

CREATE SEQUENCE public.tasks_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;

CREATE SEQUENCE public.team_audit_log_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;

CREATE SEQUENCE public.time_entries_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;

CREATE SEQUENCE public.travel_zones_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;

CREATE SEQUENCE public.workflow_errors_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;

-- ==========================================================================
-- Tables
-- ==========================================================================

CREATE TABLE public."Clients" (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    created_at timestamp with time zone NOT NULL,
    business_name text,
    twilio_number text,
    vapi_assistant_id text,
    timezone text,
    services text,
    is_active boolean,
    system_prompt text,
    calendar_id text,
    default_duration_minutes integer,
    webhook_secret text NOT NULL,
    owner_email text,
    brand_logo_url text,
    brand_primary_color text,
    vapi_voice_id text,
    stripe_connect_account_id text,
    notify_email boolean NOT NULL,
    notify_dashboard_ping boolean NOT NULL,
    notify_sms boolean NOT NULL,
    owner_phone text,
    intake_mode text NOT NULL,
    owner_first_name text,
    business_short_name text,
    service_type text,
    primary_service text,
    business_phone text,
    business_website text,
    service_area text,
    business_hours text,
    service_constraints text,
    pricing_block text,
    scope_values text,
    escalation_phone text,
    timezone_label text,
    is_test boolean NOT NULL,
    feature_sms_enabled boolean NOT NULL,
    feature_voice_enabled boolean NOT NULL,
    feature_calendar_enabled boolean NOT NULL,
    feature_billing_enabled boolean NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    callback_window text NOT NULL,
    feature_estimator_enabled boolean NOT NULL,
    feature_receipt_ai_enabled boolean NOT NULL
);

CREATE TABLE public.actual_materials (
    id bigint NOT NULL,
    client_id bigint NOT NULL,
    job_id bigint NOT NULL,
    material_id bigint,
    description text NOT NULL,
    qty numeric,
    actual_cost numeric NOT NULL,
    created_by uuid,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.audit_log (
    id bigint NOT NULL,
    created_at timestamp with time zone NOT NULL,
    client_id bigint,
    actor_user_id uuid,
    actor_email text,
    action text NOT NULL,
    target_type text,
    target_id text,
    details jsonb,
    ip_address inet,
    user_agent text
);

CREATE TABLE public.billing_entities (
    id bigint NOT NULL,
    client_id bigint NOT NULL,
    name text NOT NULL,
    logo_path text,
    license_number text,
    address text,
    phone text,
    email text,
    payment_instructions text,
    invoice_prefix text NOT NULL,
    default_footer_text text,
    is_default boolean NOT NULL,
    active boolean NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.calendar_connections (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    client_id bigint NOT NULL,
    provider text NOT NULL,
    calendar_id text NOT NULL,
    access_token text,
    refresh_token text,
    token_expires_at timestamp with time zone,
    scope text,
    connected_by_user_id uuid,
    connected_at timestamp with time zone NOT NULL,
    last_refreshed_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.call_summaries (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    client_id bigint NOT NULL,
    vapi_call_id text,
    caller_phone text,
    caller_name text,
    duration_seconds numeric(10,3),
    intent text,
    outcome text,
    job_id bigint,
    transcript_url text,
    recording_url text,
    summary text,
    cost_cents integer,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    contact_id bigint
);

CREATE TABLE public.client_secrets (
    client_id bigint NOT NULL,
    webhook_secret text NOT NULL,
    rotated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.client_users (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    auth_user_id uuid NOT NULL,
    client_id bigint NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.contact_tags (
    contact_id bigint NOT NULL,
    tag_id bigint NOT NULL,
    client_id bigint NOT NULL,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.contacts (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    client_id bigint NOT NULL,
    phone text,
    name text,
    email text,
    address text,
    notes text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    first_contacted_at timestamp with time zone,
    last_contacted_at timestamp with time zone,
    archived_at timestamp with time zone,
    assigned_user_id uuid,
    tags text[] NOT NULL
);

CREATE TABLE public.estimate_line_items (
    id bigint NOT NULL,
    client_id bigint NOT NULL,
    estimate_id bigint NOT NULL,
    service_id bigint,
    description text NOT NULL,
    type text NOT NULL,
    qty numeric NOT NULL,
    unit text,
    prep_modifier_id bigint,
    sort_order integer NOT NULL,
    resolved_prep_multiplier numeric NOT NULL,
    resolved_hours_per_unit numeric,
    resolved_labor_hours numeric NOT NULL,
    resolved_loaded_rate numeric NOT NULL,
    resolved_labor_cost numeric NOT NULL,
    resolved_material_cost numeric NOT NULL,
    resolved_line_cost numeric NOT NULL,
    resolved_client_amount numeric NOT NULL,
    created_at timestamp with time zone NOT NULL,
    is_hardware boolean NOT NULL,
    sku text,
    resolved_unit_price numeric,
    hardware_markup boolean,
    task_id bigint
);

CREATE TABLE public.estimate_materials (
    id bigint NOT NULL,
    client_id bigint NOT NULL,
    estimate_id bigint NOT NULL,
    line_item_id bigint,
    material_id bigint,
    description text NOT NULL,
    qty numeric NOT NULL,
    resolved_unit_cost numeric NOT NULL,
    resolved_total numeric NOT NULL,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.estimates (
    id bigint NOT NULL,
    client_id bigint NOT NULL,
    job_id bigint NOT NULL,
    billing_entity_id bigint,
    version integer NOT NULL,
    status text NOT NULL,
    travel_zone_id bigint,
    resolved_loaded_rate numeric,
    resolved_margin_pct numeric,
    resolved_material_markup_pct numeric,
    resolved_minimum_job_charge numeric,
    resolved_rounding_increment numeric,
    resolved_travel_fee numeric,
    computed_cost numeric,
    computed_price numeric,
    manual_override_price numeric,
    override_reason text,
    notes text,
    estimated_at timestamp with time zone,
    sent_at timestamp with time zone,
    accepted_at timestamp with time zone,
    lost_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.expenses (
    id bigint NOT NULL,
    client_id bigint NOT NULL,
    expense_date date NOT NULL,
    category text NOT NULL,
    description text NOT NULL,
    amount numeric NOT NULL,
    job_id bigint,
    created_by uuid,
    created_at timestamp with time zone NOT NULL,
    receipt_path text,
    qty numeric,
    purchase_id bigint,
    sku text,
    unit_price numeric,
    assignment text NOT NULL,
    customer_notified boolean NOT NULL,
    stock_category text,
    invoiced_on bigint
);

CREATE TABLE public.invitations (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    created_at timestamp with time zone NOT NULL,
    client_id bigint NOT NULL,
    email text NOT NULL,
    role text NOT NULL,
    token text NOT NULL,
    invited_by uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    accepted_at timestamp with time zone,
    accepted_by uuid,
    revoked_at timestamp with time zone
);

CREATE TABLE public.invoices (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    client_id bigint NOT NULL,
    job_id bigint,
    customer_name text NOT NULL,
    customer_email text,
    customer_phone text,
    line_items jsonb NOT NULL,
    subtotal_cents integer NOT NULL,
    tax_cents integer NOT NULL,
    total_cents integer NOT NULL,
    status text NOT NULL,
    stripe_invoice_id text,
    stripe_payment_intent_id text,
    sent_at timestamp with time zone,
    paid_at timestamp with time zone,
    due_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    invoice_number text,
    billing_entity_id bigint,
    estimate_id bigint,
    tax_rate_pct numeric NOT NULL,
    due_terms text NOT NULL,
    stripe_hosted_invoice_url text,
    pdf_path text
);

CREATE TABLE public.job_status_log (
    id bigint NOT NULL,
    job_id bigint NOT NULL,
    client_id bigint NOT NULL,
    old_status text,
    new_status text NOT NULL,
    changed_by uuid,
    changed_at timestamp with time zone NOT NULL
);

CREATE TABLE public.job_tags (
    job_id bigint NOT NULL,
    tag_id bigint NOT NULL,
    client_id bigint NOT NULL,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.jobs (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    client_id bigint NOT NULL,
    name text,
    phone text,
    email text,
    address text,
    service text,
    scope text,
    quoted_price numeric,
    notes text,
    sms_consent text,
    source text,
    status text NOT NULL,
    start_datetime timestamp with time zone,
    end_datetime timestamp with time zone,
    duration_minutes integer,
    details jsonb,
    calendar_event_id text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    contact_id bigint,
    archived_at timestamp with time zone,
    assigned_user_id uuid,
    tags text[] NOT NULL,
    property_id bigint,
    bill_to_contact_id bigint,
    job_number text
);

CREATE TABLE public.lead_intake (
    id bigint NOT NULL,
    business_name text NOT NULL,
    contact_name text NOT NULL,
    contact_email text NOT NULL,
    contact_phone text NOT NULL,
    industry text,
    employee_count_estimate integer,
    current_call_volume_estimate integer,
    notes text,
    source text NOT NULL,
    source_url text,
    referrer text,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_term text,
    utm_content text,
    status text NOT NULL,
    assigned_to uuid,
    loss_reason text,
    created_at timestamp with time zone NOT NULL,
    contacted_at timestamp with time zone,
    closed_at timestamp with time zone
);

CREATE TABLE public.materials (
    id bigint NOT NULL,
    client_id bigint NOT NULL,
    name text NOT NULL,
    unit text NOT NULL,
    unit_cost numeric NOT NULL,
    coverage_sqft_per_unit numeric,
    purchasable_unit_size numeric NOT NULL,
    is_placeholder boolean NOT NULL,
    active boolean NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.messages (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    client_id bigint NOT NULL,
    caller_name text,
    caller_phone text,
    callback_phone text,
    message_body text NOT NULL,
    call_summary_id bigint,
    read_at timestamp with time zone,
    responded_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    contact_id bigint
);

CREATE TABLE public.mileage_entries (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    client_id bigint NOT NULL,
    trip_date date NOT NULL,
    job_id bigint,
    destination text NOT NULL,
    purpose text NOT NULL,
    miles numeric NOT NULL,
    round_trip boolean NOT NULL,
    vehicle text,
    source text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.mileage_rates (
    client_id bigint NOT NULL,
    year integer NOT NULL,
    rate_per_mile numeric NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.notifications (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    client_id bigint NOT NULL,
    kind text NOT NULL,
    title text NOT NULL,
    body text,
    link_url text,
    source_job_id bigint,
    source_message_id bigint,
    source_call_summary_id bigint,
    read_at timestamp with time zone,
    emailed_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.onboard_intake_log (
    id bigint NOT NULL,
    ip_hash text NOT NULL,
    email text,
    business_name text,
    created_at timestamp with time zone NOT NULL,
    accepted boolean NOT NULL,
    rejection_reason text
);

CREATE TABLE public.overhead_items (
    id bigint NOT NULL,
    client_id bigint NOT NULL,
    name text NOT NULL,
    monthly_amount numeric NOT NULL,
    active boolean NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.platform_admins (
    auth_user_id uuid NOT NULL,
    added_at timestamp with time zone NOT NULL,
    added_by uuid,
    notes text
);

CREATE TABLE public.price_modifiers (
    id bigint NOT NULL,
    client_id bigint NOT NULL,
    name text NOT NULL,
    scope text NOT NULL,
    math text NOT NULL,
    value numeric NOT NULL,
    active boolean NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.pricing_settings (
    client_id bigint NOT NULL,
    desired_annual_owner_pay numeric NOT NULL,
    hours_worked_per_week numeric NOT NULL,
    utilization_pct numeric NOT NULL,
    margin_pct numeric NOT NULL,
    material_markup_pct numeric NOT NULL,
    minimum_job_charge numeric NOT NULL,
    rounding_increment numeric NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    mileage_base_address text
);

CREATE TABLE public.prompt_templates (
    id text NOT NULL,
    kind text NOT NULL,
    intake_mode text,
    body text NOT NULL,
    description text,
    is_active boolean NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.properties (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    client_id bigint NOT NULL,
    contact_id bigint NOT NULL,
    address text NOT NULL,
    unit text,
    label text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    miles_from_base numeric
);

CREATE TABLE public.purchases (
    id bigint NOT NULL,
    client_id bigint NOT NULL,
    vendor text NOT NULL,
    purchase_date date NOT NULL,
    receipt_path text,
    created_by uuid,
    created_at timestamp with time zone NOT NULL,
    subtotal numeric,
    tax numeric,
    total numeric,
    source text NOT NULL,
    receipt_paths text[] NOT NULL
);

CREATE TABLE public.receipt_scans (
    id bigint NOT NULL,
    client_id bigint NOT NULL,
    purchase_id bigint,
    model text NOT NULL,
    input_tokens integer NOT NULL,
    output_tokens integer NOT NULL,
    status text NOT NULL,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.service_catalog (
    id bigint NOT NULL,
    client_id bigint NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    unit text,
    labor_hours_per_unit numeric,
    flat_labor_hours numeric,
    notes text,
    is_placeholder boolean NOT NULL,
    active boolean NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.service_materials (
    id bigint NOT NULL,
    client_id bigint NOT NULL,
    service_id bigint NOT NULL,
    material_id bigint NOT NULL,
    basis text NOT NULL,
    coats integer,
    qty_per_unit numeric,
    flat_qty numeric,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.sms_messages (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    thread_id bigint NOT NULL,
    client_id bigint NOT NULL,
    direction text NOT NULL,
    body text NOT NULL,
    twilio_message_sid text,
    twilio_status text,
    error_code text,
    sent_by_user_id uuid,
    template_key text,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.sms_reply_templates (
    id bigint NOT NULL,
    client_id bigint NOT NULL,
    label text NOT NULL,
    body text NOT NULL,
    sort_order smallint NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    archived_at timestamp with time zone
);

CREATE TABLE public.sms_scheduled (
    id bigint NOT NULL,
    client_id bigint NOT NULL,
    thread_id bigint NOT NULL,
    tenant_phone text NOT NULL,
    contact_phone text NOT NULL,
    body text NOT NULL,
    scheduled_for timestamp with time zone NOT NULL,
    status text NOT NULL,
    scheduled_by uuid,
    sent_at timestamp with time zone,
    twilio_message_sid text,
    error_code text,
    error_message text,
    cancelled_at timestamp with time zone,
    cancelled_by uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.sms_sessions (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    created_at timestamp with time zone NOT NULL,
    phone text,
    messages jsonb,
    client_id bigint,
    status text,
    last_message_at timestamp with time zone
);

CREATE TABLE public.sms_threads (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    client_id bigint NOT NULL,
    contact_id bigint,
    tenant_phone text NOT NULL,
    contact_phone text NOT NULL,
    display_name text,
    consent_status text NOT NULL,
    last_inbound_at timestamp with time zone,
    last_outbound_at timestamp with time zone,
    last_message_at timestamp with time zone,
    last_message_preview text,
    last_read_at timestamp with time zone,
    archived_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.stripe_webhook_secrets (
    id smallint NOT NULL,
    webhook_secret text NOT NULL,
    rotated_at timestamp with time zone NOT NULL,
    notes text
);

CREATE TABLE public.subscriptions (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    client_id bigint NOT NULL,
    stripe_customer_id text NOT NULL,
    stripe_subscription_id text,
    status text NOT NULL,
    setup_fee_paid_at timestamp with time zone,
    current_period_end timestamp with time zone,
    monthly_price_cents integer NOT NULL,
    setup_fee_cents integer NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    cancel_at_period_end boolean NOT NULL
);

CREATE TABLE public.tags (
    id bigint NOT NULL,
    client_id bigint NOT NULL,
    name text NOT NULL,
    color_hex text NOT NULL,
    use_count integer NOT NULL,
    created_at timestamp with time zone NOT NULL,
    created_by uuid
);

CREATE TABLE public.task_photos (
    id bigint NOT NULL,
    client_id bigint NOT NULL,
    task_id bigint NOT NULL,
    storage_path text NOT NULL,
    caption text,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.tasks (
    id bigint NOT NULL,
    client_id bigint NOT NULL,
    job_id bigint NOT NULL,
    title text NOT NULL,
    note text,
    status text NOT NULL,
    sort_order integer NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.team_audit_log (
    id bigint NOT NULL,
    client_id bigint NOT NULL,
    actor_user_id uuid NOT NULL,
    actor_role_at_time text NOT NULL,
    action text NOT NULL,
    target_user_id uuid,
    target_email text NOT NULL,
    old_role text,
    new_role text,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.time_entries (
    id bigint NOT NULL,
    client_id bigint NOT NULL,
    job_id bigint NOT NULL,
    entry_date date NOT NULL,
    hours numeric NOT NULL,
    note text,
    created_by uuid,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.travel_zones (
    id bigint NOT NULL,
    client_id bigint NOT NULL,
    label text NOT NULL,
    flat_fee numeric NOT NULL,
    active boolean NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.workflow_errors (
    id bigint NOT NULL,
    created_at timestamp with time zone NOT NULL,
    workflow_id text,
    workflow_name text,
    execution_id text,
    client_id bigint,
    error_message text,
    error_stack text,
    payload jsonb,
    notified_at timestamp with time zone
);

-- ==========================================================================
-- Sequence ownership
-- ==========================================================================

ALTER SEQUENCE public.actual_materials_id_seq OWNED BY public.actual_materials.id;

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;

ALTER SEQUENCE public.billing_entities_id_seq OWNED BY public.billing_entities.id;

ALTER SEQUENCE public.estimate_line_items_id_seq OWNED BY public.estimate_line_items.id;

ALTER SEQUENCE public.estimate_materials_id_seq OWNED BY public.estimate_materials.id;

ALTER SEQUENCE public.estimates_id_seq OWNED BY public.estimates.id;

ALTER SEQUENCE public.expenses_id_seq OWNED BY public.expenses.id;

ALTER SEQUENCE public.job_status_log_id_seq OWNED BY public.job_status_log.id;

ALTER SEQUENCE public.lead_intake_id_seq OWNED BY public.lead_intake.id;

ALTER SEQUENCE public.materials_id_seq OWNED BY public.materials.id;

ALTER SEQUENCE public.onboard_intake_log_id_seq OWNED BY public.onboard_intake_log.id;

ALTER SEQUENCE public.overhead_items_id_seq OWNED BY public.overhead_items.id;

ALTER SEQUENCE public.price_modifiers_id_seq OWNED BY public.price_modifiers.id;

ALTER SEQUENCE public.purchases_id_seq OWNED BY public.purchases.id;

ALTER SEQUENCE public.receipt_scans_id_seq OWNED BY public.receipt_scans.id;

ALTER SEQUENCE public.service_catalog_id_seq OWNED BY public.service_catalog.id;

ALTER SEQUENCE public.service_materials_id_seq OWNED BY public.service_materials.id;

ALTER SEQUENCE public.sms_reply_templates_id_seq OWNED BY public.sms_reply_templates.id;

ALTER SEQUENCE public.sms_scheduled_id_seq OWNED BY public.sms_scheduled.id;

ALTER SEQUENCE public.tags_id_seq OWNED BY public.tags.id;

ALTER SEQUENCE public.task_photos_id_seq OWNED BY public.task_photos.id;

ALTER SEQUENCE public.tasks_id_seq OWNED BY public.tasks.id;

ALTER SEQUENCE public.team_audit_log_id_seq OWNED BY public.team_audit_log.id;

ALTER SEQUENCE public.time_entries_id_seq OWNED BY public.time_entries.id;

ALTER SEQUENCE public.travel_zones_id_seq OWNED BY public.travel_zones.id;

ALTER SEQUENCE public.workflow_errors_id_seq OWNED BY public.workflow_errors.id;

-- ==========================================================================
-- Functions
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.admin_reset_platform()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_deleted_clients integer;
  v_before_counts jsonb;
BEGIN
  -- Snapshot counts before wipe (for the audit return value)
  SELECT jsonb_build_object(
    'clients', (SELECT count(*) FROM public."Clients" WHERE business_name <> '__platform__'),
    'jobs', (SELECT count(*) FROM public.jobs),
    'call_summaries', (SELECT count(*) FROM public.call_summaries),
    'messages', (SELECT count(*) FROM public.messages),
    'notifications', (SELECT count(*) FROM public.notifications),
    'subscriptions', (SELECT count(*) FROM public.subscriptions),
    'client_users', (SELECT count(*) FROM public.client_users),
    'invitations', (SELECT count(*) FROM public.invitations),
    'calendar_connections', (SELECT count(*) FROM public.calendar_connections),
    'invoices', (SELECT count(*) FROM public.invoices),
    'sms_sessions', (SELECT count(*) FROM public.sms_sessions),
    'audit_log', (SELECT count(*) FROM public.audit_log)
  ) INTO v_before_counts;

  -- Wipe per-tenant data. Order matters for FK constraints — children first.
  DELETE FROM public.notifications;
  DELETE FROM public.messages;
  DELETE FROM public.call_summaries;
  DELETE FROM public.jobs;
  DELETE FROM public.sms_sessions;
  DELETE FROM public.invoices;
  DELETE FROM public.subscriptions;
  DELETE FROM public.calendar_connections;
  DELETE FROM public.client_users;
  DELETE FROM public.invitations;
  DELETE FROM public.audit_log;

  -- Wipe Clients EXCEPT the platform sentinel
  DELETE FROM public."Clients" WHERE business_name <> '__platform__';
  GET DIAGNOSTICS v_deleted_clients = ROW_COUNT;

  -- Reset id sequences so new tenants start at a clean number.
  -- Skip Clients (we want platform sentinel's id intact).
  PERFORM setval(pg_get_serial_sequence('public.jobs', 'id'), 1, false);
  PERFORM setval(pg_get_serial_sequence('public.call_summaries', 'id'), 1, false);
  PERFORM setval(pg_get_serial_sequence('public.messages', 'id'), 1, false);
  PERFORM setval(pg_get_serial_sequence('public.notifications', 'id'), 1, false);
  PERFORM setval(pg_get_serial_sequence('public.subscriptions', 'id'), 1, false);
  PERFORM setval(pg_get_serial_sequence('public.client_users', 'id'), 1, false);
  PERFORM setval(pg_get_serial_sequence('public.invitations', 'id'), 1, false);

  RETURN jsonb_build_object(
    'ok', true,
    'deleted_clients', v_deleted_clients,
    'wiped', v_before_counts,
    'message', 'Platform reset complete. All tenants and per-tenant data wiped. Platform sentinel preserved. Auth users untouched (re-link via /admin/clients/new).'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_link_contact()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_phone_raw       text;
  v_phone           text;
  v_name            text;
  v_email           text;
  v_address         text;
  v_contact_id      bigint;
BEGIN
  -- Don't overwrite an explicitly-set contact_id
  IF NEW.contact_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Pull the right phone column based on which table fired the trigger
  IF TG_TABLE_NAME = 'jobs' THEN
    v_phone_raw := NEW.phone;
    v_name      := NEW.name;
    v_email     := NEW.email;
    v_address   := NEW.address;
  ELSIF TG_TABLE_NAME = 'messages' THEN
    v_phone_raw := COALESCE(NEW.callback_phone, NEW.caller_phone);
    v_name      := NEW.caller_name;
    v_email     := NULL;
    v_address   := NULL;
  ELSIF TG_TABLE_NAME = 'call_summaries' THEN
    v_phone_raw := NEW.caller_phone;
    v_name      := NEW.caller_name;
    v_email     := NULL;
    v_address   := NULL;
  ELSE
    RETURN NEW;
  END IF;

  -- No phone → can't link. Leave contact_id NULL.
  IF v_phone_raw IS NULL THEN
    RETURN NEW;
  END IF;

  v_phone := public.normalize_phone(v_phone_raw);
  IF v_phone IS NULL THEN
    RETURN NEW;
  END IF;

  -- Try to find existing contact
  SELECT id INTO v_contact_id
  FROM public.contacts
  WHERE client_id = NEW.client_id AND phone = v_phone;

  IF v_contact_id IS NOT NULL THEN
    -- Existing contact: just bump the activity timestamp
    UPDATE public.contacts
    SET last_contacted_at = now()
    WHERE id = v_contact_id;
  ELSE
    -- New contact: create from this row's data
    INSERT INTO public.contacts (
      client_id, phone, name, email, address,
      first_contacted_at, last_contacted_at
    )
    VALUES (
      NEW.client_id,
      v_phone,
      NULLIF(trim(v_name), ''),
      NULLIF(trim(v_email), ''),
      NULLIF(trim(v_address), ''),
      now(),
      now()
    )
    RETURNING id INTO v_contact_id;
  END IF;

  NEW.contact_id := v_contact_id;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.client_owner_count(target_client_id bigint)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select count(*) from public.client_users
  where client_id = target_client_id and role = 'owner';
$function$;

CREATE OR REPLACE FUNCTION public.count_unread_notifications()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COUNT(*)::int
  FROM public.notifications n
  WHERE n.read_at IS NULL
    AND n.client_id IN (
      SELECT cu.client_id FROM public.client_users cu
      WHERE cu.auth_user_id = auth.uid()
    );
$function$;

CREATE OR REPLACE FUNCTION public.create_notification(p_client_id bigint, p_kind text, p_title text, p_body text DEFAULT NULL::text, p_link_url text DEFAULT NULL::text, p_source_job_id bigint DEFAULT NULL::bigint, p_source_message_id bigint DEFAULT NULL::bigint, p_source_call_summary_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_notification_id bigint;
  v_notify_email boolean;
  v_owner_email text;
BEGIN
  -- Keep in sync with the notifications.kind CHECK constraint.
  IF p_kind NOT IN (
    'estimate_saved','booking_saved','booking_rescheduled','booking_cancelled',
    'message_left','invoice_paid','callback_received','sms_received'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid kind: ' || p_kind);
  END IF;

  SELECT notify_email, owner_email
    INTO v_notify_email, v_owner_email
  FROM public."Clients"
  WHERE id = p_client_id;

  IF v_owner_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'client not found or owner_email missing');
  END IF;

  INSERT INTO public.notifications (
    client_id, kind, title, body, link_url,
    source_job_id, source_message_id, source_call_summary_id
  ) VALUES (
    p_client_id, p_kind, p_title, p_body, p_link_url,
    p_source_job_id, p_source_message_id, p_source_call_summary_id
  )
  RETURNING id INTO v_notification_id;

  RETURN jsonb_build_object(
    'ok', true,
    'notification_id', v_notification_id,
    'should_send_email', COALESCE(v_notify_email, true),
    'owner_email', v_owner_email
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_notification_for_call(p_client_id bigint, p_kind text, p_title text, p_body text, p_link_url text DEFAULT NULL::text, p_source_call_summary_id bigint DEFAULT NULL::bigint, p_source_job_id bigint DEFAULT NULL::bigint, p_source_message_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_notification_id bigint;
  v_prefs record;
BEGIN
  SELECT
    notify_email,
    notify_dashboard_ping,
    notify_sms,
    owner_email,
    owner_phone
  INTO v_prefs
  FROM public."Clients"
  WHERE id = p_client_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'client not found: ' || p_client_id);
  END IF;

  IF v_prefs.notify_dashboard_ping THEN
    INSERT INTO public.notifications (
      client_id, kind, title, body, link_url,
      source_call_summary_id, source_job_id, source_message_id
    ) VALUES (
      p_client_id, p_kind, p_title, p_body, p_link_url,
      p_source_call_summary_id, p_source_job_id, p_source_message_id
    )
    RETURNING id INTO v_notification_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'notification_id', v_notification_id,
    'should_send_email', v_prefs.notify_email AND v_prefs.owner_email IS NOT NULL,
    'should_send_sms', v_prefs.notify_sms AND v_prefs.owner_phone IS NOT NULL,
    'owner_email', v_prefs.owner_email,
    'owner_phone', v_prefs.owner_phone
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.current_user_client_ids()
 RETURNS SETOF integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT client_id FROM public.client_users WHERE auth_user_id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.enforce_at_least_one_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  remaining_owners INTEGER;
BEGIN
  -- Only check on DELETE or when role is being changed away from 'owner'
  IF TG_OP = 'DELETE' AND OLD.role = 'owner' THEN
    SELECT COUNT(*) INTO remaining_owners
    FROM public.client_users
    WHERE client_id = OLD.client_id
      AND role = 'owner'
      AND id <> OLD.id;

    IF remaining_owners = 0 THEN
      RAISE EXCEPTION 'Cannot remove the last owner of this business. Promote someone else first.';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.role = 'owner' AND NEW.role <> 'owner' THEN
    SELECT COUNT(*) INTO remaining_owners
    FROM public.client_users
    WHERE client_id = NEW.client_id
      AND role = 'owner'
      AND id <> NEW.id;

    IF remaining_owners = 0 THEN
      RAISE EXCEPTION 'Cannot demote the last owner. Promote someone else first.';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_invitation_limits()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  pending_count integer;
  recent_count integer;
BEGIN
  -- Max 20 pending (un-accepted, un-revoked, not-expired) invites per tenant at once
  SELECT COUNT(*) INTO pending_count
  FROM public.invitations
  WHERE client_id = NEW.client_id
    AND accepted_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > NOW();

  IF pending_count >= 20 THEN
    RAISE EXCEPTION 'Maximum of 20 pending invitations per tenant. Revoke unused invitations before creating more.';
  END IF;

  -- Max 10 invitations created in the last hour per inviter (across all tenants)
  SELECT COUNT(*) INTO recent_count
  FROM public.invitations
  WHERE invited_by = NEW.invited_by
    AND created_at > NOW() - INTERVAL '1 hour';

  IF recent_count >= 10 THEN
    RAISE EXCEPTION 'Invitation rate limit: max 10 per hour per user. Wait before creating more.';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_last_owner_check()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  remaining_owners integer;
BEGIN
  -- Only care if we're removing or downgrading an owner
  IF TG_OP = 'DELETE' AND OLD.role = 'owner' THEN
    SELECT COUNT(*) INTO remaining_owners
    FROM public.client_users
    WHERE client_id = OLD.client_id
      AND role = 'owner'
      AND id != OLD.id;
    IF remaining_owners = 0 THEN
      RAISE EXCEPTION 'Cannot remove the last owner of client %. Promote another user to owner first.', OLD.client_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.role = 'owner' AND NEW.role != 'owner' THEN
    SELECT COUNT(*) INTO remaining_owners
    FROM public.client_users
    WHERE client_id = OLD.client_id
      AND role = 'owner'
      AND id != OLD.id;
    IF remaining_owners = 0 THEN
      RAISE EXCEPTION 'Cannot demote the last owner of client %. Promote another user to owner first.', OLD.client_id;
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.estimator_create_invoice(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.estimator_save_estimate(p jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
    SELECT job_id INTO v_job_id FROM public.estimates WHERE id = v_estimate_id;
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
      resolved_line_cost, resolved_client_amount,
      is_hardware, sku, resolved_unit_price, hardware_markup, task_id
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
      COALESCE((rec->>'resolved_client_amount')::numeric, 0),
      COALESCE((rec->>'is_hardware')::boolean, false),
      rec->>'sku',
      (rec->>'resolved_unit_price')::numeric,
      (rec->>'hardware_markup')::boolean,
      (SELECT t2.id FROM public.tasks t2
        WHERE t2.id = (rec->>'task_id')::bigint
          AND t2.job_id = v_job_id
          AND t2.client_id = v_client_id)
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
$function$;

CREATE OR REPLACE FUNCTION public.get_job_by_id_for_tenant(p_job_id bigint, p_client_id bigint)
 RETURNS SETOF jobs
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT *
  FROM public.jobs
  WHERE id = p_job_id
    AND client_id = p_client_id
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_jobs_for_caller(p_client_id bigint, p_phone text)
 RETURNS SETOF jobs
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT *
  FROM public.jobs
  WHERE client_id = p_client_id
    AND phone = p_phone
    AND status NOT IN ('cancelled', 'completed')
  ORDER BY created_at DESC
  LIMIT 10;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_subscription()
 RETURNS TABLE(client_id bigint, status text, monthly_price_cents integer, setup_fee_paid_at timestamp with time zone, current_period_end timestamp with time zone, stripe_customer_id text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    s.client_id,
    s.status,
    s.monthly_price_cents,
    s.setup_fee_paid_at,
    s.current_period_end,
    s.stripe_customer_id
  FROM public.subscriptions s
  WHERE s.client_id IN (
    SELECT cu.client_id
    FROM public.client_users cu
    WHERE cu.auth_user_id = auth.uid()
      AND cu.role IN ('owner', 'manager')
  )
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.handle_auth_user_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_client_id bigint;
BEGIN
  -- Skip if already linked
  IF EXISTS (SELECT 1 FROM public.client_users WHERE auth_user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Find a Clients row whose owner_email matches the new user's email
  SELECT id INTO v_client_id
  FROM public."Clients"
  WHERE lower(trim(owner_email)) = lower(trim(NEW.email))
    AND business_name <> '__platform__'
  ORDER BY id
  LIMIT 1;

  IF v_client_id IS NOT NULL THEN
    INSERT INTO public.client_users (auth_user_id, client_id, role)
    VALUES (NEW.id, v_client_id, 'owner')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE auth_user_id = auth.uid()
  );
$function$;

CREATE OR REPLACE FUNCTION public.job_number_slug(p_name text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  v text;
  v_token text;
begin
  v := btrim(coalesce(p_name, ''));
  if v = '' then return 'Job'; end if;
  -- strip ONE trailing legal suffix (case-insensitive); (^|sep) so a name that
  -- is ONLY a suffix strips to empty and falls back to 'Job'.
  v := regexp_replace(
         v,
         '(^|[[:space:],]+)(LLC\.?|L\.L\.C\.?|INC\.?|CO\.?|CORP\.?|LTD\.?)$',
         '',
         'i');
  v := btrim(v);
  if v = '' then return 'Job'; end if;
  v_token := regexp_replace(v, '^.*\s', '');
  v_token := regexp_replace(v_token, '[^A-Za-z0-9]', '', 'g');
  if v_token = '' or v_token ~ '^[0-9]+$' then
    return 'Job';
  end if;
  return v_token;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_team_members(p_client_id bigint)
 RETURNS TABLE(user_id uuid, email text, display_name text, role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  -- Authorization: caller must be a member of the requested tenant.
  IF NOT EXISTS (
    SELECT 1 FROM public.client_users
    WHERE client_id = p_client_id
      AND auth_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not authorized to view team for client %', p_client_id
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    cu.auth_user_id AS user_id,
    u.email::text AS email,
    COALESCE(u.raw_user_meta_data->>'display_name', u.raw_user_meta_data->>'full_name')::text AS display_name,
    cu.role::text AS role
  FROM public.client_users cu
  JOIN auth.users u ON u.id = cu.auth_user_id
  WHERE cu.client_id = p_client_id
  ORDER BY
    CASE cu.role
      WHEN 'owner' THEN 1
      WHEN 'manager' THEN 2
      WHEN 'member' THEN 3
      ELSE 4
    END,
    u.email;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_audit_event(p_action text, p_client_id bigint DEFAULT NULL::bigint, p_target_type text DEFAULT NULL::text, p_target_id text DEFAULT NULL::text, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_id bigint;
  actor_email_val text;
BEGIN
  -- Resolve actor email from auth.uid() if available
  SELECT email INTO actor_email_val
  FROM auth.users
  WHERE id = auth.uid();

  INSERT INTO public.audit_log (
    client_id, actor_user_id, actor_email,
    action, target_type, target_id, details
  ) VALUES (
    p_client_id, auth.uid(), actor_email_val,
    p_action, p_target_type, p_target_id, p_details
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_job_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO job_status_log (job_id, client_id, old_status, new_status, changed_by)
    VALUES (NEW.id, NEW.client_id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.lookup_client_by_secret(p_secret text)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT client_id FROM public.client_secrets WHERE webhook_secret = p_secret;
$function$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_client_ids bigint[];
  v_count integer;
BEGIN
  SELECT array_agg(client_id) INTO v_user_client_ids
  FROM public.client_users WHERE auth_user_id = auth.uid();

  UPDATE public.notifications
  SET read_at = now()
  WHERE client_id = ANY(v_user_client_ids)
    AND read_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_client_ids bigint[];
BEGIN
  -- Authorize: caller must be a member of the tenant that owns this notification
  SELECT array_agg(client_id) INTO v_user_client_ids
  FROM public.client_users WHERE auth_user_id = auth.uid();

  UPDATE public.notifications
  SET read_at = COALESCE(read_at, now())
  WHERE id = p_notification_id
    AND client_id = ANY(v_user_client_ids);

  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mileage_entries_touch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.normalize_clients_phones()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.twilio_number    := public.normalize_e164(NEW.twilio_number);
  NEW.business_phone   := public.normalize_e164(NEW.business_phone);
  NEW.owner_phone      := public.normalize_e164(NEW.owner_phone);
  NEW.escalation_phone := public.normalize_e164(NEW.escalation_phone);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.normalize_contacts_phones()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.phone := public.normalize_e164(NEW.phone);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.normalize_e164(input text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  trimmed text;
  digits  text;
BEGIN
  IF input IS NULL THEN RETURN NULL; END IF;
  trimmed := btrim(input);
  IF trimmed = '' THEN RETURN NULL; END IF;

  -- Already E.164 US format?
  IF trimmed ~ '^\+1\d{10}$' THEN RETURN trimmed; END IF;

  -- Strip everything but digits
  digits := regexp_replace(trimmed, '\D', '', 'g');

  IF length(digits) = 10 THEN
    RETURN '+1' || digits;
  ELSIF length(digits) = 11 AND substring(digits, 1, 1) = '1' THEN
    RETURN '+' || digits;
  ELSE
    RAISE EXCEPTION 'Invalid US phone number: % (got % digits, expected 10 or 11 with leading 1)',
      input, length(digits);
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.normalize_jobs_phones()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.phone := public.normalize_e164(NEW.phone);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.normalize_lead_intake_phone()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Try to normalize; on failure (invalid format), keep original so we don't lose the lead
  BEGIN
    NEW.contact_phone := public.normalize_e164(NEW.contact_phone);
  EXCEPTION WHEN OTHERS THEN
    -- Invalid phone format — keep raw value, flag in admin review
    NULL;
  END;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.normalize_messages_phones()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.caller_phone := public.normalize_e164(NEW.caller_phone);
  NEW.callback_phone := public.normalize_e164(NEW.callback_phone);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.normalize_phone(input_phone text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  digits_only text;
BEGIN
  IF input_phone IS NULL OR trim(input_phone) = '' THEN
    RETURN NULL;
  END IF;

  digits_only := regexp_replace(input_phone, '[^0-9]', '', 'g');

  IF length(digits_only) = 0 THEN
    RETURN NULL;
  END IF;

  IF length(digits_only) = 10 THEN
    RETURN '+1' || digits_only;
  END IF;

  IF length(digits_only) = 11 AND substring(digits_only, 1, 1) = '1' THEN
    RETURN '+' || digits_only;
  END IF;

  RETURN '+' || digits_only;
END;
$function$;

CREATE OR REPLACE FUNCTION public.render_system_prompt(p_client_id bigint)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_client     record;
  v_master     text;
  v_greeting   text;
  v_result     text;
  v_missing    text[] := ARRAY[]::text[];
  v_remaining  text[];
BEGIN
  SELECT * INTO v_client FROM public."Clients" WHERE id = p_client_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client % not found', p_client_id;
  END IF;

  SELECT body INTO v_master
  FROM public.prompt_templates
  WHERE kind = 'master' AND is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_master IS NULL THEN
    RAISE EXCEPTION 'No active master prompt template found';
  END IF;

  SELECT body INTO v_greeting
  FROM public.prompt_templates
  WHERE kind = 'greeting_block'
    AND intake_mode = v_client.intake_mode
    AND is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_greeting IS NULL THEN
    RAISE EXCEPTION 'No active greeting block for intake_mode=%', v_client.intake_mode;
  END IF;

  -- Collect ALL missing required fields before raising, so the operator gets
  -- the full list at once instead of fix-one-find-next.
  IF v_client.business_name       IS NULL OR btrim(v_client.business_name)       = '' THEN v_missing := array_append(v_missing, 'business_name'); END IF;
  IF v_client.business_short_name IS NULL OR btrim(v_client.business_short_name) = '' THEN v_missing := array_append(v_missing, 'business_short_name'); END IF;
  IF v_client.service_type        IS NULL OR btrim(v_client.service_type)        = '' THEN v_missing := array_append(v_missing, 'service_type'); END IF;
  IF v_client.primary_service     IS NULL OR btrim(v_client.primary_service)     = '' THEN v_missing := array_append(v_missing, 'primary_service'); END IF;
  IF v_client.business_phone      IS NULL OR btrim(v_client.business_phone)      = '' THEN v_missing := array_append(v_missing, 'business_phone'); END IF;
  IF v_client.business_hours      IS NULL OR btrim(v_client.business_hours)      = '' THEN v_missing := array_append(v_missing, 'business_hours'); END IF;
  IF v_client.scope_values        IS NULL OR btrim(v_client.scope_values)        = '' THEN v_missing := array_append(v_missing, 'scope_values'); END IF;
  IF v_client.escalation_phone    IS NULL OR btrim(v_client.escalation_phone)    = '' THEN v_missing := array_append(v_missing, 'escalation_phone'); END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'Cannot render prompt for client %: missing required fields: %',
      p_client_id, array_to_string(v_missing, ', ');
  END IF;

  v_result := v_master;
  v_result := replace(v_result, '{{greeting_block}}', v_greeting);

  -- Required fields (validated above)
  v_result := replace(v_result, '{{client_id}}',           v_client.id::text);
  v_result := replace(v_result, '{{business_name}}',       v_client.business_name);
  v_result := replace(v_result, '{{business_short_name}}', v_client.business_short_name);
  v_result := replace(v_result, '{{service_type}}',        v_client.service_type);
  v_result := replace(v_result, '{{primary_service}}',     v_client.primary_service);
  v_result := replace(v_result, '{{business_phone}}',      v_client.business_phone);
  v_result := replace(v_result, '{{business_hours}}',      v_client.business_hours);
  v_result := replace(v_result, '{{scope_values}}',        v_client.scope_values);
  v_result := replace(v_result, '{{escalation_phone}}',    v_client.escalation_phone);

  -- Optional fields (empty OK if absent)
  v_result := replace(v_result, '{{owner_first_name}}',    coalesce(v_client.owner_first_name, ''));
  v_result := replace(v_result, '{{business_website}}',    coalesce(v_client.business_website, ''));
  v_result := replace(v_result, '{{service_area}}',        coalesce(v_client.service_area, ''));
  v_result := replace(v_result, '{{service_constraints}}', coalesce(v_client.service_constraints, ''));
  v_result := replace(v_result, '{{pricing_block}}',       coalesce(v_client.pricing_block, ''));
  v_result := replace(v_result, '{{timezone}}',            coalesce(v_client.timezone_label, v_client.timezone, 'Mountain Time'));

  -- Final sanity: any unreplaced {{tokens}} = typo in template or missing column
  SELECT array_agg(m[1]) INTO v_remaining
  FROM regexp_matches(v_result, '\{\{[a-z_]+\}\}', 'g') AS m;

  IF v_remaining IS NOT NULL AND array_length(v_remaining, 1) > 0 THEN
    RAISE EXCEPTION 'Render produced output with unreplaced tokens for client %: %',
      p_client_id, array_to_string(v_remaining, ', ');
  END IF;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_client_id_by_email(p_email text)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT id
  FROM public."Clients"
  WHERE lower(trim(owner_email)) = lower(trim(p_email))
    AND business_name <> '__platform__'
  ORDER BY id
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.role_rank(role_text text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE role_text
    WHEN 'owner'   THEN 3
    WHEN 'manager' THEN 2
    WHEN 'member'  THEN 1
    ELSE 0
  END;
$function$;

CREATE OR REPLACE FUNCTION public.rotate_stripe_webhook_secret(p_new_secret text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_new_secret IS NULL OR p_new_secret NOT LIKE 'whsec_%' THEN
    RAISE EXCEPTION 'New secret must start with whsec_';
  END IF;

  INSERT INTO public.stripe_webhook_secrets (id, webhook_secret, rotated_at)
  VALUES (1, p_new_secret, now())
  ON CONFLICT (id) DO UPDATE
    SET webhook_secret = EXCLUDED.webhook_secret,
        rotated_at = now();

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rotate_webhook_secret(p_client_id bigint)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_secret text;
  biz_name text;
BEGIN
  SELECT business_name INTO biz_name
  FROM public."Clients"
  WHERE id = p_client_id;

  IF biz_name IS NULL THEN
    RAISE EXCEPTION 'Client with id % not found', p_client_id;
  END IF;

  -- Generate new secret with a slug prefix for human identification
  new_secret := lower(regexp_replace(biz_name, '[^a-zA-Z0-9]+', '_', 'g')) 
    || '_' 
    || encode(gen_random_bytes(24), 'hex');

  UPDATE public."Clients"
  SET webhook_secret = new_secret
  WHERE id = p_client_id;

  PERFORM public.log_audit_event(
    p_action := 'webhook_secret.rotated',
    p_client_id := p_client_id,
    p_target_type := 'client',
    p_target_id := p_client_id::text,
    p_details := jsonb_build_object('business_name', biz_name)
  );

  RETURN new_secret;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_message_for_tenant(p_client_id bigint, p_caller_name text, p_caller_phone text, p_callback_phone text, p_message_body text, p_call_summary_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_message_id bigint;
  v_notification_id bigint;
  v_title text;
BEGIN
  IF p_client_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'client_id required');
  END IF;
  IF p_message_body IS NULL OR length(trim(p_message_body)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'message_body required');
  END IF;

  INSERT INTO public.messages (
    client_id,
    caller_name,
    caller_phone,
    callback_phone,
    message_body,
    call_summary_id
  ) VALUES (
    p_client_id,
    NULLIF(trim(p_caller_name), ''),
    NULLIF(trim(p_caller_phone), ''),
    NULLIF(trim(p_callback_phone), ''),
    trim(p_message_body),
    p_call_summary_id
  )
  RETURNING id INTO v_message_id;

  -- Build notification title from whatever the caller gave us
  v_title := COALESCE(NULLIF(trim(p_caller_name), ''), 'Unknown caller') ||
             ' left a message';

  INSERT INTO public.notifications (
    client_id,
    kind,
    title,
    body,
    link_url,
    source_message_id,
    source_call_summary_id
  ) VALUES (
    p_client_id,
    'message_left',
    v_title,
    left(trim(p_message_body), 140),
    '/app/messages/' || v_message_id,
    v_message_id,
    p_call_summary_id
  )
  RETURNING id INTO v_notification_id;

  RETURN jsonb_build_object(
    'ok', true,
    'message_id', v_message_id,
    'notification_id', v_notification_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_rendered_system_prompt(p_client_id bigint)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rendered text;
BEGIN
  v_rendered := public.render_system_prompt(p_client_id);

  UPDATE public."Clients"
  SET system_prompt = v_rendered
  WHERE id = p_client_id;

  RETURN v_rendered;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_client_active_by_subscription(p_stripe_subscription_id text, p_is_active boolean)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_client_id bigint;
BEGIN
  SELECT s.client_id INTO v_client_id
  FROM public.subscriptions s
  WHERE s.stripe_subscription_id = p_stripe_subscription_id
  LIMIT 1;

  IF v_client_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public."Clients"
  SET is_active = p_is_active
  WHERE id = v_client_id;

  RETURN v_client_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_clients_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_job_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_name   text;
  v_slug   text;
  v_tz     text;
  v_mmyy   text;
  v_prefix text;
  v_next   int;
begin
  if NEW.job_number is not null then
    return NEW;
  end if;

  if NEW.contact_id is not null then
    select name into v_name from public.contacts where id = NEW.contact_id;
  end if;
  v_slug := public.job_number_slug(coalesce(v_name, NEW.name));

  select timezone into v_tz from public."Clients" where id = NEW.client_id;
  v_tz := coalesce(v_tz, 'America/Denver');
  v_mmyy := to_char((coalesce(NEW.created_at, now()) at time zone v_tz), 'MMYY');

  v_prefix := v_slug || '-' || v_mmyy;

  perform pg_advisory_xact_lock(
    hashtextextended(NEW.client_id::text || ':' || v_prefix, 0));

  select coalesce(
           max((substring(job_number from char_length(v_prefix) + 1))::int),
           0) + 1
    into v_next
  from public.jobs
  where client_id = NEW.client_id
    and job_number like v_prefix || '%'
    and substring(job_number from char_length(v_prefix) + 1) ~ '^[0-9]+$';

  NEW.job_number := v_prefix || lpad(v_next::text, 2, '0');
  return NEW;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_properties_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at_sms_reply_templates()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at_sms_scheduled()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$;

CREATE OR REPLACE FUNCTION public.sms_threads_update_on_message()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.direction = 'inbound' THEN
    UPDATE sms_threads
    SET last_inbound_at = NEW.created_at,
        last_message_at = NEW.created_at,
        last_message_preview = LEFT(NEW.body, 200),
        updated_at = now()
    WHERE id = NEW.thread_id;
  ELSE
    UPDATE sms_threads
    SET last_outbound_at = NEW.created_at,
        last_message_at = NEW.created_at,
        last_message_preview = LEFT(NEW.body, 200),
        updated_at = now()
    WHERE id = NEW.thread_id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tags_decrement_use_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE public.tags SET use_count = GREATEST(use_count - 1, 0) WHERE id = OLD.tag_id;
  RETURN OLD;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tags_increment_use_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE public.tags SET use_count = use_count + 1 WHERE id = NEW.tag_id;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.touch_contacts_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_client_users_role_change_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_role text;
BEGIN
  -- Service role bypass: auth.uid() returns NULL
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip if role isn't actually changing
  IF NEW.role IS NOT DISTINCT FROM OLD.role THEN
    RETURN NEW;
  END IF;

  -- Rule 1: No self-role-change ever
  IF NEW.auth_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot change your own role. Another owner or manager must do it.';
  END IF;

  v_actor_role := public.user_role_in_client(NEW.client_id);

  -- Rule 2: Members and non-members cannot change roles
  IF v_actor_role IS NULL OR v_actor_role = 'member' THEN
    RAISE EXCEPTION 'Insufficient privileges to change roles.';
  END IF;

  -- Rule 3: Managers cannot promote to owner
  IF v_actor_role = 'manager' AND NEW.role = 'owner' THEN
    RAISE EXCEPTION 'Managers cannot promote users to owner. An owner must do this.';
  END IF;

  -- Rule 4: Managers cannot change owner roles (defense in depth)
  IF v_actor_role = 'manager' AND OLD.role = 'owner' THEN
    RAISE EXCEPTION 'Managers cannot change owner roles.';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_clients_protect_system_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Service role bypass: auth.uid() returns NULL
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Platform admin bypass
  IF public.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  -- Infra / integration config (system-breaking)
  IF NEW.twilio_number              IS DISTINCT FROM OLD.twilio_number              THEN RAISE EXCEPTION 'twilio_number is platform-admin only'; END IF;
  IF NEW.vapi_assistant_id          IS DISTINCT FROM OLD.vapi_assistant_id          THEN RAISE EXCEPTION 'vapi_assistant_id is platform-admin only'; END IF;
  IF NEW.vapi_voice_id              IS DISTINCT FROM OLD.vapi_voice_id              THEN RAISE EXCEPTION 'vapi_voice_id is platform-admin only'; END IF;
  IF NEW.system_prompt              IS DISTINCT FROM OLD.system_prompt              THEN RAISE EXCEPTION 'system_prompt is platform-admin only'; END IF;
  IF NEW.calendar_id                IS DISTINCT FROM OLD.calendar_id                THEN RAISE EXCEPTION 'calendar_id is platform-admin only'; END IF;
  IF NEW.stripe_connect_account_id  IS DISTINCT FROM OLD.stripe_connect_account_id  THEN RAISE EXCEPTION 'stripe_connect_account_id is platform-admin only'; END IF;
  IF NEW.intake_mode                IS DISTINCT FROM OLD.intake_mode                THEN RAISE EXCEPTION 'intake_mode is platform-admin only'; END IF;
  IF NEW.is_test                    IS DISTINCT FROM OLD.is_test                    THEN RAISE EXCEPTION 'is_test is platform-admin only'; END IF;
  IF NEW.is_active                  IS DISTINCT FROM OLD.is_active                  THEN RAISE EXCEPTION 'is_active is platform-admin only'; END IF;
  IF NEW.feature_sms_enabled        IS DISTINCT FROM OLD.feature_sms_enabled        THEN RAISE EXCEPTION 'feature_sms_enabled is platform-admin only'; END IF;
  IF NEW.feature_voice_enabled      IS DISTINCT FROM OLD.feature_voice_enabled      THEN RAISE EXCEPTION 'feature_voice_enabled is platform-admin only'; END IF;
  IF NEW.feature_calendar_enabled   IS DISTINCT FROM OLD.feature_calendar_enabled   THEN RAISE EXCEPTION 'feature_calendar_enabled is platform-admin only'; END IF;
  IF NEW.feature_billing_enabled    IS DISTINCT FROM OLD.feature_billing_enabled    THEN RAISE EXCEPTION 'feature_billing_enabled is platform-admin only'; END IF;
  IF NEW.feature_estimator_enabled  IS DISTINCT FROM OLD.feature_estimator_enabled  THEN RAISE EXCEPTION 'feature_estimator_enabled is platform-admin only'; END IF;
  IF NEW.feature_receipt_ai_enabled IS DISTINCT FROM OLD.feature_receipt_ai_enabled THEN RAISE EXCEPTION 'feature_receipt_ai_enabled is platform-admin only'; END IF;
  IF NEW.webhook_secret             IS DISTINCT FROM OLD.webhook_secret             THEN RAISE EXCEPTION 'webhook_secret is platform-admin only'; END IF;

  -- Identity / billing linkage
  IF NEW.owner_email                IS DISTINCT FROM OLD.owner_email                THEN RAISE EXCEPTION 'owner_email is platform-admin only'; END IF;

  -- Prompt content (changes assistant behavior / what it says aloud)
  IF NEW.business_name              IS DISTINCT FROM OLD.business_name              THEN RAISE EXCEPTION 'business_name change requires platform admin (prompt content)'; END IF;
  IF NEW.business_short_name        IS DISTINCT FROM OLD.business_short_name        THEN RAISE EXCEPTION 'business_short_name change requires platform admin (prompt content)'; END IF;
  IF NEW.business_phone             IS DISTINCT FROM OLD.business_phone             THEN RAISE EXCEPTION 'business_phone change requires platform admin (prompt content)'; END IF;
  IF NEW.business_website           IS DISTINCT FROM OLD.business_website           THEN RAISE EXCEPTION 'business_website change requires platform admin (prompt content)'; END IF;
  IF NEW.business_hours             IS DISTINCT FROM OLD.business_hours             THEN RAISE EXCEPTION 'business_hours change requires platform admin (prompt content)'; END IF;
  IF NEW.service_type               IS DISTINCT FROM OLD.service_type               THEN RAISE EXCEPTION 'service_type change requires platform admin (prompt content)'; END IF;
  IF NEW.primary_service            IS DISTINCT FROM OLD.primary_service            THEN RAISE EXCEPTION 'primary_service change requires platform admin (prompt content)'; END IF;
  IF NEW.service_area               IS DISTINCT FROM OLD.service_area               THEN RAISE EXCEPTION 'service_area change requires platform admin (prompt content)'; END IF;
  IF NEW.service_constraints        IS DISTINCT FROM OLD.service_constraints        THEN RAISE EXCEPTION 'service_constraints change requires platform admin (prompt content)'; END IF;
  IF NEW.scope_values               IS DISTINCT FROM OLD.scope_values               THEN RAISE EXCEPTION 'scope_values change requires platform admin (prompt content)'; END IF;
  IF NEW.pricing_block              IS DISTINCT FROM OLD.pricing_block              THEN RAISE EXCEPTION 'pricing_block change requires platform admin (prompt content)'; END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_clients_trim_text_fields()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.twilio_number := btrim(NEW.twilio_number);
  NEW.vapi_assistant_id := btrim(NEW.vapi_assistant_id);
  NEW.calendar_id := btrim(NEW.calendar_id);
  NEW.owner_email := lower(btrim(NEW.owner_email));
  NEW.business_short_name := btrim(NEW.business_short_name);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_jobs_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_contact(p_client_id bigint, p_phone text, p_name text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_address text DEFAULT NULL::text)
 RETURNS contacts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_normalized_phone text;
  v_result public.contacts;
BEGIN
  v_normalized_phone := public.normalize_phone(p_phone);

  IF v_normalized_phone IS NULL THEN
    RAISE EXCEPTION 'Invalid phone number for contact upsert: %', p_phone
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.contacts (
    client_id, phone, name, email, address,
    first_contacted_at, last_contacted_at
  )
  VALUES (
    p_client_id,
    v_normalized_phone,
    NULLIF(trim(p_name), ''),
    NULLIF(trim(p_email), ''),
    NULLIF(trim(p_address), ''),
    now(),
    now()
  )
  ON CONFLICT (client_id, phone) WHERE phone IS NOT NULL
  DO UPDATE SET
    -- COALESCE: keep existing if set, else use the new value
    -- This is what makes manual edits stick across calls
    name              = COALESCE(public.contacts.name,  EXCLUDED.name),
    email             = COALESCE(public.contacts.email, EXCLUDED.email),
    address           = COALESCE(public.contacts.address, EXCLUDED.address),
    last_contacted_at = now()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_subscription_from_stripe(p_email text DEFAULT NULL::text, p_client_id bigint DEFAULT NULL::bigint, p_stripe_customer_id text DEFAULT NULL::text, p_stripe_subscription_id text DEFAULT NULL::text, p_status text DEFAULT 'active'::text, p_current_period_end timestamp with time zone DEFAULT NULL::timestamp with time zone, p_setup_fee_paid_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_monthly_price_cents integer DEFAULT 39700, p_setup_fee_cents integer DEFAULT 29900, p_cancel_at_period_end boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_client_id bigint;
  v_row_id bigint;
  v_was_insert boolean;
  v_action text;
  v_status text;
BEGIN
  v_status := CASE WHEN p_status = 'canceled' THEN 'cancelled' ELSE p_status END;

  IF v_status NOT IN ('incomplete', 'active', 'past_due', 'cancelled', 'paused', 'trialing') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid status: ' || v_status);
  END IF;

  v_client_id := p_client_id;

  IF v_client_id IS NULL AND p_stripe_subscription_id IS NOT NULL THEN
    SELECT client_id INTO v_client_id
    FROM public.subscriptions
    WHERE stripe_subscription_id = p_stripe_subscription_id
    LIMIT 1;
  END IF;

  IF v_client_id IS NULL AND p_stripe_customer_id IS NOT NULL THEN
    SELECT client_id INTO v_client_id
    FROM public.subscriptions
    WHERE stripe_customer_id = p_stripe_customer_id
    LIMIT 1;
  END IF;

  IF v_client_id IS NULL AND p_email IS NOT NULL THEN
    SELECT id INTO v_client_id
    FROM public."Clients"
    WHERE lower(trim(owner_email)) = lower(trim(p_email))
      AND business_name <> '__platform__'
    ORDER BY id
    LIMIT 1;
  END IF;

  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'cannot resolve client_id from explicit id, subscription_id, customer_id, or email',
      'email_tried', p_email,
      'subscription_id_tried', p_stripe_subscription_id,
      'customer_id_tried', p_stripe_customer_id
    );
  END IF;

  INSERT INTO public.subscriptions (
    client_id,
    stripe_customer_id,
    stripe_subscription_id,
    status,
    setup_fee_paid_at,
    current_period_end,
    monthly_price_cents,
    setup_fee_cents,
    cancel_at_period_end
  ) VALUES (
    v_client_id,
    p_stripe_customer_id,
    p_stripe_subscription_id,
    v_status,
    p_setup_fee_paid_at,
    p_current_period_end,
    COALESCE(p_monthly_price_cents, 39700),
    COALESCE(p_setup_fee_cents, 29900),
    COALESCE(p_cancel_at_period_end, false)
  )
  ON CONFLICT (stripe_subscription_id) DO UPDATE
  SET
    status = EXCLUDED.status,
    stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, subscriptions.stripe_customer_id),
    current_period_end = COALESCE(EXCLUDED.current_period_end, subscriptions.current_period_end),
    setup_fee_paid_at = COALESCE(EXCLUDED.setup_fee_paid_at, subscriptions.setup_fee_paid_at),
    cancel_at_period_end = CASE
      WHEN p_cancel_at_period_end IS NULL THEN subscriptions.cancel_at_period_end
      ELSE EXCLUDED.cancel_at_period_end
    END,
    updated_at = now()
  RETURNING id, (xmax = 0) INTO v_row_id, v_was_insert;

  v_action := CASE WHEN v_was_insert THEN 'inserted' ELSE 'updated' END;

  IF v_status IN ('active', 'trialing') THEN
    UPDATE public."Clients" SET is_active = true WHERE id = v_client_id;
  ELSIF v_status IN ('past_due', 'cancelled', 'paused') THEN
    UPDATE public."Clients" SET is_active = false WHERE id = v_client_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'row_id', v_row_id,
    'client_id', v_client_id,
    'action', v_action,
    'status', v_status,
    'cancel_at_period_end', COALESCE(p_cancel_at_period_end, false)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.user_can_write_client(target_client_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.client_users
    WHERE auth_user_id = auth.uid()
      AND client_id = target_client_id
      AND role IN ('owner', 'manager')
  );
$function$;

CREATE OR REPLACE FUNCTION public.user_has_client_access(target_client_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.client_users
    WHERE auth_user_id = auth.uid()
      AND client_id = target_client_id
  );
$function$;

CREATE OR REPLACE FUNCTION public.user_role_in_client(target_client_id bigint)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT role
  FROM public.client_users
  WHERE auth_user_id = auth.uid()
    AND client_id = target_client_id
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.verify_stripe_signature(p_body text, p_signature_header text, p_tolerance_seconds integer DEFAULT 300)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_secret text;
  v_timestamp bigint;
  v_signed_payload text;
  v_expected_sig text;
  v_now bigint := extract(epoch FROM now())::bigint;
  v_part text;
  v_v1_sigs text[] := ARRAY[]::text[];
BEGIN
  -- Stripe signature header format:
  --   t=<timestamp>,v1=<sig1>,v1=<sig2>,v0=<legacy>
  -- We accept any v1 match.
  IF p_signature_header IS NULL OR p_body IS NULL THEN
    RETURN false;
  END IF;

  FOR v_part IN SELECT btrim(unnest(string_to_array(p_signature_header, ',')))
  LOOP
    IF v_part LIKE 't=%' THEN
      BEGIN
        v_timestamp := substr(v_part, 3)::bigint;
      EXCEPTION WHEN OTHERS THEN
        RETURN false;
      END;
    ELSIF v_part LIKE 'v1=%' THEN
      v_v1_sigs := array_append(v_v1_sigs, substr(v_part, 4));
    END IF;
  END LOOP;

  -- Require timestamp + at least one v1 sig
  IF v_timestamp IS NULL OR array_length(v_v1_sigs, 1) IS NULL THEN
    RETURN false;
  END IF;

  -- Replay protection: timestamp within tolerance window
  IF abs(v_now - v_timestamp) > p_tolerance_seconds THEN
    RETURN false;
  END IF;

  -- Read secret (service-role only)
  SELECT webhook_secret INTO v_secret
  FROM public.stripe_webhook_secrets WHERE id = 1;

  IF v_secret IS NULL OR v_secret = '' THEN
    RETURN false;
  END IF;

  -- Compute HMAC-SHA256 of "<timestamp>.<body>"
  v_signed_payload := v_timestamp::text || '.' || p_body;
  v_expected_sig := encode(
    extensions.hmac(v_signed_payload, v_secret, 'sha256'),
    'hex'
  );

  -- Match against any v1 signature in the header
  RETURN v_expected_sig = ANY(v_v1_sigs);
END;
$function$;

-- ==========================================================================
-- Column defaults
-- ==========================================================================

ALTER TABLE ONLY public."Clients" ALTER COLUMN callback_window SET DEFAULT 'within the hour'::text;

ALTER TABLE ONLY public."Clients" ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public."Clients" ALTER COLUMN default_duration_minutes SET DEFAULT 60;

ALTER TABLE ONLY public."Clients" ALTER COLUMN feature_billing_enabled SET DEFAULT true;

ALTER TABLE ONLY public."Clients" ALTER COLUMN feature_calendar_enabled SET DEFAULT false;

ALTER TABLE ONLY public."Clients" ALTER COLUMN feature_estimator_enabled SET DEFAULT false;

ALTER TABLE ONLY public."Clients" ALTER COLUMN feature_receipt_ai_enabled SET DEFAULT false;

ALTER TABLE ONLY public."Clients" ALTER COLUMN feature_sms_enabled SET DEFAULT true;

ALTER TABLE ONLY public."Clients" ALTER COLUMN feature_voice_enabled SET DEFAULT true;

ALTER TABLE ONLY public."Clients" ALTER COLUMN intake_mode SET DEFAULT 'primary'::text;

ALTER TABLE ONLY public."Clients" ALTER COLUMN is_test SET DEFAULT false;

ALTER TABLE ONLY public."Clients" ALTER COLUMN notify_dashboard_ping SET DEFAULT true;

ALTER TABLE ONLY public."Clients" ALTER COLUMN notify_email SET DEFAULT true;

ALTER TABLE ONLY public."Clients" ALTER COLUMN notify_sms SET DEFAULT false;

ALTER TABLE ONLY public."Clients" ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE ONLY public."Clients" ALTER COLUMN webhook_secret SET DEFAULT encode(gen_random_bytes(24), 'hex'::text);

ALTER TABLE ONLY public.actual_materials ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.actual_materials ALTER COLUMN id SET DEFAULT nextval('actual_materials_id_seq'::regclass);

ALTER TABLE ONLY public.audit_log ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.audit_log ALTER COLUMN details SET DEFAULT '{}'::jsonb;

ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('audit_log_id_seq'::regclass);

ALTER TABLE ONLY public.billing_entities ALTER COLUMN active SET DEFAULT true;

ALTER TABLE ONLY public.billing_entities ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.billing_entities ALTER COLUMN id SET DEFAULT nextval('billing_entities_id_seq'::regclass);

ALTER TABLE ONLY public.billing_entities ALTER COLUMN is_default SET DEFAULT false;

ALTER TABLE ONLY public.billing_entities ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE ONLY public.calendar_connections ALTER COLUMN connected_at SET DEFAULT now();

ALTER TABLE ONLY public.calendar_connections ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.calendar_connections ALTER COLUMN provider SET DEFAULT 'google'::text;

ALTER TABLE ONLY public.calendar_connections ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE ONLY public.call_summaries ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.client_secrets ALTER COLUMN rotated_at SET DEFAULT now();

ALTER TABLE ONLY public.client_secrets ALTER COLUMN webhook_secret SET DEFAULT encode(gen_random_bytes(24), 'hex'::text);

ALTER TABLE ONLY public.client_users ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.client_users ALTER COLUMN role SET DEFAULT 'member'::text;

ALTER TABLE ONLY public.contact_tags ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.contacts ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.contacts ALTER COLUMN tags SET DEFAULT '{}'::text[];

ALTER TABLE ONLY public.contacts ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE ONLY public.estimate_line_items ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.estimate_line_items ALTER COLUMN id SET DEFAULT nextval('estimate_line_items_id_seq'::regclass);

ALTER TABLE ONLY public.estimate_line_items ALTER COLUMN is_hardware SET DEFAULT false;

ALTER TABLE ONLY public.estimate_line_items ALTER COLUMN resolved_client_amount SET DEFAULT 0;

ALTER TABLE ONLY public.estimate_line_items ALTER COLUMN resolved_labor_cost SET DEFAULT 0;

ALTER TABLE ONLY public.estimate_line_items ALTER COLUMN resolved_labor_hours SET DEFAULT 0;

ALTER TABLE ONLY public.estimate_line_items ALTER COLUMN resolved_line_cost SET DEFAULT 0;

ALTER TABLE ONLY public.estimate_line_items ALTER COLUMN resolved_loaded_rate SET DEFAULT 0;

ALTER TABLE ONLY public.estimate_line_items ALTER COLUMN resolved_material_cost SET DEFAULT 0;

ALTER TABLE ONLY public.estimate_line_items ALTER COLUMN resolved_prep_multiplier SET DEFAULT 1;

ALTER TABLE ONLY public.estimate_line_items ALTER COLUMN sort_order SET DEFAULT 0;

ALTER TABLE ONLY public.estimate_materials ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.estimate_materials ALTER COLUMN id SET DEFAULT nextval('estimate_materials_id_seq'::regclass);

ALTER TABLE ONLY public.estimate_materials ALTER COLUMN resolved_total SET DEFAULT 0;

ALTER TABLE ONLY public.estimate_materials ALTER COLUMN resolved_unit_cost SET DEFAULT 0;

ALTER TABLE ONLY public.estimates ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.estimates ALTER COLUMN id SET DEFAULT nextval('estimates_id_seq'::regclass);

ALTER TABLE ONLY public.estimates ALTER COLUMN status SET DEFAULT 'draft'::text;

ALTER TABLE ONLY public.estimates ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE ONLY public.estimates ALTER COLUMN version SET DEFAULT 1;

ALTER TABLE ONLY public.expenses ALTER COLUMN assignment SET DEFAULT 'unassigned'::text;

ALTER TABLE ONLY public.expenses ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.expenses ALTER COLUMN customer_notified SET DEFAULT false;

ALTER TABLE ONLY public.expenses ALTER COLUMN expense_date SET DEFAULT CURRENT_DATE;

ALTER TABLE ONLY public.expenses ALTER COLUMN id SET DEFAULT nextval('expenses_id_seq'::regclass);

ALTER TABLE ONLY public.invitations ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.invitations ALTER COLUMN expires_at SET DEFAULT (now() + '7 days'::interval);

ALTER TABLE ONLY public.invoices ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.invoices ALTER COLUMN due_terms SET DEFAULT 'Due on receipt'::text;

ALTER TABLE ONLY public.invoices ALTER COLUMN line_items SET DEFAULT '[]'::jsonb;

ALTER TABLE ONLY public.invoices ALTER COLUMN status SET DEFAULT 'draft'::text;

ALTER TABLE ONLY public.invoices ALTER COLUMN subtotal_cents SET DEFAULT 0;

ALTER TABLE ONLY public.invoices ALTER COLUMN tax_cents SET DEFAULT 0;

ALTER TABLE ONLY public.invoices ALTER COLUMN tax_rate_pct SET DEFAULT 0;

ALTER TABLE ONLY public.invoices ALTER COLUMN total_cents SET DEFAULT 0;

ALTER TABLE ONLY public.invoices ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE ONLY public.job_status_log ALTER COLUMN changed_at SET DEFAULT now();

ALTER TABLE ONLY public.job_status_log ALTER COLUMN id SET DEFAULT nextval('job_status_log_id_seq'::regclass);

ALTER TABLE ONLY public.job_tags ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.jobs ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.jobs ALTER COLUMN details SET DEFAULT '{}'::jsonb;

ALTER TABLE ONLY public.jobs ALTER COLUMN sms_consent SET DEFAULT 'no'::text;

ALTER TABLE ONLY public.jobs ALTER COLUMN source SET DEFAULT 'phone-call'::text;

ALTER TABLE ONLY public.jobs ALTER COLUMN status SET DEFAULT 'lead'::text;

ALTER TABLE ONLY public.jobs ALTER COLUMN tags SET DEFAULT '{}'::text[];

ALTER TABLE ONLY public.jobs ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE ONLY public.lead_intake ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.lead_intake ALTER COLUMN id SET DEFAULT nextval('lead_intake_id_seq'::regclass);

ALTER TABLE ONLY public.lead_intake ALTER COLUMN source SET DEFAULT 'getfield_signup'::text;

ALTER TABLE ONLY public.lead_intake ALTER COLUMN status SET DEFAULT 'new'::text;

ALTER TABLE ONLY public.materials ALTER COLUMN active SET DEFAULT true;

ALTER TABLE ONLY public.materials ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.materials ALTER COLUMN id SET DEFAULT nextval('materials_id_seq'::regclass);

ALTER TABLE ONLY public.materials ALTER COLUMN is_placeholder SET DEFAULT false;

ALTER TABLE ONLY public.materials ALTER COLUMN purchasable_unit_size SET DEFAULT 1;

ALTER TABLE ONLY public.materials ALTER COLUMN unit_cost SET DEFAULT 0;

ALTER TABLE ONLY public.materials ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE ONLY public.messages ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.mileage_entries ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.mileage_entries ALTER COLUMN round_trip SET DEFAULT true;

ALTER TABLE ONLY public.mileage_entries ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE ONLY public.mileage_rates ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.mileage_rates ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE ONLY public.notifications ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.onboard_intake_log ALTER COLUMN accepted SET DEFAULT true;

ALTER TABLE ONLY public.onboard_intake_log ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.onboard_intake_log ALTER COLUMN id SET DEFAULT nextval('onboard_intake_log_id_seq'::regclass);

ALTER TABLE ONLY public.overhead_items ALTER COLUMN active SET DEFAULT true;

ALTER TABLE ONLY public.overhead_items ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.overhead_items ALTER COLUMN id SET DEFAULT nextval('overhead_items_id_seq'::regclass);

ALTER TABLE ONLY public.overhead_items ALTER COLUMN monthly_amount SET DEFAULT 0;

ALTER TABLE ONLY public.overhead_items ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE ONLY public.platform_admins ALTER COLUMN added_at SET DEFAULT now();

ALTER TABLE ONLY public.price_modifiers ALTER COLUMN active SET DEFAULT true;

ALTER TABLE ONLY public.price_modifiers ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.price_modifiers ALTER COLUMN id SET DEFAULT nextval('price_modifiers_id_seq'::regclass);

ALTER TABLE ONLY public.price_modifiers ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE ONLY public.pricing_settings ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.pricing_settings ALTER COLUMN desired_annual_owner_pay SET DEFAULT 0;

ALTER TABLE ONLY public.pricing_settings ALTER COLUMN hours_worked_per_week SET DEFAULT 40;

ALTER TABLE ONLY public.pricing_settings ALTER COLUMN margin_pct SET DEFAULT 0.40;

ALTER TABLE ONLY public.pricing_settings ALTER COLUMN material_markup_pct SET DEFAULT 0;

ALTER TABLE ONLY public.pricing_settings ALTER COLUMN minimum_job_charge SET DEFAULT 150;

ALTER TABLE ONLY public.pricing_settings ALTER COLUMN rounding_increment SET DEFAULT 5;

ALTER TABLE ONLY public.pricing_settings ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE ONLY public.pricing_settings ALTER COLUMN utilization_pct SET DEFAULT 0.55;

ALTER TABLE ONLY public.prompt_templates ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.prompt_templates ALTER COLUMN is_active SET DEFAULT true;

ALTER TABLE ONLY public.prompt_templates ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE ONLY public.properties ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.properties ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE ONLY public.purchases ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.purchases ALTER COLUMN id SET DEFAULT nextval('purchases_id_seq'::regclass);

ALTER TABLE ONLY public.purchases ALTER COLUMN purchase_date SET DEFAULT CURRENT_DATE;

ALTER TABLE ONLY public.purchases ALTER COLUMN receipt_paths SET DEFAULT '{}'::text[];

ALTER TABLE ONLY public.purchases ALTER COLUMN source SET DEFAULT 'manual'::text;

ALTER TABLE ONLY public.receipt_scans ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.receipt_scans ALTER COLUMN id SET DEFAULT nextval('receipt_scans_id_seq'::regclass);

ALTER TABLE ONLY public.receipt_scans ALTER COLUMN input_tokens SET DEFAULT 0;

ALTER TABLE ONLY public.receipt_scans ALTER COLUMN output_tokens SET DEFAULT 0;

ALTER TABLE ONLY public.service_catalog ALTER COLUMN active SET DEFAULT true;

ALTER TABLE ONLY public.service_catalog ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.service_catalog ALTER COLUMN id SET DEFAULT nextval('service_catalog_id_seq'::regclass);

ALTER TABLE ONLY public.service_catalog ALTER COLUMN is_placeholder SET DEFAULT false;

ALTER TABLE ONLY public.service_catalog ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE ONLY public.service_materials ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.service_materials ALTER COLUMN id SET DEFAULT nextval('service_materials_id_seq'::regclass);

ALTER TABLE ONLY public.service_materials ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE ONLY public.sms_messages ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.sms_reply_templates ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.sms_reply_templates ALTER COLUMN id SET DEFAULT nextval('sms_reply_templates_id_seq'::regclass);

ALTER TABLE ONLY public.sms_reply_templates ALTER COLUMN sort_order SET DEFAULT 0;

ALTER TABLE ONLY public.sms_reply_templates ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE ONLY public.sms_scheduled ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.sms_scheduled ALTER COLUMN id SET DEFAULT nextval('sms_scheduled_id_seq'::regclass);

ALTER TABLE ONLY public.sms_scheduled ALTER COLUMN status SET DEFAULT 'pending'::text;

ALTER TABLE ONLY public.sms_scheduled ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE ONLY public.sms_sessions ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.sms_sessions ALTER COLUMN status SET DEFAULT 'active'::text;

ALTER TABLE ONLY public.sms_threads ALTER COLUMN consent_status SET DEFAULT 'active'::text;

ALTER TABLE ONLY public.sms_threads ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.sms_threads ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE ONLY public.stripe_webhook_secrets ALTER COLUMN id SET DEFAULT 1;

ALTER TABLE ONLY public.stripe_webhook_secrets ALTER COLUMN rotated_at SET DEFAULT now();

ALTER TABLE ONLY public.subscriptions ALTER COLUMN cancel_at_period_end SET DEFAULT false;

ALTER TABLE ONLY public.subscriptions ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.subscriptions ALTER COLUMN monthly_price_cents SET DEFAULT 39700;

ALTER TABLE ONLY public.subscriptions ALTER COLUMN setup_fee_cents SET DEFAULT 29900;

ALTER TABLE ONLY public.subscriptions ALTER COLUMN status SET DEFAULT 'incomplete'::text;

ALTER TABLE ONLY public.subscriptions ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE ONLY public.tags ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.tags ALTER COLUMN id SET DEFAULT nextval('tags_id_seq'::regclass);

ALTER TABLE ONLY public.tags ALTER COLUMN use_count SET DEFAULT 0;

ALTER TABLE ONLY public.task_photos ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.task_photos ALTER COLUMN id SET DEFAULT nextval('task_photos_id_seq'::regclass);

ALTER TABLE ONLY public.tasks ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.tasks ALTER COLUMN id SET DEFAULT nextval('tasks_id_seq'::regclass);

ALTER TABLE ONLY public.tasks ALTER COLUMN sort_order SET DEFAULT 0;

ALTER TABLE ONLY public.tasks ALTER COLUMN status SET DEFAULT 'open'::text;

ALTER TABLE ONLY public.tasks ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE ONLY public.team_audit_log ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.team_audit_log ALTER COLUMN id SET DEFAULT nextval('team_audit_log_id_seq'::regclass);

ALTER TABLE ONLY public.time_entries ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.time_entries ALTER COLUMN entry_date SET DEFAULT CURRENT_DATE;

ALTER TABLE ONLY public.time_entries ALTER COLUMN id SET DEFAULT nextval('time_entries_id_seq'::regclass);

ALTER TABLE ONLY public.travel_zones ALTER COLUMN active SET DEFAULT true;

ALTER TABLE ONLY public.travel_zones ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.travel_zones ALTER COLUMN flat_fee SET DEFAULT 0;

ALTER TABLE ONLY public.travel_zones ALTER COLUMN id SET DEFAULT nextval('travel_zones_id_seq'::regclass);

ALTER TABLE ONLY public.travel_zones ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE ONLY public.workflow_errors ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE ONLY public.workflow_errors ALTER COLUMN id SET DEFAULT nextval('workflow_errors_id_seq'::regclass);

-- ==========================================================================
-- Constraints
-- ==========================================================================

ALTER TABLE ONLY public."Clients" ADD CONSTRAINT "Clients_intake_mode_check" CHECK ((intake_mode = ANY (ARRAY['primary'::text, 'overflow'::text, 'voicemail'::text])));

ALTER TABLE ONLY public."Clients" ADD CONSTRAINT "Clients_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Clients" ADD CONSTRAINT clients_owner_email_format_chk CHECK (((owner_email IS NULL) OR (owner_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text)));

ALTER TABLE ONLY public."Clients" ADD CONSTRAINT clients_twilio_number_e164_chk CHECK (((twilio_number IS NULL) OR (twilio_number ~ '^\+\d{10,15}$'::text)));

ALTER TABLE ONLY public."Clients" ADD CONSTRAINT clients_vapi_assistant_uuid_chk CHECK (((vapi_assistant_id IS NULL) OR (vapi_assistant_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text)));

ALTER TABLE ONLY public.actual_materials ADD CONSTRAINT actual_materials_actual_cost_check CHECK ((actual_cost >= (0)::numeric));

ALTER TABLE ONLY public.actual_materials ADD CONSTRAINT actual_materials_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.actual_materials ADD CONSTRAINT actual_materials_qty_check CHECK (((qty IS NULL) OR (qty > (0)::numeric)));

ALTER TABLE ONLY public.audit_log ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.billing_entities ADD CONSTRAINT billing_entities_invoice_prefix_check CHECK ((invoice_prefix ~ '^[A-Z0-9]{1,8}$'::text));

ALTER TABLE ONLY public.billing_entities ADD CONSTRAINT billing_entities_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.billing_entities ADD CONSTRAINT billing_entities_prefix_per_client UNIQUE (client_id, invoice_prefix);

ALTER TABLE ONLY public.calendar_connections ADD CONSTRAINT calendar_connections_client_id_key UNIQUE (client_id);

ALTER TABLE ONLY public.calendar_connections ADD CONSTRAINT calendar_connections_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.calendar_connections ADD CONSTRAINT calendar_connections_provider_check CHECK ((provider = 'google'::text));

ALTER TABLE ONLY public.call_summaries ADD CONSTRAINT call_summaries_intent_check CHECK (((intent IS NULL) OR (intent = ANY (ARRAY['estimate'::text, 'booking'::text, 'message'::text, 'callback'::text, 'inquiry'::text, 'other'::text, 'unknown'::text]))));

ALTER TABLE ONLY public.call_summaries ADD CONSTRAINT call_summaries_outcome_check CHECK (((outcome IS NULL) OR (outcome = ANY (ARRAY['estimate_saved'::text, 'booking_saved'::text, 'booking_rescheduled'::text, 'booking_cancelled'::text, 'message_left'::text, 'callback_received'::text, 'no_action'::text, 'transferred'::text, 'dropped'::text, 'error'::text]))));

ALTER TABLE ONLY public.call_summaries ADD CONSTRAINT call_summaries_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.call_summaries ADD CONSTRAINT call_summaries_vapi_call_id_key UNIQUE (vapi_call_id);

ALTER TABLE ONLY public.client_secrets ADD CONSTRAINT client_secrets_pkey PRIMARY KEY (client_id);

ALTER TABLE ONLY public.client_secrets ADD CONSTRAINT client_secrets_webhook_secret_key UNIQUE (webhook_secret);

ALTER TABLE ONLY public.client_users ADD CONSTRAINT client_users_auth_user_id_client_id_key UNIQUE (auth_user_id, client_id);

ALTER TABLE ONLY public.client_users ADD CONSTRAINT client_users_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.client_users ADD CONSTRAINT client_users_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'manager'::text, 'member'::text])));

ALTER TABLE ONLY public.contact_tags ADD CONSTRAINT contact_tags_pkey PRIMARY KEY (contact_id, tag_id);

ALTER TABLE ONLY public.contacts ADD CONSTRAINT contacts_phone_e164_chk CHECK (((phone IS NULL) OR (phone ~ '^\+\d{10,15}$'::text)));

ALTER TABLE ONLY public.contacts ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.estimate_line_items ADD CONSTRAINT estimate_line_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.estimate_line_items ADD CONSTRAINT estimate_line_items_qty_check CHECK ((qty > (0)::numeric));

ALTER TABLE ONLY public.estimate_line_items ADD CONSTRAINT estimate_line_items_type_check CHECK ((type = ANY (ARRAY['MEASURED'::text, 'TASK'::text])));

ALTER TABLE ONLY public.estimate_materials ADD CONSTRAINT estimate_materials_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.estimate_materials ADD CONSTRAINT estimate_materials_qty_check CHECK ((qty > (0)::numeric));

ALTER TABLE ONLY public.estimates ADD CONSTRAINT estimates_override_needs_reason CHECK (((manual_override_price IS NULL) OR ((override_reason IS NOT NULL) AND (btrim(override_reason) <> ''::text))));

ALTER TABLE ONLY public.estimates ADD CONSTRAINT estimates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.estimates ADD CONSTRAINT estimates_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'accepted'::text, 'lost'::text])));

ALTER TABLE ONLY public.estimates ADD CONSTRAINT estimates_version_per_job UNIQUE (job_id, version);

ALTER TABLE ONLY public.expenses ADD CONSTRAINT expenses_amount_check CHECK ((amount >= (0)::numeric));

ALTER TABLE ONLY public.expenses ADD CONSTRAINT expenses_assignment_check CHECK ((assignment = ANY (ARRAY['unassigned'::text, 'job_in_bid'::text, 'job_extra'::text, 'job_internal'::text, 'stock'::text])));

ALTER TABLE ONLY public.expenses ADD CONSTRAINT expenses_job_assignment_chk CHECK (((assignment <> ALL (ARRAY['job_in_bid'::text, 'job_extra'::text, 'job_internal'::text])) OR (job_id IS NOT NULL)));

ALTER TABLE ONLY public.expenses ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.expenses ADD CONSTRAINT expenses_qty_check CHECK (((qty IS NULL) OR (qty > (0)::numeric)));

ALTER TABLE ONLY public.invitations ADD CONSTRAINT invitations_email_format_chk CHECK ((email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text));

ALTER TABLE ONLY public.invitations ADD CONSTRAINT invitations_email_lowercase CHECK ((email = lower(email)));

ALTER TABLE ONLY public.invitations ADD CONSTRAINT invitations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.invitations ADD CONSTRAINT invitations_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'manager'::text, 'member'::text])));

ALTER TABLE ONLY public.invitations ADD CONSTRAINT invitations_token_key UNIQUE (token);

ALTER TABLE ONLY public.invoices ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.invoices ADD CONSTRAINT invoices_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'paid'::text, 'overdue'::text, 'voided'::text])));

ALTER TABLE ONLY public.invoices ADD CONSTRAINT invoices_tax_rate_pct_check CHECK ((tax_rate_pct >= (0)::numeric));

ALTER TABLE ONLY public.job_status_log ADD CONSTRAINT job_status_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.job_tags ADD CONSTRAINT job_tags_pkey PRIMARY KEY (job_id, tag_id);

ALTER TABLE ONLY public.jobs ADD CONSTRAINT jobs_phone_e164_chk CHECK (((phone IS NULL) OR (phone ~ '^\+\d{10,15}$'::text)));

ALTER TABLE ONLY public.jobs ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.jobs ADD CONSTRAINT jobs_source_check CHECK (((source IS NULL) OR (source = ANY (ARRAY['phone-call'::text, 'web-form'::text, 'manual'::text, 'sms'::text]))));

ALTER TABLE ONLY public.jobs ADD CONSTRAINT jobs_status_check CHECK ((status = ANY (ARRAY['lead'::text, 'estimated'::text, 'accepted'::text, 'scheduled'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text, 'callback'::text, 'callback_complete'::text])));

ALTER TABLE ONLY public.lead_intake ADD CONSTRAINT business_name_not_empty CHECK ((btrim(business_name) <> ''::text));

ALTER TABLE ONLY public.lead_intake ADD CONSTRAINT contact_name_not_empty CHECK ((btrim(contact_name) <> ''::text));

ALTER TABLE ONLY public.lead_intake ADD CONSTRAINT email_basic_format CHECK ((contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text));

ALTER TABLE ONLY public.lead_intake ADD CONSTRAINT lead_intake_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.lead_intake ADD CONSTRAINT lead_intake_status_check CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'discovery_scheduled'::text, 'qualified'::text, 'onboarding'::text, 'won'::text, 'lost'::text, 'spam'::text])));

ALTER TABLE ONLY public.materials ADD CONSTRAINT materials_coverage_sqft_per_unit_check CHECK (((coverage_sqft_per_unit IS NULL) OR (coverage_sqft_per_unit > (0)::numeric)));

ALTER TABLE ONLY public.materials ADD CONSTRAINT materials_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.materials ADD CONSTRAINT materials_purchasable_unit_size_check CHECK ((purchasable_unit_size > (0)::numeric));

ALTER TABLE ONLY public.materials ADD CONSTRAINT materials_unit_cost_check CHECK ((unit_cost >= (0)::numeric));

ALTER TABLE ONLY public.messages ADD CONSTRAINT messages_callback_phone_e164_chk CHECK (((callback_phone IS NULL) OR (callback_phone ~ '^\+\d{10,15}$'::text)));

ALTER TABLE ONLY public.messages ADD CONSTRAINT messages_caller_phone_e164_chk CHECK (((caller_phone IS NULL) OR (caller_phone ~ '^\+\d{10,15}$'::text)));

ALTER TABLE ONLY public.messages ADD CONSTRAINT messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.mileage_entries ADD CONSTRAINT mileage_entries_miles_check CHECK ((miles >= (0)::numeric));

ALTER TABLE ONLY public.mileage_entries ADD CONSTRAINT mileage_entries_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.mileage_entries ADD CONSTRAINT mileage_entries_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'proposed'::text])));

ALTER TABLE ONLY public.mileage_rates ADD CONSTRAINT mileage_rates_pkey PRIMARY KEY (client_id, year);

ALTER TABLE ONLY public.mileage_rates ADD CONSTRAINT mileage_rates_rate_per_mile_check CHECK ((rate_per_mile >= (0)::numeric));

ALTER TABLE ONLY public.mileage_rates ADD CONSTRAINT mileage_rates_year_check CHECK (((year >= 2000) AND (year <= 2100)));

ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_kind_check CHECK ((kind = ANY (ARRAY['estimate_saved'::text, 'booking_saved'::text, 'booking_rescheduled'::text, 'booking_cancelled'::text, 'message_left'::text, 'invoice_paid'::text, 'callback_received'::text, 'sms_received'::text])));

ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.onboard_intake_log ADD CONSTRAINT onboard_intake_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.overhead_items ADD CONSTRAINT overhead_items_monthly_amount_check CHECK ((monthly_amount >= (0)::numeric));

ALTER TABLE ONLY public.overhead_items ADD CONSTRAINT overhead_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.platform_admins ADD CONSTRAINT platform_admins_pkey PRIMARY KEY (auth_user_id);

ALTER TABLE ONLY public.price_modifiers ADD CONSTRAINT price_modifiers_math_check CHECK ((math = ANY (ARRAY['MULTIPLIER'::text, 'FLAT_ADD'::text])));

ALTER TABLE ONLY public.price_modifiers ADD CONSTRAINT price_modifiers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.price_modifiers ADD CONSTRAINT price_modifiers_scope_check CHECK ((scope = ANY (ARRAY['LINE'::text, 'JOB'::text])));

ALTER TABLE ONLY public.pricing_settings ADD CONSTRAINT pricing_settings_desired_annual_owner_pay_check CHECK ((desired_annual_owner_pay >= (0)::numeric));

ALTER TABLE ONLY public.pricing_settings ADD CONSTRAINT pricing_settings_hours_worked_per_week_check CHECK ((hours_worked_per_week > (0)::numeric));

ALTER TABLE ONLY public.pricing_settings ADD CONSTRAINT pricing_settings_margin_pct_check CHECK (((margin_pct >= (0)::numeric) AND (margin_pct < (1)::numeric)));

ALTER TABLE ONLY public.pricing_settings ADD CONSTRAINT pricing_settings_material_markup_pct_check CHECK ((material_markup_pct >= (0)::numeric));

ALTER TABLE ONLY public.pricing_settings ADD CONSTRAINT pricing_settings_minimum_job_charge_check CHECK ((minimum_job_charge >= (0)::numeric));

ALTER TABLE ONLY public.pricing_settings ADD CONSTRAINT pricing_settings_pkey PRIMARY KEY (client_id);

ALTER TABLE ONLY public.pricing_settings ADD CONSTRAINT pricing_settings_rounding_increment_check CHECK ((rounding_increment >= (0)::numeric));

ALTER TABLE ONLY public.pricing_settings ADD CONSTRAINT pricing_settings_utilization_pct_check CHECK (((utilization_pct > (0)::numeric) AND (utilization_pct <= (1)::numeric)));

ALTER TABLE ONLY public.prompt_templates ADD CONSTRAINT prompt_templates_check CHECK ((((kind = 'greeting_block'::text) AND (intake_mode = ANY (ARRAY['primary'::text, 'overflow'::text]))) OR ((kind <> 'greeting_block'::text) AND (intake_mode IS NULL))));

ALTER TABLE ONLY public.prompt_templates ADD CONSTRAINT prompt_templates_kind_check CHECK ((kind = ANY (ARRAY['master'::text, 'greeting_block'::text, 'service_block'::text])));

ALTER TABLE ONLY public.prompt_templates ADD CONSTRAINT prompt_templates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.properties ADD CONSTRAINT properties_miles_from_base_check CHECK (((miles_from_base IS NULL) OR (miles_from_base >= (0)::numeric)));

ALTER TABLE ONLY public.properties ADD CONSTRAINT properties_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.purchases ADD CONSTRAINT purchases_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.purchases ADD CONSTRAINT purchases_source_check CHECK ((source = ANY (ARRAY['scan'::text, 'manual'::text])));

ALTER TABLE ONLY public.receipt_scans ADD CONSTRAINT receipt_scans_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.receipt_scans ADD CONSTRAINT receipt_scans_status_check CHECK ((status = ANY (ARRAY['ok'::text, 'parse_failed'::text, 'rejected'::text])));

ALTER TABLE ONLY public.service_catalog ADD CONSTRAINT service_catalog_flat_labor_hours_check CHECK (((flat_labor_hours IS NULL) OR (flat_labor_hours > (0)::numeric)));

ALTER TABLE ONLY public.service_catalog ADD CONSTRAINT service_catalog_labor_hours_per_unit_check CHECK (((labor_hours_per_unit IS NULL) OR (labor_hours_per_unit > (0)::numeric)));

ALTER TABLE ONLY public.service_catalog ADD CONSTRAINT service_catalog_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.service_catalog ADD CONSTRAINT service_catalog_type_check CHECK ((type = ANY (ARRAY['MEASURED'::text, 'TASK'::text])));

ALTER TABLE ONLY public.service_catalog ADD CONSTRAINT service_catalog_type_shape CHECK ((((type = 'MEASURED'::text) AND (unit IS NOT NULL) AND (labor_hours_per_unit IS NOT NULL) AND (flat_labor_hours IS NULL)) OR ((type = 'TASK'::text) AND (unit IS NULL) AND (labor_hours_per_unit IS NULL) AND (flat_labor_hours IS NOT NULL))));

ALTER TABLE ONLY public.service_catalog ADD CONSTRAINT service_catalog_unit_check CHECK ((unit = ANY (ARRAY['sqft'::text, 'lnft'::text, 'each'::text])));

ALTER TABLE ONLY public.service_materials ADD CONSTRAINT service_materials_basis_check CHECK ((basis = ANY (ARRAY['COVERAGE'::text, 'PER_UNIT'::text, 'FLAT'::text])));

ALTER TABLE ONLY public.service_materials ADD CONSTRAINT service_materials_basis_shape CHECK ((((basis = 'COVERAGE'::text) AND (coats IS NOT NULL) AND (qty_per_unit IS NULL) AND (flat_qty IS NULL)) OR ((basis = 'PER_UNIT'::text) AND (coats IS NULL) AND (qty_per_unit IS NOT NULL) AND (flat_qty IS NULL)) OR ((basis = 'FLAT'::text) AND (coats IS NULL) AND (qty_per_unit IS NULL) AND (flat_qty IS NOT NULL))));

ALTER TABLE ONLY public.service_materials ADD CONSTRAINT service_materials_coats_check CHECK (((coats IS NULL) OR (coats > 0)));

ALTER TABLE ONLY public.service_materials ADD CONSTRAINT service_materials_flat_qty_check CHECK (((flat_qty IS NULL) OR (flat_qty > (0)::numeric)));

ALTER TABLE ONLY public.service_materials ADD CONSTRAINT service_materials_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.service_materials ADD CONSTRAINT service_materials_qty_per_unit_check CHECK (((qty_per_unit IS NULL) OR (qty_per_unit > (0)::numeric)));

ALTER TABLE ONLY public.service_materials ADD CONSTRAINT service_materials_unique_link UNIQUE (service_id, material_id);

ALTER TABLE ONLY public.sms_messages ADD CONSTRAINT sms_messages_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text])));

ALTER TABLE ONLY public.sms_messages ADD CONSTRAINT sms_messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sms_messages ADD CONSTRAINT sms_messages_twilio_message_sid_key UNIQUE (twilio_message_sid);

ALTER TABLE ONLY public.sms_reply_templates ADD CONSTRAINT sms_reply_templates_body_check CHECK ((length(body) <= 1600));

ALTER TABLE ONLY public.sms_reply_templates ADD CONSTRAINT sms_reply_templates_label_not_empty CHECK ((length(TRIM(BOTH FROM label)) > 0));

ALTER TABLE ONLY public.sms_reply_templates ADD CONSTRAINT sms_reply_templates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sms_scheduled ADD CONSTRAINT sms_scheduled_body_check CHECK (((length(body) > 0) AND (length(body) <= 1600)));

ALTER TABLE ONLY public.sms_scheduled ADD CONSTRAINT sms_scheduled_future_send CHECK ((scheduled_for > (created_at - '00:01:00'::interval)));

ALTER TABLE ONLY public.sms_scheduled ADD CONSTRAINT sms_scheduled_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sms_scheduled ADD CONSTRAINT sms_scheduled_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'cancelled'::text, 'skipped_opted_out'::text])));

ALTER TABLE ONLY public.sms_scheduled ADD CONSTRAINT sms_scheduled_twilio_message_sid_key UNIQUE (twilio_message_sid);

ALTER TABLE ONLY public.sms_sessions ADD CONSTRAINT sms_sessions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sms_threads ADD CONSTRAINT sms_threads_client_id_tenant_phone_contact_phone_key UNIQUE (client_id, tenant_phone, contact_phone);

ALTER TABLE ONLY public.sms_threads ADD CONSTRAINT sms_threads_consent_status_check CHECK ((consent_status = ANY (ARRAY['active'::text, 'stopped'::text, 'help_sent'::text])));

ALTER TABLE ONLY public.sms_threads ADD CONSTRAINT sms_threads_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.stripe_webhook_secrets ADD CONSTRAINT stripe_webhook_secrets_id_check CHECK ((id = 1));

ALTER TABLE ONLY public.stripe_webhook_secrets ADD CONSTRAINT stripe_webhook_secrets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.subscriptions ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.subscriptions ADD CONSTRAINT subscriptions_status_check CHECK ((status = ANY (ARRAY['incomplete'::text, 'active'::text, 'past_due'::text, 'cancelled'::text, 'paused'::text, 'trialing'::text])));

ALTER TABLE ONLY public.subscriptions ADD CONSTRAINT subscriptions_stripe_subscription_id_key UNIQUE (stripe_subscription_id);

ALTER TABLE ONLY public.tags ADD CONSTRAINT tags_color_hex_check CHECK ((color_hex ~ '^#[0-9A-Fa-f]{6}$'::text));

ALTER TABLE ONLY public.tags ADD CONSTRAINT tags_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tags ADD CONSTRAINT tags_unique_name_per_client UNIQUE (client_id, name);

ALTER TABLE ONLY public.task_photos ADD CONSTRAINT task_photos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tasks ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tasks ADD CONSTRAINT tasks_status_check CHECK ((status = ANY (ARRAY['open'::text, 'done'::text])));

ALTER TABLE ONLY public.team_audit_log ADD CONSTRAINT team_audit_log_action_check CHECK ((action = ANY (ARRAY['member_added'::text, 'member_removed'::text, 'role_changed'::text])));

ALTER TABLE ONLY public.team_audit_log ADD CONSTRAINT team_audit_log_actor_role_at_time_check CHECK ((actor_role_at_time = ANY (ARRAY['owner'::text, 'manager'::text, 'member'::text])));

ALTER TABLE ONLY public.team_audit_log ADD CONSTRAINT team_audit_log_new_role_check CHECK (((new_role IS NULL) OR (new_role = ANY (ARRAY['owner'::text, 'manager'::text, 'member'::text]))));

ALTER TABLE ONLY public.team_audit_log ADD CONSTRAINT team_audit_log_old_role_check CHECK (((old_role IS NULL) OR (old_role = ANY (ARRAY['owner'::text, 'manager'::text, 'member'::text]))));

ALTER TABLE ONLY public.team_audit_log ADD CONSTRAINT team_audit_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.time_entries ADD CONSTRAINT time_entries_hours_check CHECK ((hours > (0)::numeric));

ALTER TABLE ONLY public.time_entries ADD CONSTRAINT time_entries_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.travel_zones ADD CONSTRAINT travel_zones_flat_fee_check CHECK ((flat_fee >= (0)::numeric));

ALTER TABLE ONLY public.travel_zones ADD CONSTRAINT travel_zones_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.workflow_errors ADD CONSTRAINT workflow_errors_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.actual_materials ADD CONSTRAINT actual_materials_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.actual_materials ADD CONSTRAINT actual_materials_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.actual_materials ADD CONSTRAINT actual_materials_job_id_fkey FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.actual_materials ADD CONSTRAINT actual_materials_material_id_fkey FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.audit_log ADD CONSTRAINT audit_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.audit_log ADD CONSTRAINT audit_log_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.billing_entities ADD CONSTRAINT billing_entities_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.calendar_connections ADD CONSTRAINT calendar_connections_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.calendar_connections ADD CONSTRAINT calendar_connections_connected_by_user_id_fkey FOREIGN KEY (connected_by_user_id) REFERENCES auth.users(id);

ALTER TABLE ONLY public.call_summaries ADD CONSTRAINT call_summaries_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.call_summaries ADD CONSTRAINT call_summaries_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.call_summaries ADD CONSTRAINT call_summaries_job_id_fkey FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.client_secrets ADD CONSTRAINT client_secrets_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.client_users ADD CONSTRAINT client_users_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.client_users ADD CONSTRAINT client_users_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.contact_tags ADD CONSTRAINT contact_tags_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.contact_tags ADD CONSTRAINT contact_tags_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.contact_tags ADD CONSTRAINT contact_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.contacts ADD CONSTRAINT contacts_assigned_user_id_fkey FOREIGN KEY (assigned_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.contacts ADD CONSTRAINT contacts_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.estimate_line_items ADD CONSTRAINT estimate_line_items_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.estimate_line_items ADD CONSTRAINT estimate_line_items_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.estimate_line_items ADD CONSTRAINT estimate_line_items_prep_modifier_id_fkey FOREIGN KEY (prep_modifier_id) REFERENCES price_modifiers(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.estimate_line_items ADD CONSTRAINT estimate_line_items_service_id_fkey FOREIGN KEY (service_id) REFERENCES service_catalog(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.estimate_line_items ADD CONSTRAINT estimate_line_items_task_id_fkey FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.estimate_materials ADD CONSTRAINT estimate_materials_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.estimate_materials ADD CONSTRAINT estimate_materials_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.estimate_materials ADD CONSTRAINT estimate_materials_line_item_id_fkey FOREIGN KEY (line_item_id) REFERENCES estimate_line_items(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.estimate_materials ADD CONSTRAINT estimate_materials_material_id_fkey FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.estimates ADD CONSTRAINT estimates_billing_entity_id_fkey FOREIGN KEY (billing_entity_id) REFERENCES billing_entities(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.estimates ADD CONSTRAINT estimates_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.estimates ADD CONSTRAINT estimates_job_id_fkey FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.estimates ADD CONSTRAINT estimates_travel_zone_id_fkey FOREIGN KEY (travel_zone_id) REFERENCES travel_zones(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.expenses ADD CONSTRAINT expenses_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.expenses ADD CONSTRAINT expenses_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.expenses ADD CONSTRAINT expenses_invoiced_on_fkey FOREIGN KEY (invoiced_on) REFERENCES invoices(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.expenses ADD CONSTRAINT expenses_job_id_fkey FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.expenses ADD CONSTRAINT expenses_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.invitations ADD CONSTRAINT invitations_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES auth.users(id);

ALTER TABLE ONLY public.invitations ADD CONSTRAINT invitations_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.invitations ADD CONSTRAINT invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.invoices ADD CONSTRAINT invoices_billing_entity_id_fkey FOREIGN KEY (billing_entity_id) REFERENCES billing_entities(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.invoices ADD CONSTRAINT invoices_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.invoices ADD CONSTRAINT invoices_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.invoices ADD CONSTRAINT invoices_job_id_fkey FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.job_status_log ADD CONSTRAINT job_status_log_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.job_status_log ADD CONSTRAINT job_status_log_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.job_status_log ADD CONSTRAINT job_status_log_job_id_fkey FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.job_tags ADD CONSTRAINT job_tags_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.job_tags ADD CONSTRAINT job_tags_job_id_fkey FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.job_tags ADD CONSTRAINT job_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.jobs ADD CONSTRAINT jobs_assigned_user_id_fkey FOREIGN KEY (assigned_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.jobs ADD CONSTRAINT jobs_bill_to_contact_id_fkey FOREIGN KEY (bill_to_contact_id) REFERENCES contacts(id);

ALTER TABLE ONLY public.jobs ADD CONSTRAINT jobs_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id);

ALTER TABLE ONLY public.jobs ADD CONSTRAINT jobs_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.jobs ADD CONSTRAINT jobs_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id);

ALTER TABLE ONLY public.materials ADD CONSTRAINT materials_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.messages ADD CONSTRAINT messages_call_summary_id_fkey FOREIGN KEY (call_summary_id) REFERENCES call_summaries(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.messages ADD CONSTRAINT messages_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.messages ADD CONSTRAINT messages_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.mileage_entries ADD CONSTRAINT mileage_entries_job_id_fkey FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_source_call_summary_id_fkey FOREIGN KEY (source_call_summary_id) REFERENCES call_summaries(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_source_job_id_fkey FOREIGN KEY (source_job_id) REFERENCES jobs(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_source_message_id_fkey FOREIGN KEY (source_message_id) REFERENCES messages(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.overhead_items ADD CONSTRAINT overhead_items_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.platform_admins ADD CONSTRAINT platform_admins_added_by_fkey FOREIGN KEY (added_by) REFERENCES auth.users(id);

ALTER TABLE ONLY public.platform_admins ADD CONSTRAINT platform_admins_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.price_modifiers ADD CONSTRAINT price_modifiers_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.pricing_settings ADD CONSTRAINT pricing_settings_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.properties ADD CONSTRAINT properties_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id);

ALTER TABLE ONLY public.purchases ADD CONSTRAINT purchases_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.purchases ADD CONSTRAINT purchases_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.receipt_scans ADD CONSTRAINT receipt_scans_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.receipt_scans ADD CONSTRAINT receipt_scans_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.service_catalog ADD CONSTRAINT service_catalog_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.service_materials ADD CONSTRAINT service_materials_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.service_materials ADD CONSTRAINT service_materials_material_id_fkey FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.service_materials ADD CONSTRAINT service_materials_service_id_fkey FOREIGN KEY (service_id) REFERENCES service_catalog(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.sms_messages ADD CONSTRAINT sms_messages_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.sms_messages ADD CONSTRAINT sms_messages_sent_by_user_id_fkey FOREIGN KEY (sent_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.sms_messages ADD CONSTRAINT sms_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES sms_threads(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.sms_reply_templates ADD CONSTRAINT sms_reply_templates_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.sms_scheduled ADD CONSTRAINT sms_scheduled_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.sms_scheduled ADD CONSTRAINT sms_scheduled_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.sms_scheduled ADD CONSTRAINT sms_scheduled_scheduled_by_fkey FOREIGN KEY (scheduled_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.sms_scheduled ADD CONSTRAINT sms_scheduled_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES sms_threads(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.sms_threads ADD CONSTRAINT sms_threads_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.sms_threads ADD CONSTRAINT sms_threads_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.subscriptions ADD CONSTRAINT subscriptions_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tags ADD CONSTRAINT tags_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tags ADD CONSTRAINT tags_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.task_photos ADD CONSTRAINT task_photos_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.task_photos ADD CONSTRAINT task_photos_task_id_fkey FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tasks ADD CONSTRAINT tasks_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tasks ADD CONSTRAINT tasks_job_id_fkey FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.team_audit_log ADD CONSTRAINT team_audit_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.team_audit_log ADD CONSTRAINT team_audit_log_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.team_audit_log ADD CONSTRAINT team_audit_log_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.time_entries ADD CONSTRAINT time_entries_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.time_entries ADD CONSTRAINT time_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.time_entries ADD CONSTRAINT time_entries_job_id_fkey FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.travel_zones ADD CONSTRAINT travel_zones_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.workflow_errors ADD CONSTRAINT workflow_errors_client_id_fkey FOREIGN KEY (client_id) REFERENCES "Clients"(id) ON DELETE SET NULL;

-- ==========================================================================
-- Views
-- ==========================================================================

CREATE VIEW public.contacts_with_stats WITH (security_invoker=true) AS
 SELECT c.id,
    c.client_id,
    c.phone,
    c.name,
    c.email,
    c.address,
    c.notes,
    c.created_at,
    c.updated_at,
    c.first_contacted_at,
    c.last_contacted_at,
    (count(j.id))::integer AS job_count,
    COALESCE(sum(j.quoted_price), (0)::numeric) AS lifetime_value,
    max(j.created_at) AS last_job_at,
    min(j.start_datetime) FILTER (WHERE ((j.status = ANY (ARRAY['scheduled'::text, 'in_progress'::text])) AND (j.start_datetime >= now()))) AS next_job_at,
    array_agg(DISTINCT j.status) FILTER (WHERE (j.status IS NOT NULL)) AS all_statuses,
    ( SELECT j2.service
           FROM jobs j2
          WHERE (j2.contact_id = c.id)
          ORDER BY j2.created_at DESC
         LIMIT 1) AS last_service,
    ( SELECT j2.status
           FROM jobs j2
          WHERE (j2.contact_id = c.id)
          ORDER BY j2.created_at DESC
         LIMIT 1) AS last_status
   FROM (contacts c
     LEFT JOIN jobs j ON ((j.contact_id = c.id)))
  GROUP BY c.id;

-- ==========================================================================
-- Indexes
-- ==========================================================================

CREATE INDEX audit_log_action_created_idx ON public.audit_log USING btree (action, created_at DESC);

CREATE INDEX audit_log_actor_created_idx ON public.audit_log USING btree (actor_user_id, created_at DESC);

CREATE INDEX audit_log_client_created_idx ON public.audit_log USING btree (client_id, created_at DESC);

CREATE UNIQUE INDEX billing_entities_one_default_per_client ON public.billing_entities USING btree (client_id) WHERE is_default;

CREATE INDEX calendar_connections_connected_by_user_id_idx ON public.calendar_connections USING btree (connected_by_user_id);

CREATE INDEX call_summaries_client_id_idx ON public.call_summaries USING btree (client_id);

CREATE INDEX call_summaries_contact_id_idx ON public.call_summaries USING btree (contact_id);

CREATE INDEX call_summaries_job_id_idx ON public.call_summaries USING btree (job_id);

CREATE INDEX call_summaries_outcome_idx ON public.call_summaries USING btree (outcome);

CREATE INDEX call_summaries_started_at_idx ON public.call_summaries USING btree (started_at DESC);

CREATE UNIQUE INDEX clients_webhook_secret_idx ON public."Clients" USING btree (webhook_secret);

CREATE INDEX contacts_client_id_idx ON public.contacts USING btree (client_id);

CREATE UNIQUE INDEX contacts_client_phone_unique ON public.contacts USING btree (client_id, phone) WHERE (phone IS NOT NULL);

CREATE INDEX contacts_client_recent_idx ON public.contacts USING btree (client_id, last_contacted_at DESC NULLS LAST);

CREATE INDEX contacts_name_search_idx ON public.contacts USING gin (lower(name) gin_trgm_ops);

CREATE INDEX idx_actual_materials_client ON public.actual_materials USING btree (client_id);

CREATE INDEX idx_actual_materials_created_by ON public.actual_materials USING btree (created_by);

CREATE INDEX idx_actual_materials_job ON public.actual_materials USING btree (job_id);

CREATE INDEX idx_actual_materials_material ON public.actual_materials USING btree (material_id);

CREATE INDEX idx_billing_entities_client ON public.billing_entities USING btree (client_id);

CREATE INDEX idx_client_users_auth_user ON public.client_users USING btree (auth_user_id);

CREATE INDEX idx_client_users_client ON public.client_users USING btree (client_id);

CREATE INDEX idx_contact_tags_client ON public.contact_tags USING btree (client_id);

CREATE INDEX idx_contact_tags_tag ON public.contact_tags USING btree (tag_id);

CREATE INDEX idx_contacts_archived_at ON public.contacts USING btree (archived_at) WHERE (archived_at IS NULL);

CREATE INDEX idx_contacts_assigned_user ON public.contacts USING btree (assigned_user_id) WHERE (assigned_user_id IS NOT NULL);

CREATE INDEX idx_contacts_tags ON public.contacts USING gin (tags);

CREATE INDEX idx_estimate_line_items_client ON public.estimate_line_items USING btree (client_id);

CREATE INDEX idx_estimate_line_items_estimate ON public.estimate_line_items USING btree (estimate_id);

CREATE INDEX idx_estimate_line_items_prep ON public.estimate_line_items USING btree (prep_modifier_id);

CREATE INDEX idx_estimate_line_items_service ON public.estimate_line_items USING btree (service_id);

CREATE INDEX idx_estimate_line_items_task ON public.estimate_line_items USING btree (task_id);

CREATE INDEX idx_estimate_materials_client ON public.estimate_materials USING btree (client_id);

CREATE INDEX idx_estimate_materials_estimate ON public.estimate_materials USING btree (estimate_id);

CREATE INDEX idx_estimate_materials_line ON public.estimate_materials USING btree (line_item_id);

CREATE INDEX idx_estimate_materials_material ON public.estimate_materials USING btree (material_id);

CREATE INDEX idx_estimates_billing_entity ON public.estimates USING btree (billing_entity_id);

CREATE INDEX idx_estimates_client ON public.estimates USING btree (client_id);

CREATE INDEX idx_estimates_job ON public.estimates USING btree (job_id);

CREATE INDEX idx_estimates_travel_zone ON public.estimates USING btree (travel_zone_id);

CREATE INDEX idx_expenses_assignment ON public.expenses USING btree (assignment);

CREATE INDEX idx_expenses_client ON public.expenses USING btree (client_id);

CREATE INDEX idx_expenses_client_date ON public.expenses USING btree (client_id, expense_date);

CREATE INDEX idx_expenses_created_by ON public.expenses USING btree (created_by);

CREATE INDEX idx_expenses_invoiced_on ON public.expenses USING btree (invoiced_on);

CREATE INDEX idx_expenses_job ON public.expenses USING btree (job_id);

CREATE INDEX idx_expenses_purchase ON public.expenses USING btree (purchase_id);

CREATE INDEX idx_invoices_billing_entity ON public.invoices USING btree (billing_entity_id);

CREATE INDEX idx_invoices_estimate ON public.invoices USING btree (estimate_id);

CREATE INDEX idx_job_status_log_changed_by ON public.job_status_log USING btree (changed_by);

CREATE INDEX idx_job_status_log_client_time ON public.job_status_log USING btree (client_id, changed_at DESC);

CREATE INDEX idx_job_status_log_job_time ON public.job_status_log USING btree (job_id, changed_at DESC);

CREATE INDEX idx_job_tags_client ON public.job_tags USING btree (client_id);

CREATE INDEX idx_job_tags_tag ON public.job_tags USING btree (tag_id);

CREATE INDEX idx_jobs_archived_at ON public.jobs USING btree (archived_at) WHERE (archived_at IS NULL);

CREATE INDEX idx_jobs_assigned_user ON public.jobs USING btree (assigned_user_id) WHERE (assigned_user_id IS NOT NULL);

CREATE INDEX idx_jobs_bill_to_contact_id ON public.jobs USING btree (bill_to_contact_id);

CREATE INDEX idx_jobs_client_status ON public.jobs USING btree (client_id, status);

CREATE INDEX idx_jobs_phone_client ON public.jobs USING btree (phone, client_id);

CREATE INDEX idx_jobs_property_id ON public.jobs USING btree (property_id);

CREATE INDEX idx_jobs_start_datetime ON public.jobs USING btree (client_id, start_datetime) WHERE (start_datetime IS NOT NULL);

CREATE INDEX idx_jobs_tags ON public.jobs USING gin (tags);

CREATE INDEX idx_materials_client ON public.materials USING btree (client_id);

CREATE INDEX idx_mileage_entries_client_date ON public.mileage_entries USING btree (client_id, trip_date DESC);

CREATE INDEX idx_mileage_entries_job ON public.mileage_entries USING btree (job_id);

CREATE INDEX idx_onboard_intake_log_ip_time ON public.onboard_intake_log USING btree (ip_hash, created_at DESC);

CREATE INDEX idx_onboard_intake_log_time ON public.onboard_intake_log USING btree (created_at DESC);

CREATE INDEX idx_overhead_items_client ON public.overhead_items USING btree (client_id);

CREATE INDEX idx_price_modifiers_client ON public.price_modifiers USING btree (client_id);

CREATE INDEX idx_properties_client_id ON public.properties USING btree (client_id);

CREATE INDEX idx_properties_contact_id ON public.properties USING btree (contact_id);

CREATE INDEX idx_purchases_client ON public.purchases USING btree (client_id);

CREATE INDEX idx_purchases_client_date_total ON public.purchases USING btree (client_id, purchase_date, total);

CREATE INDEX idx_purchases_created_by ON public.purchases USING btree (created_by);

CREATE INDEX idx_receipt_scans_client ON public.receipt_scans USING btree (client_id);

CREATE INDEX idx_receipt_scans_purchase_id ON public.receipt_scans USING btree (purchase_id);

CREATE INDEX idx_service_catalog_client ON public.service_catalog USING btree (client_id);

CREATE INDEX idx_service_materials_client ON public.service_materials USING btree (client_id);

CREATE INDEX idx_service_materials_material ON public.service_materials USING btree (material_id);

CREATE INDEX idx_service_materials_service ON public.service_materials USING btree (service_id);

CREATE INDEX idx_sms_messages_client_id ON public.sms_messages USING btree (client_id);

CREATE INDEX idx_sms_messages_sent_by_user_id ON public.sms_messages USING btree (sent_by_user_id);

CREATE INDEX idx_sms_messages_thread_created ON public.sms_messages USING btree (thread_id, created_at DESC);

CREATE INDEX idx_sms_reply_templates_client_active ON public.sms_reply_templates USING btree (client_id, sort_order) WHERE (archived_at IS NULL);

CREATE INDEX idx_sms_scheduled_client_status ON public.sms_scheduled USING btree (client_id, status, scheduled_for);

CREATE INDEX idx_sms_scheduled_due ON public.sms_scheduled USING btree (scheduled_for) WHERE (status = 'pending'::text);

CREATE INDEX idx_sms_scheduled_thread_pending ON public.sms_scheduled USING btree (thread_id, scheduled_for) WHERE (status = 'pending'::text);

CREATE INDEX idx_sms_threads_client_lastmsg ON public.sms_threads USING btree (client_id, last_message_at DESC NULLS LAST) WHERE (archived_at IS NULL);

CREATE INDEX idx_sms_threads_contact ON public.sms_threads USING btree (contact_id) WHERE (contact_id IS NOT NULL);

CREATE INDEX idx_tags_client ON public.tags USING btree (client_id);

CREATE INDEX idx_tags_use_count ON public.tags USING btree (client_id, use_count DESC, created_at DESC);

CREATE INDEX idx_task_photos_client ON public.task_photos USING btree (client_id);

CREATE INDEX idx_task_photos_task ON public.task_photos USING btree (task_id);

CREATE INDEX idx_tasks_client ON public.tasks USING btree (client_id);

CREATE INDEX idx_tasks_job ON public.tasks USING btree (job_id);

CREATE INDEX idx_team_audit_log_client_time ON public.team_audit_log USING btree (client_id, created_at DESC);

CREATE INDEX idx_time_entries_client ON public.time_entries USING btree (client_id);

CREATE INDEX idx_time_entries_created_by ON public.time_entries USING btree (created_by);

CREATE INDEX idx_time_entries_job ON public.time_entries USING btree (job_id);

CREATE INDEX idx_travel_zones_client ON public.travel_zones USING btree (client_id);

CREATE INDEX invitations_accepted_by_idx ON public.invitations USING btree (accepted_by);

CREATE INDEX invitations_client_id_idx ON public.invitations USING btree (client_id);

CREATE INDEX invitations_email_idx ON public.invitations USING btree (email);

CREATE INDEX invitations_invited_by_idx ON public.invitations USING btree (invited_by);

CREATE INDEX invitations_token_idx ON public.invitations USING btree (token);

CREATE INDEX invoices_client_id_idx ON public.invoices USING btree (client_id);

CREATE INDEX invoices_job_id_idx ON public.invoices USING btree (job_id);

CREATE UNIQUE INDEX invoices_number_per_client ON public.invoices USING btree (client_id, invoice_number) WHERE (invoice_number IS NOT NULL);

CREATE INDEX invoices_status_idx ON public.invoices USING btree (status);

CREATE UNIQUE INDEX jobs_client_job_number_uniq ON public.jobs USING btree (client_id, job_number) WHERE (job_number IS NOT NULL);

CREATE INDEX jobs_contact_id_idx ON public.jobs USING btree (contact_id);

CREATE INDEX lead_intake_created_at_idx ON public.lead_intake USING btree (created_at DESC);

CREATE INDEX lead_intake_email_idx ON public.lead_intake USING btree (contact_email);

CREATE INDEX lead_intake_status_idx ON public.lead_intake USING btree (status) WHERE (status <> ALL (ARRAY['won'::text, 'lost'::text, 'spam'::text]));

CREATE INDEX messages_call_summary_id_idx ON public.messages USING btree (call_summary_id);

CREATE INDEX messages_client_id_created_at_idx ON public.messages USING btree (client_id, created_at DESC);

CREATE INDEX messages_client_id_idx ON public.messages USING btree (client_id);

CREATE INDEX messages_contact_id_idx ON public.messages USING btree (contact_id);

CREATE INDEX messages_unread_idx ON public.messages USING btree (client_id) WHERE (read_at IS NULL);

CREATE UNIQUE INDEX mileage_proposed_job_day_uniq ON public.mileage_entries USING btree (client_id, job_id, trip_date) WHERE ((source = 'proposed'::text) AND (job_id IS NOT NULL));

CREATE INDEX notifications_client_id_created_at_idx ON public.notifications USING btree (client_id, created_at DESC);

CREATE INDEX notifications_client_id_idx ON public.notifications USING btree (client_id);

CREATE INDEX notifications_source_call_summary_id_idx ON public.notifications USING btree (source_call_summary_id);

CREATE INDEX notifications_source_job_id_idx ON public.notifications USING btree (source_job_id);

CREATE INDEX notifications_source_message_id_idx ON public.notifications USING btree (source_message_id);

CREATE INDEX notifications_unread_idx ON public.notifications USING btree (client_id) WHERE (read_at IS NULL);

CREATE INDEX prompt_templates_active_idx ON public.prompt_templates USING btree (kind, intake_mode) WHERE (is_active = true);

CREATE INDEX sms_sessions_phone_client_idx ON public.sms_sessions USING btree (phone, client_id, status);

CREATE INDEX subscriptions_client_id_idx ON public.subscriptions USING btree (client_id);

CREATE INDEX subscriptions_status_idx ON public.subscriptions USING btree (status);

CREATE INDEX subscriptions_stripe_customer_id_idx ON public.subscriptions USING btree (stripe_customer_id);

CREATE INDEX workflow_errors_client_idx ON public.workflow_errors USING btree (client_id, created_at DESC) WHERE (client_id IS NOT NULL);

CREATE INDEX workflow_errors_created_idx ON public.workflow_errors USING btree (created_at DESC);

CREATE INDEX workflow_errors_unnotified_idx ON public.workflow_errors USING btree (created_at) WHERE (notified_at IS NULL);

-- ==========================================================================
-- Triggers
-- ==========================================================================

CREATE TRIGGER trg_clients_normalize_phones BEFORE INSERT OR UPDATE OF twilio_number, business_phone, owner_phone, escalation_phone ON public."Clients" FOR EACH ROW EXECUTE FUNCTION normalize_clients_phones();

CREATE TRIGGER trg_clients_protect_system_fields BEFORE UPDATE ON public."Clients" FOR EACH ROW EXECUTE FUNCTION trg_clients_protect_system_fields();

CREATE TRIGGER trg_clients_trim_fields BEFORE INSERT OR UPDATE ON public."Clients" FOR EACH ROW EXECUTE FUNCTION trg_clients_trim_text_fields();

CREATE TRIGGER trg_clients_updated_at BEFORE UPDATE ON public."Clients" FOR EACH ROW EXECUTE FUNCTION set_clients_updated_at();

CREATE TRIGGER trg_billing_entities_updated_at BEFORE UPDATE ON public.billing_entities FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER calendar_connections_set_updated_at BEFORE UPDATE ON public.calendar_connections FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER auto_link_contact_on_call_summaries BEFORE INSERT ON public.call_summaries FOR EACH ROW EXECUTE FUNCTION auto_link_contact();

CREATE TRIGGER trg_client_users_role_guard BEFORE UPDATE OF role ON public.client_users FOR EACH ROW EXECUTE FUNCTION trg_client_users_role_change_guard();

CREATE TRIGGER trg_enforce_at_least_one_owner BEFORE DELETE OR UPDATE ON public.client_users FOR EACH ROW EXECUTE FUNCTION enforce_at_least_one_owner();

CREATE TRIGGER trg_enforce_last_owner BEFORE DELETE OR UPDATE ON public.client_users FOR EACH ROW EXECUTE FUNCTION enforce_last_owner_check();

CREATE TRIGGER trg_contact_tags_dec_count AFTER DELETE ON public.contact_tags FOR EACH ROW EXECUTE FUNCTION tags_decrement_use_count();

CREATE TRIGGER trg_contact_tags_inc_count AFTER INSERT ON public.contact_tags FOR EACH ROW EXECUTE FUNCTION tags_increment_use_count();

CREATE TRIGGER a_normalize_phones BEFORE INSERT OR UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION normalize_contacts_phones();

CREATE TRIGGER contacts_touch_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION touch_contacts_updated_at();

CREATE TRIGGER trg_estimates_updated_at BEFORE UPDATE ON public.estimates FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_enforce_invitation_limits BEFORE INSERT ON public.invitations FOR EACH ROW EXECUTE FUNCTION enforce_invitation_limits();

CREATE TRIGGER invoices_set_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_job_tags_dec_count AFTER DELETE ON public.job_tags FOR EACH ROW EXECUTE FUNCTION tags_decrement_use_count();

CREATE TRIGGER trg_job_tags_inc_count AFTER INSERT ON public.job_tags FOR EACH ROW EXECUTE FUNCTION tags_increment_use_count();

CREATE TRIGGER a_normalize_phones BEFORE INSERT OR UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION normalize_jobs_phones();

CREATE TRIGGER auto_link_contact_on_jobs BEFORE INSERT ON public.jobs FOR EACH ROW EXECUTE FUNCTION auto_link_contact();

CREATE TRIGGER jobs_log_status_change AFTER UPDATE OF status ON public.jobs FOR EACH ROW EXECUTE FUNCTION log_job_status_change();

CREATE TRIGGER set_job_number BEFORE INSERT ON public.jobs FOR EACH ROW EXECUTE FUNCTION set_job_number();

CREATE TRIGGER trigger_jobs_updated_at BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION update_jobs_updated_at();

CREATE TRIGGER trg_lead_intake_normalize_phone BEFORE INSERT OR UPDATE OF contact_phone ON public.lead_intake FOR EACH ROW EXECUTE FUNCTION normalize_lead_intake_phone();

CREATE TRIGGER trg_materials_updated_at BEFORE UPDATE ON public.materials FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER a_normalize_phones BEFORE INSERT OR UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION normalize_messages_phones();

CREATE TRIGGER auto_link_contact_on_messages BEFORE INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION auto_link_contact();

CREATE TRIGGER trg_mileage_entries_touch BEFORE UPDATE ON public.mileage_entries FOR EACH ROW EXECUTE FUNCTION mileage_entries_touch();

CREATE TRIGGER trg_overhead_items_updated_at BEFORE UPDATE ON public.overhead_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_price_modifiers_updated_at BEFORE UPDATE ON public.price_modifiers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_pricing_settings_updated_at BEFORE UPDATE ON public.pricing_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_properties_updated_at BEFORE UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION set_properties_updated_at();

CREATE TRIGGER trg_service_catalog_updated_at BEFORE UPDATE ON public.service_catalog FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_service_materials_updated_at BEFORE UPDATE ON public.service_materials FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER sms_messages_update_thread AFTER INSERT ON public.sms_messages FOR EACH ROW EXECUTE FUNCTION sms_threads_update_on_message();

CREATE TRIGGER sms_reply_templates_set_updated_at BEFORE UPDATE ON public.sms_reply_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at_sms_reply_templates();

CREATE TRIGGER sms_scheduled_set_updated_at BEFORE UPDATE ON public.sms_scheduled FOR EACH ROW EXECUTE FUNCTION set_updated_at_sms_scheduled();

CREATE TRIGGER subscriptions_set_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_travel_zones_updated_at BEFORE UPDATE ON public.travel_zones FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER on_auth_user_created_link_to_client AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_auth_user_link();

-- ==========================================================================
-- Row level security
-- ==========================================================================

ALTER TABLE public."Clients" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.actual_materials ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.billing_entities ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.calendar_connections ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.call_summaries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.client_secrets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.client_users ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.estimate_line_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.estimate_materials ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.job_status_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.job_tags ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.lead_intake ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.mileage_entries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.mileage_rates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.onboard_intake_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.overhead_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.price_modifiers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.pricing_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.prompt_templates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.receipt_scans ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.service_catalog ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.service_materials ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sms_reply_templates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sms_scheduled ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sms_sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sms_threads ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.stripe_webhook_secrets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.task_photos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.team_audit_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.travel_zones ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.workflow_errors ENABLE ROW LEVEL SECURITY;

-- ==========================================================================
-- Policies
-- ==========================================================================

CREATE POLICY clients_select_own ON public."Clients" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((business_name <> '__platform__'::text) AND user_has_client_access(id)));

CREATE POLICY clients_update_own ON public."Clients" AS PERMISSIVE FOR UPDATE TO authenticated
  USING (user_can_write_client(id))
  WITH CHECK (user_can_write_client(id));

CREATE POLICY actual_materials_delete ON public.actual_materials AS PERMISSIVE FOR DELETE TO public
  USING (user_can_write_client(client_id));

CREATE POLICY actual_materials_insert ON public.actual_materials AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY actual_materials_select ON public.actual_materials AS PERMISSIVE FOR SELECT TO public
  USING ((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)));

CREATE POLICY actual_materials_update ON public.actual_materials AS PERMISSIVE FOR UPDATE TO public
  USING (user_can_write_client(client_id))
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY "owners view own audit log" ON public.audit_log AS PERMISSIVE FOR SELECT TO authenticated
  USING (((client_id IS NULL) OR (user_role_in_client(client_id) = 'owner'::text)));

CREATE POLICY billing_entities_delete ON public.billing_entities AS PERMISSIVE FOR DELETE TO public
  USING (user_can_write_client(client_id));

CREATE POLICY billing_entities_insert ON public.billing_entities AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY billing_entities_select ON public.billing_entities AS PERMISSIVE FOR SELECT TO public
  USING ((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)));

CREATE POLICY billing_entities_update ON public.billing_entities AS PERMISSIVE FOR UPDATE TO public
  USING (user_can_write_client(client_id))
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY "tenant owners read own calendar connection" ON public.calendar_connections AS PERMISSIVE FOR SELECT TO public
  USING ((client_id IN ( SELECT client_users.client_id
   FROM client_users
  WHERE ((client_users.auth_user_id = ( SELECT auth.uid() AS uid)) AND (client_users.role = ANY (ARRAY['owner'::text, 'manager'::text]))))));

CREATE POLICY "tenant owners read own call summaries" ON public.call_summaries AS PERMISSIVE FOR SELECT TO public
  USING ((client_id IN ( SELECT client_users.client_id
   FROM client_users
  WHERE (client_users.auth_user_id = ( SELECT auth.uid() AS uid)))));

CREATE POLICY client_users_delete ON public.client_users AS PERMISSIVE FOR DELETE TO authenticated
  USING (((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)) AND ((user_role_in_client(client_id) = 'owner'::text) OR ((user_role_in_client(client_id) = 'manager'::text) AND (role = ANY (ARRAY['member'::text, 'manager'::text]))) OR (auth_user_id = ( SELECT auth.uid() AS uid))) AND (NOT ((role = 'owner'::text) AND (client_owner_count(client_id) <= 1)))));

CREATE POLICY client_users_insert ON public.client_users AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((user_role_in_client(client_id) = ANY (ARRAY['owner'::text, 'manager'::text])));

CREATE POLICY client_users_select ON public.client_users AS PERMISSIVE FOR SELECT TO authenticated
  USING (((auth_user_id = ( SELECT auth.uid() AS uid)) OR (client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids))));

CREATE POLICY client_users_update ON public.client_users AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)) AND ((user_role_in_client(client_id) = 'owner'::text) OR ((user_role_in_client(client_id) = 'manager'::text) AND (role = ANY (ARRAY['member'::text, 'manager'::text]))) OR (auth_user_id = ( SELECT auth.uid() AS uid)))))
  WITH CHECK (((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)) AND ((user_role_in_client(client_id) = 'owner'::text) OR ((user_role_in_client(client_id) = 'manager'::text) AND (role = ANY (ARRAY['member'::text, 'manager'::text]))) OR (auth_user_id = ( SELECT auth.uid() AS uid)))));

CREATE POLICY contact_tags_tenant_delete ON public.contact_tags AS PERMISSIVE FOR DELETE TO public
  USING ((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)));

CREATE POLICY contact_tags_tenant_insert ON public.contact_tags AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)));

CREATE POLICY contact_tags_tenant_select ON public.contact_tags AS PERMISSIVE FOR SELECT TO public
  USING ((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)));

CREATE POLICY contacts_tenant_insert ON public.contacts AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((client_id IN ( SELECT client_users.client_id
   FROM client_users
  WHERE ((client_users.auth_user_id = ( SELECT auth.uid() AS uid)) AND (client_users.role = ANY (ARRAY['owner'::text, 'manager'::text]))))));

CREATE POLICY contacts_tenant_select ON public.contacts AS PERMISSIVE FOR SELECT TO authenticated
  USING ((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)));

CREATE POLICY contacts_tenant_update ON public.contacts AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)));

CREATE POLICY estimate_line_items_delete ON public.estimate_line_items AS PERMISSIVE FOR DELETE TO public
  USING (user_can_write_client(client_id));

CREATE POLICY estimate_line_items_insert ON public.estimate_line_items AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY estimate_line_items_select ON public.estimate_line_items AS PERMISSIVE FOR SELECT TO public
  USING ((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)));

CREATE POLICY estimate_line_items_update ON public.estimate_line_items AS PERMISSIVE FOR UPDATE TO public
  USING (user_can_write_client(client_id))
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY estimate_materials_delete ON public.estimate_materials AS PERMISSIVE FOR DELETE TO public
  USING (user_can_write_client(client_id));

CREATE POLICY estimate_materials_insert ON public.estimate_materials AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY estimate_materials_select ON public.estimate_materials AS PERMISSIVE FOR SELECT TO public
  USING ((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)));

CREATE POLICY estimate_materials_update ON public.estimate_materials AS PERMISSIVE FOR UPDATE TO public
  USING (user_can_write_client(client_id))
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY estimates_delete ON public.estimates AS PERMISSIVE FOR DELETE TO public
  USING (user_can_write_client(client_id));

CREATE POLICY estimates_insert ON public.estimates AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY estimates_select ON public.estimates AS PERMISSIVE FOR SELECT TO public
  USING ((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)));

CREATE POLICY estimates_update ON public.estimates AS PERMISSIVE FOR UPDATE TO public
  USING (user_can_write_client(client_id))
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY expenses_delete ON public.expenses AS PERMISSIVE FOR DELETE TO public
  USING (user_can_write_client(client_id));

CREATE POLICY expenses_insert ON public.expenses AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY expenses_select ON public.expenses AS PERMISSIVE FOR SELECT TO public
  USING ((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)));

CREATE POLICY expenses_update ON public.expenses AS PERMISSIVE FOR UPDATE TO public
  USING (user_can_write_client(client_id))
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY "inviter or owner can revoke invitations" ON public.invitations AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((user_role_in_client(client_id) = 'owner'::text) OR (invited_by = ( SELECT auth.uid() AS uid))))
  WITH CHECK (((user_role_in_client(client_id) = 'owner'::text) OR (invited_by = ( SELECT auth.uid() AS uid))));

CREATE POLICY "owners and managers can create invitations" ON public.invitations AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((user_role_in_client(client_id) = ANY (ARRAY['owner'::text, 'manager'::text])) AND (role_rank(role) <= role_rank(user_role_in_client(client_id))) AND ((user_role_in_client(client_id) = 'owner'::text) OR (role = 'member'::text)) AND (invited_by = ( SELECT auth.uid() AS uid))));

CREATE POLICY "owners and managers can view invitations" ON public.invitations AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_role_in_client(client_id) = ANY (ARRAY['owner'::text, 'manager'::text])));

CREATE POLICY invoices_delete ON public.invoices AS PERMISSIVE FOR DELETE TO authenticated
  USING ((client_id IN ( SELECT client_users.client_id
   FROM client_users
  WHERE ((client_users.auth_user_id = ( SELECT auth.uid() AS uid)) AND (client_users.role = ANY (ARRAY['owner'::text, 'manager'::text]))))));

CREATE POLICY invoices_insert ON public.invoices AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((client_id IN ( SELECT client_users.client_id
   FROM client_users
  WHERE ((client_users.auth_user_id = ( SELECT auth.uid() AS uid)) AND (client_users.role = ANY (ARRAY['owner'::text, 'manager'::text]))))));

CREATE POLICY invoices_select ON public.invoices AS PERMISSIVE FOR SELECT TO authenticated
  USING ((client_id IN ( SELECT client_users.client_id
   FROM client_users
  WHERE (client_users.auth_user_id = ( SELECT auth.uid() AS uid)))));

CREATE POLICY invoices_update ON public.invoices AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((client_id IN ( SELECT client_users.client_id
   FROM client_users
  WHERE ((client_users.auth_user_id = ( SELECT auth.uid() AS uid)) AND (client_users.role = ANY (ARRAY['owner'::text, 'manager'::text]))))))
  WITH CHECK ((client_id IN ( SELECT client_users.client_id
   FROM client_users
  WHERE ((client_users.auth_user_id = ( SELECT auth.uid() AS uid)) AND (client_users.role = ANY (ARRAY['owner'::text, 'manager'::text]))))));

CREATE POLICY job_status_log_select ON public.job_status_log AS PERMISSIVE FOR SELECT TO public
  USING ((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)));

CREATE POLICY job_tags_tenant_delete ON public.job_tags AS PERMISSIVE FOR DELETE TO public
  USING ((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)));

CREATE POLICY job_tags_tenant_insert ON public.job_tags AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)));

CREATE POLICY job_tags_tenant_select ON public.job_tags AS PERMISSIVE FOR SELECT TO public
  USING ((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)));

CREATE POLICY jobs_delete_own ON public.jobs AS PERMISSIVE FOR DELETE TO authenticated
  USING (user_can_write_client(client_id));

CREATE POLICY jobs_insert_own ON public.jobs AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY jobs_select_own ON public.jobs AS PERMISSIVE FOR SELECT TO authenticated
  USING (user_has_client_access(client_id));

CREATE POLICY jobs_update_own ON public.jobs AS PERMISSIVE FOR UPDATE TO authenticated
  USING (user_has_client_access(client_id))
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY "anon can insert leads" ON public.lead_intake AS PERMISSIVE FOR INSERT TO anon
  WITH CHECK (((status = 'new'::text) AND (assigned_to IS NULL) AND (contacted_at IS NULL) AND (closed_at IS NULL) AND (loss_reason IS NULL)));

CREATE POLICY "authenticated can insert leads" ON public.lead_intake AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY materials_delete ON public.materials AS PERMISSIVE FOR DELETE TO public
  USING (user_can_write_client(client_id));

CREATE POLICY materials_insert ON public.materials AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY materials_select ON public.materials AS PERMISSIVE FOR SELECT TO public
  USING ((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)));

CREATE POLICY materials_update ON public.materials AS PERMISSIVE FOR UPDATE TO public
  USING (user_can_write_client(client_id))
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY messages_tenant_read ON public.messages AS PERMISSIVE FOR SELECT TO authenticated
  USING ((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)));

CREATE POLICY messages_tenant_update ON public.messages AS PERMISSIVE FOR UPDATE TO authenticated
  USING (user_can_write_client(client_id))
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY mileage_entries_delete ON public.mileage_entries AS PERMISSIVE FOR DELETE TO public
  USING (user_can_write_client(client_id));

CREATE POLICY mileage_entries_insert ON public.mileage_entries AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY mileage_entries_select ON public.mileage_entries AS PERMISSIVE FOR SELECT TO public
  USING ((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)));

CREATE POLICY mileage_entries_update ON public.mileage_entries AS PERMISSIVE FOR UPDATE TO public
  USING (user_can_write_client(client_id))
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY mileage_rates_delete ON public.mileage_rates AS PERMISSIVE FOR DELETE TO public
  USING (user_can_write_client(client_id));

CREATE POLICY mileage_rates_insert ON public.mileage_rates AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY mileage_rates_select ON public.mileage_rates AS PERMISSIVE FOR SELECT TO public
  USING ((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)));

CREATE POLICY mileage_rates_update ON public.mileage_rates AS PERMISSIVE FOR UPDATE TO public
  USING (user_can_write_client(client_id))
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY notifications_tenant_read ON public.notifications AS PERMISSIVE FOR SELECT TO public
  USING ((client_id IN ( SELECT client_users.client_id
   FROM client_users
  WHERE (client_users.auth_user_id = ( SELECT auth.uid() AS uid)))));

CREATE POLICY notifications_tenant_update ON public.notifications AS PERMISSIVE FOR UPDATE TO public
  USING ((client_id IN ( SELECT client_users.client_id
   FROM client_users
  WHERE (client_users.auth_user_id = ( SELECT auth.uid() AS uid)))));

CREATE POLICY overhead_items_delete ON public.overhead_items AS PERMISSIVE FOR DELETE TO public
  USING (user_can_write_client(client_id));

CREATE POLICY overhead_items_insert ON public.overhead_items AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY overhead_items_select ON public.overhead_items AS PERMISSIVE FOR SELECT TO public
  USING ((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)));

CREATE POLICY overhead_items_update ON public.overhead_items AS PERMISSIVE FOR UPDATE TO public
  USING (user_can_write_client(client_id))
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY price_modifiers_delete ON public.price_modifiers AS PERMISSIVE FOR DELETE TO public
  USING (user_can_write_client(client_id));

CREATE POLICY price_modifiers_insert ON public.price_modifiers AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY price_modifiers_select ON public.price_modifiers AS PERMISSIVE FOR SELECT TO public
  USING ((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)));

CREATE POLICY price_modifiers_update ON public.price_modifiers AS PERMISSIVE FOR UPDATE TO public
  USING (user_can_write_client(client_id))
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY pricing_settings_delete ON public.pricing_settings AS PERMISSIVE FOR DELETE TO public
  USING (user_can_write_client(client_id));

CREATE POLICY pricing_settings_insert ON public.pricing_settings AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY pricing_settings_select ON public.pricing_settings AS PERMISSIVE FOR SELECT TO public
  USING ((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)));

CREATE POLICY pricing_settings_update ON public.pricing_settings AS PERMISSIVE FOR UPDATE TO public
  USING (user_can_write_client(client_id))
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY prompt_templates_admin_read ON public.prompt_templates AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_platform_admin());

CREATE POLICY properties_delete ON public.properties AS PERMISSIVE FOR DELETE TO public
  USING (user_can_write_client(client_id));

CREATE POLICY properties_insert ON public.properties AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY properties_select ON public.properties AS PERMISSIVE FOR SELECT TO public
  USING ((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)));

CREATE POLICY properties_update ON public.properties AS PERMISSIVE FOR UPDATE TO public
  USING (user_can_write_client(client_id))
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY purchases_delete ON public.purchases AS PERMISSIVE FOR DELETE TO public
  USING (user_can_write_client(client_id));

CREATE POLICY purchases_insert ON public.purchases AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY purchases_select ON public.purchases AS PERMISSIVE FOR SELECT TO public
  USING ((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)));

CREATE POLICY purchases_update ON public.purchases AS PERMISSIVE FOR UPDATE TO public
  USING (user_can_write_client(client_id))
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY receipt_scans_select ON public.receipt_scans AS PERMISSIVE FOR SELECT TO public
  USING ((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)));

CREATE POLICY service_catalog_delete ON public.service_catalog AS PERMISSIVE FOR DELETE TO public
  USING (user_can_write_client(client_id));

CREATE POLICY service_catalog_insert ON public.service_catalog AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY service_catalog_select ON public.service_catalog AS PERMISSIVE FOR SELECT TO public
  USING ((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)));

CREATE POLICY service_catalog_update ON public.service_catalog AS PERMISSIVE FOR UPDATE TO public
  USING (user_can_write_client(client_id))
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY service_materials_delete ON public.service_materials AS PERMISSIVE FOR DELETE TO public
  USING (user_can_write_client(client_id));

CREATE POLICY service_materials_insert ON public.service_materials AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY service_materials_select ON public.service_materials AS PERMISSIVE FOR SELECT TO public
  USING ((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)));

CREATE POLICY service_materials_update ON public.service_materials AS PERMISSIVE FOR UPDATE TO public
  USING (user_can_write_client(client_id))
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY sms_messages_select ON public.sms_messages AS PERMISSIVE FOR SELECT TO public
  USING ((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)));

CREATE POLICY sms_reply_templates_delete ON public.sms_reply_templates AS PERMISSIVE FOR DELETE TO public
  USING ((client_id IN ( SELECT cu.client_id
   FROM client_users cu
  WHERE ((cu.auth_user_id = ( SELECT auth.uid() AS uid)) AND (cu.role = ANY (ARRAY['owner'::text, 'manager'::text]))))));

CREATE POLICY sms_reply_templates_insert ON public.sms_reply_templates AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((client_id IN ( SELECT cu.client_id
   FROM client_users cu
  WHERE ((cu.auth_user_id = ( SELECT auth.uid() AS uid)) AND (cu.role = ANY (ARRAY['owner'::text, 'manager'::text]))))));

CREATE POLICY sms_reply_templates_select ON public.sms_reply_templates AS PERMISSIVE FOR SELECT TO public
  USING ((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)));

CREATE POLICY sms_reply_templates_update ON public.sms_reply_templates AS PERMISSIVE FOR UPDATE TO public
  USING ((client_id IN ( SELECT cu.client_id
   FROM client_users cu
  WHERE ((cu.auth_user_id = ( SELECT auth.uid() AS uid)) AND (cu.role = ANY (ARRAY['owner'::text, 'manager'::text]))))))
  WITH CHECK ((client_id IN ( SELECT cu.client_id
   FROM client_users cu
  WHERE ((cu.auth_user_id = ( SELECT auth.uid() AS uid)) AND (cu.role = ANY (ARRAY['owner'::text, 'manager'::text]))))));

CREATE POLICY sms_scheduled_insert ON public.sms_scheduled AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((client_id IN ( SELECT cu.client_id
   FROM client_users cu
  WHERE ((cu.auth_user_id = ( SELECT auth.uid() AS uid)) AND (cu.role = ANY (ARRAY['owner'::text, 'manager'::text]))))));

CREATE POLICY sms_scheduled_select ON public.sms_scheduled AS PERMISSIVE FOR SELECT TO public
  USING ((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)));

CREATE POLICY sms_scheduled_update ON public.sms_scheduled AS PERMISSIVE FOR UPDATE TO public
  USING ((client_id IN ( SELECT cu.client_id
   FROM client_users cu
  WHERE ((cu.auth_user_id = ( SELECT auth.uid() AS uid)) AND (cu.role = ANY (ARRAY['owner'::text, 'manager'::text]))))))
  WITH CHECK ((client_id IN ( SELECT cu.client_id
   FROM client_users cu
  WHERE ((cu.auth_user_id = ( SELECT auth.uid() AS uid)) AND (cu.role = ANY (ARRAY['owner'::text, 'manager'::text]))))));

CREATE POLICY sms_insert_own ON public.sms_sessions AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (user_has_client_access(client_id));

CREATE POLICY sms_select_own ON public.sms_sessions AS PERMISSIVE FOR SELECT TO authenticated
  USING (user_has_client_access(client_id));

CREATE POLICY sms_update_own ON public.sms_sessions AS PERMISSIVE FOR UPDATE TO authenticated
  USING (user_has_client_access(client_id))
  WITH CHECK (user_has_client_access(client_id));

CREATE POLICY sms_threads_select ON public.sms_threads AS PERMISSIVE FOR SELECT TO public
  USING ((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)));

CREATE POLICY sms_threads_update ON public.sms_threads AS PERMISSIVE FOR UPDATE TO authenticated
  USING (user_can_write_client(client_id))
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY "tenant owners read own subscription" ON public.subscriptions AS PERMISSIVE FOR SELECT TO public
  USING ((client_id IN ( SELECT client_users.client_id
   FROM client_users
  WHERE (client_users.auth_user_id = ( SELECT auth.uid() AS uid)))));

CREATE POLICY tags_tenant_delete ON public.tags AS PERMISSIVE FOR DELETE TO authenticated
  USING (user_can_write_client(client_id));

CREATE POLICY tags_tenant_insert ON public.tags AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY tags_tenant_select ON public.tags AS PERMISSIVE FOR SELECT TO public
  USING ((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)));

CREATE POLICY tags_tenant_update ON public.tags AS PERMISSIVE FOR UPDATE TO authenticated
  USING (user_can_write_client(client_id))
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY task_photos_delete ON public.task_photos AS PERMISSIVE FOR DELETE TO public
  USING (user_can_write_client(client_id));

CREATE POLICY task_photos_insert ON public.task_photos AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY task_photos_select ON public.task_photos AS PERMISSIVE FOR SELECT TO public
  USING ((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)));

CREATE POLICY task_photos_update ON public.task_photos AS PERMISSIVE FOR UPDATE TO public
  USING (user_can_write_client(client_id))
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY tasks_delete ON public.tasks AS PERMISSIVE FOR DELETE TO public
  USING (user_can_write_client(client_id));

CREATE POLICY tasks_insert ON public.tasks AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY tasks_select ON public.tasks AS PERMISSIVE FOR SELECT TO public
  USING ((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)));

CREATE POLICY tasks_update ON public.tasks AS PERMISSIVE FOR UPDATE TO public
  USING (user_can_write_client(client_id))
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY team_audit_log_select ON public.team_audit_log AS PERMISSIVE FOR SELECT TO public
  USING ((client_id IN ( SELECT cu.client_id
   FROM client_users cu
  WHERE ((cu.auth_user_id = ( SELECT auth.uid() AS uid)) AND (cu.role = ANY (ARRAY['owner'::text, 'manager'::text]))))));

CREATE POLICY time_entries_delete ON public.time_entries AS PERMISSIVE FOR DELETE TO public
  USING (user_can_write_client(client_id));

CREATE POLICY time_entries_insert ON public.time_entries AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY time_entries_select ON public.time_entries AS PERMISSIVE FOR SELECT TO public
  USING ((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)));

CREATE POLICY time_entries_update ON public.time_entries AS PERMISSIVE FOR UPDATE TO public
  USING (user_can_write_client(client_id))
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY travel_zones_delete ON public.travel_zones AS PERMISSIVE FOR DELETE TO public
  USING (user_can_write_client(client_id));

CREATE POLICY travel_zones_insert ON public.travel_zones AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY travel_zones_select ON public.travel_zones AS PERMISSIVE FOR SELECT TO public
  USING ((client_id IN ( SELECT current_user_client_ids() AS current_user_client_ids)));

CREATE POLICY travel_zones_update ON public.travel_zones AS PERMISSIVE FOR UPDATE TO public
  USING (user_can_write_client(client_id))
  WITH CHECK (user_can_write_client(client_id));

CREATE POLICY workflow_errors_admin_read ON public.workflow_errors AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_platform_admin());

CREATE POLICY tenant_logos_owner_delete ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
  USING (((bucket_id = 'tenant-logos'::text) AND ((storage.foldername(name))[1] IN ( SELECT (client_users.client_id)::text AS client_id
   FROM client_users
  WHERE ((client_users.auth_user_id = auth.uid()) AND (client_users.role = ANY (ARRAY['owner'::text, 'manager'::text])))))));

CREATE POLICY tenant_logos_owner_write ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'tenant-logos'::text) AND ((storage.foldername(name))[1] IN ( SELECT (client_users.client_id)::text AS client_id
   FROM client_users
  WHERE ((client_users.auth_user_id = auth.uid()) AND (client_users.role = ANY (ARRAY['owner'::text, 'manager'::text])))))));

-- ==========================================================================
-- Privileges
-- ==========================================================================

REVOKE ALL ON TABLE
    public."Clients",
    public.actual_materials,
    public.audit_log,
    public.billing_entities,
    public.calendar_connections,
    public.call_summaries,
    public.client_secrets,
    public.client_users,
    public.contact_tags,
    public.contacts,
    public.estimate_line_items,
    public.estimate_materials,
    public.estimates,
    public.expenses,
    public.invitations,
    public.invoices,
    public.job_status_log,
    public.job_tags,
    public.jobs,
    public.lead_intake,
    public.materials,
    public.messages,
    public.mileage_entries,
    public.mileage_rates,
    public.notifications,
    public.onboard_intake_log,
    public.overhead_items,
    public.platform_admins,
    public.price_modifiers,
    public.pricing_settings,
    public.properties,
    public.purchases,
    public.receipt_scans,
    public.service_catalog,
    public.service_materials,
    public.sms_messages,
    public.sms_reply_templates,
    public.sms_scheduled,
    public.sms_sessions,
    public.sms_threads,
    public.stripe_webhook_secrets,
    public.subscriptions,
    public.tags,
    public.task_photos,
    public.tasks,
    public.team_audit_log,
    public.time_entries,
    public.travel_zones,
    public.workflow_errors
  FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE
    public."Clients",
    public.actual_materials,
    public.audit_log,
    public.billing_entities,
    public.calendar_connections,
    public.call_summaries,
    public.client_secrets,
    public.client_users,
    public.contact_tags,
    public.contacts,
    public.estimate_line_items,
    public.estimate_materials,
    public.estimates,
    public.expenses,
    public.invitations,
    public.invoices,
    public.job_status_log,
    public.job_tags,
    public.jobs,
    public.lead_intake,
    public.materials,
    public.messages,
    public.mileage_entries,
    public.mileage_rates,
    public.notifications,
    public.onboard_intake_log,
    public.overhead_items,
    public.platform_admins,
    public.price_modifiers,
    public.pricing_settings,
    public.properties,
    public.purchases,
    public.receipt_scans,
    public.service_catalog,
    public.service_materials,
    public.sms_messages,
    public.sms_reply_templates,
    public.sms_scheduled,
    public.sms_sessions,
    public.sms_threads,
    public.stripe_webhook_secrets,
    public.subscriptions,
    public.tags,
    public.task_photos,
    public.tasks,
    public.team_audit_log,
    public.time_entries,
    public.travel_zones,
    public.workflow_errors
  TO authenticated;
GRANT ALL ON TABLE
    public."Clients",
    public.actual_materials,
    public.audit_log,
    public.billing_entities,
    public.calendar_connections,
    public.call_summaries,
    public.client_secrets,
    public.client_users,
    public.contact_tags,
    public.contacts,
    public.estimate_line_items,
    public.estimate_materials,
    public.estimates,
    public.expenses,
    public.invitations,
    public.invoices,
    public.job_status_log,
    public.job_tags,
    public.jobs,
    public.lead_intake,
    public.materials,
    public.messages,
    public.mileage_entries,
    public.mileage_rates,
    public.notifications,
    public.onboard_intake_log,
    public.overhead_items,
    public.platform_admins,
    public.price_modifiers,
    public.pricing_settings,
    public.properties,
    public.purchases,
    public.receipt_scans,
    public.service_catalog,
    public.service_materials,
    public.sms_messages,
    public.sms_reply_templates,
    public.sms_scheduled,
    public.sms_sessions,
    public.sms_threads,
    public.stripe_webhook_secrets,
    public.subscriptions,
    public.tags,
    public.task_photos,
    public.tasks,
    public.team_audit_log,
    public.time_entries,
    public.travel_zones,
    public.workflow_errors
  TO service_role;

REVOKE ALL ON TABLE
    public.contacts_with_stats
  FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE
    public.contacts_with_stats
  TO authenticated;
GRANT ALL ON TABLE
    public.contacts_with_stats
  TO service_role;

REVOKE ALL ON TABLE
    public.prompt_templates
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE
    public.prompt_templates
  TO authenticated;
GRANT ALL ON TABLE
    public.prompt_templates
  TO service_role;

REVOKE ALL ON SEQUENCE
    public."Clients_id_seq",
    public.actual_materials_id_seq,
    public.audit_log_id_seq,
    public.billing_entities_id_seq,
    public.calendar_connections_id_seq,
    public.call_summaries_id_seq,
    public.client_users_id_seq,
    public.contacts_id_seq,
    public.estimate_line_items_id_seq,
    public.estimate_materials_id_seq,
    public.estimates_id_seq,
    public.expenses_id_seq,
    public.invitations_id_seq,
    public.invoices_id_seq,
    public.job_status_log_id_seq,
    public.jobs_id_seq,
    public.lead_intake_id_seq,
    public.materials_id_seq,
    public.messages_id_seq,
    public.mileage_entries_id_seq,
    public.notifications_id_seq,
    public.onboard_intake_log_id_seq,
    public.overhead_items_id_seq,
    public.price_modifiers_id_seq,
    public.properties_id_seq,
    public.purchases_id_seq,
    public.receipt_scans_id_seq,
    public.service_catalog_id_seq,
    public.service_materials_id_seq,
    public.sms_messages_id_seq,
    public.sms_reply_templates_id_seq,
    public.sms_scheduled_id_seq,
    public.sms_sessions_id_seq,
    public.sms_threads_id_seq,
    public.subscriptions_id_seq,
    public.tags_id_seq,
    public.task_photos_id_seq,
    public.tasks_id_seq,
    public.team_audit_log_id_seq,
    public.time_entries_id_seq,
    public.travel_zones_id_seq,
    public.workflow_errors_id_seq
  FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON SEQUENCE
    public."Clients_id_seq",
    public.actual_materials_id_seq,
    public.audit_log_id_seq,
    public.billing_entities_id_seq,
    public.calendar_connections_id_seq,
    public.call_summaries_id_seq,
    public.client_users_id_seq,
    public.contacts_id_seq,
    public.estimate_line_items_id_seq,
    public.estimate_materials_id_seq,
    public.estimates_id_seq,
    public.expenses_id_seq,
    public.invitations_id_seq,
    public.invoices_id_seq,
    public.job_status_log_id_seq,
    public.jobs_id_seq,
    public.lead_intake_id_seq,
    public.materials_id_seq,
    public.messages_id_seq,
    public.mileage_entries_id_seq,
    public.notifications_id_seq,
    public.onboard_intake_log_id_seq,
    public.overhead_items_id_seq,
    public.price_modifiers_id_seq,
    public.properties_id_seq,
    public.purchases_id_seq,
    public.receipt_scans_id_seq,
    public.service_catalog_id_seq,
    public.service_materials_id_seq,
    public.sms_messages_id_seq,
    public.sms_reply_templates_id_seq,
    public.sms_scheduled_id_seq,
    public.sms_sessions_id_seq,
    public.sms_threads_id_seq,
    public.subscriptions_id_seq,
    public.tags_id_seq,
    public.task_photos_id_seq,
    public.tasks_id_seq,
    public.team_audit_log_id_seq,
    public.time_entries_id_seq,
    public.travel_zones_id_seq,
    public.workflow_errors_id_seq
  TO authenticated;
GRANT ALL ON SEQUENCE
    public."Clients_id_seq",
    public.actual_materials_id_seq,
    public.audit_log_id_seq,
    public.billing_entities_id_seq,
    public.calendar_connections_id_seq,
    public.call_summaries_id_seq,
    public.client_users_id_seq,
    public.contacts_id_seq,
    public.estimate_line_items_id_seq,
    public.estimate_materials_id_seq,
    public.estimates_id_seq,
    public.expenses_id_seq,
    public.invitations_id_seq,
    public.invoices_id_seq,
    public.job_status_log_id_seq,
    public.jobs_id_seq,
    public.lead_intake_id_seq,
    public.materials_id_seq,
    public.messages_id_seq,
    public.mileage_entries_id_seq,
    public.notifications_id_seq,
    public.onboard_intake_log_id_seq,
    public.overhead_items_id_seq,
    public.price_modifiers_id_seq,
    public.properties_id_seq,
    public.purchases_id_seq,
    public.receipt_scans_id_seq,
    public.service_catalog_id_seq,
    public.service_materials_id_seq,
    public.sms_messages_id_seq,
    public.sms_reply_templates_id_seq,
    public.sms_scheduled_id_seq,
    public.sms_sessions_id_seq,
    public.sms_threads_id_seq,
    public.subscriptions_id_seq,
    public.tags_id_seq,
    public.task_photos_id_seq,
    public.tasks_id_seq,
    public.team_audit_log_id_seq,
    public.time_entries_id_seq,
    public.travel_zones_id_seq,
    public.workflow_errors_id_seq
  TO service_role;

REVOKE ALL ON FUNCTION
    public.admin_reset_platform(),
    public.auto_link_contact(),
    public.create_notification(p_client_id bigint, p_kind text, p_title text, p_body text, p_link_url text, p_source_job_id bigint, p_source_message_id bigint, p_source_call_summary_id bigint),
    public.create_notification_for_call(p_client_id bigint, p_kind text, p_title text, p_body text, p_link_url text, p_source_call_summary_id bigint, p_source_job_id bigint, p_source_message_id bigint),
    public.get_job_by_id_for_tenant(p_job_id bigint, p_client_id bigint),
    public.get_jobs_for_caller(p_client_id bigint, p_phone text),
    public.handle_auth_user_link(),
    public.log_audit_event(p_action text, p_client_id bigint, p_target_type text, p_target_id text, p_details jsonb),
    public.resolve_client_id_by_email(p_email text),
    public.rotate_webhook_secret(p_client_id bigint),
    public.save_message_for_tenant(p_client_id bigint, p_caller_name text, p_caller_phone text, p_callback_phone text, p_message_body text, p_call_summary_id bigint),
    public.set_client_active_by_subscription(p_stripe_subscription_id text, p_is_active boolean),
    public.upsert_contact(p_client_id bigint, p_phone text, p_name text, p_email text, p_address text),
    public.upsert_subscription_from_stripe(p_email text, p_client_id bigint, p_stripe_customer_id text, p_stripe_subscription_id text, p_status text, p_current_period_end timestamp with time zone, p_setup_fee_paid_at timestamp with time zone, p_monthly_price_cents integer, p_setup_fee_cents integer, p_cancel_at_period_end boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
    public.admin_reset_platform(),
    public.auto_link_contact(),
    public.create_notification(p_client_id bigint, p_kind text, p_title text, p_body text, p_link_url text, p_source_job_id bigint, p_source_message_id bigint, p_source_call_summary_id bigint),
    public.create_notification_for_call(p_client_id bigint, p_kind text, p_title text, p_body text, p_link_url text, p_source_call_summary_id bigint, p_source_job_id bigint, p_source_message_id bigint),
    public.get_job_by_id_for_tenant(p_job_id bigint, p_client_id bigint),
    public.get_jobs_for_caller(p_client_id bigint, p_phone text),
    public.handle_auth_user_link(),
    public.log_audit_event(p_action text, p_client_id bigint, p_target_type text, p_target_id text, p_details jsonb),
    public.resolve_client_id_by_email(p_email text),
    public.rotate_webhook_secret(p_client_id bigint),
    public.save_message_for_tenant(p_client_id bigint, p_caller_name text, p_caller_phone text, p_callback_phone text, p_message_body text, p_call_summary_id bigint),
    public.set_client_active_by_subscription(p_stripe_subscription_id text, p_is_active boolean),
    public.upsert_contact(p_client_id bigint, p_phone text, p_name text, p_email text, p_address text),
    public.upsert_subscription_from_stripe(p_email text, p_client_id bigint, p_stripe_customer_id text, p_stripe_subscription_id text, p_status text, p_current_period_end timestamp with time zone, p_setup_fee_paid_at timestamp with time zone, p_monthly_price_cents integer, p_setup_fee_cents integer, p_cancel_at_period_end boolean)
  TO service_role;

REVOKE ALL ON FUNCTION
    public.client_owner_count(target_client_id bigint),
    public.is_platform_admin(),
    public.job_number_slug(p_name text),
    public.list_team_members(p_client_id bigint),
    public.log_job_status_change(),
    public.lookup_client_by_secret(p_secret text),
    public.mileage_entries_touch(),
    public.normalize_clients_phones(),
    public.normalize_contacts_phones(),
    public.normalize_e164(input text),
    public.normalize_jobs_phones(),
    public.normalize_lead_intake_phone(),
    public.normalize_messages_phones(),
    public.rotate_stripe_webhook_secret(p_new_secret text),
    public.set_clients_updated_at(),
    public.set_job_number(),
    public.set_properties_updated_at(),
    public.set_updated_at_sms_reply_templates(),
    public.set_updated_at_sms_scheduled(),
    public.sms_threads_update_on_message(),
    public.tags_decrement_use_count(),
    public.tags_increment_use_count(),
    public.trg_client_users_role_change_guard(),
    public.trg_clients_protect_system_fields(),
    public.trg_clients_trim_text_fields(),
    public.user_can_write_client(target_client_id bigint),
    public.verify_stripe_signature(p_body text, p_signature_header text, p_tolerance_seconds integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
    public.client_owner_count(target_client_id bigint),
    public.is_platform_admin(),
    public.job_number_slug(p_name text),
    public.list_team_members(p_client_id bigint),
    public.log_job_status_change(),
    public.lookup_client_by_secret(p_secret text),
    public.mileage_entries_touch(),
    public.normalize_clients_phones(),
    public.normalize_contacts_phones(),
    public.normalize_e164(input text),
    public.normalize_jobs_phones(),
    public.normalize_lead_intake_phone(),
    public.normalize_messages_phones(),
    public.rotate_stripe_webhook_secret(p_new_secret text),
    public.set_clients_updated_at(),
    public.set_job_number(),
    public.set_properties_updated_at(),
    public.set_updated_at_sms_reply_templates(),
    public.set_updated_at_sms_scheduled(),
    public.sms_threads_update_on_message(),
    public.tags_decrement_use_count(),
    public.tags_increment_use_count(),
    public.trg_client_users_role_change_guard(),
    public.trg_clients_protect_system_fields(),
    public.trg_clients_trim_text_fields(),
    public.user_can_write_client(target_client_id bigint),
    public.verify_stripe_signature(p_body text, p_signature_header text, p_tolerance_seconds integer)
  TO PUBLIC;
GRANT EXECUTE ON FUNCTION
    public.client_owner_count(target_client_id bigint),
    public.is_platform_admin(),
    public.job_number_slug(p_name text),
    public.list_team_members(p_client_id bigint),
    public.log_job_status_change(),
    public.lookup_client_by_secret(p_secret text),
    public.mileage_entries_touch(),
    public.normalize_clients_phones(),
    public.normalize_contacts_phones(),
    public.normalize_e164(input text),
    public.normalize_jobs_phones(),
    public.normalize_lead_intake_phone(),
    public.normalize_messages_phones(),
    public.rotate_stripe_webhook_secret(p_new_secret text),
    public.set_clients_updated_at(),
    public.set_job_number(),
    public.set_properties_updated_at(),
    public.set_updated_at_sms_reply_templates(),
    public.set_updated_at_sms_scheduled(),
    public.sms_threads_update_on_message(),
    public.tags_decrement_use_count(),
    public.tags_increment_use_count(),
    public.trg_client_users_role_change_guard(),
    public.trg_clients_protect_system_fields(),
    public.trg_clients_trim_text_fields(),
    public.user_can_write_client(target_client_id bigint),
    public.verify_stripe_signature(p_body text, p_signature_header text, p_tolerance_seconds integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION
    public.client_owner_count(target_client_id bigint),
    public.is_platform_admin(),
    public.job_number_slug(p_name text),
    public.list_team_members(p_client_id bigint),
    public.log_job_status_change(),
    public.lookup_client_by_secret(p_secret text),
    public.mileage_entries_touch(),
    public.normalize_clients_phones(),
    public.normalize_contacts_phones(),
    public.normalize_e164(input text),
    public.normalize_jobs_phones(),
    public.normalize_lead_intake_phone(),
    public.normalize_messages_phones(),
    public.rotate_stripe_webhook_secret(p_new_secret text),
    public.set_clients_updated_at(),
    public.set_job_number(),
    public.set_properties_updated_at(),
    public.set_updated_at_sms_reply_templates(),
    public.set_updated_at_sms_scheduled(),
    public.sms_threads_update_on_message(),
    public.tags_decrement_use_count(),
    public.tags_increment_use_count(),
    public.trg_client_users_role_change_guard(),
    public.trg_clients_protect_system_fields(),
    public.trg_clients_trim_text_fields(),
    public.user_can_write_client(target_client_id bigint),
    public.verify_stripe_signature(p_body text, p_signature_header text, p_tolerance_seconds integer)
  TO service_role;

REVOKE ALL ON FUNCTION
    public.count_unread_notifications(),
    public.current_user_client_ids(),
    public.estimator_create_invoice(p jsonb),
    public.estimator_save_estimate(p jsonb),
    public.get_my_subscription(),
    public.mark_all_notifications_read(),
    public.mark_notification_read(p_notification_id bigint),
    public.render_system_prompt(p_client_id bigint),
    public.save_rendered_system_prompt(p_client_id bigint),
    public.user_has_client_access(target_client_id bigint),
    public.user_role_in_client(target_client_id bigint)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
    public.count_unread_notifications(),
    public.current_user_client_ids(),
    public.estimator_create_invoice(p jsonb),
    public.estimator_save_estimate(p jsonb),
    public.get_my_subscription(),
    public.mark_all_notifications_read(),
    public.mark_notification_read(p_notification_id bigint),
    public.render_system_prompt(p_client_id bigint),
    public.save_rendered_system_prompt(p_client_id bigint),
    public.user_has_client_access(target_client_id bigint),
    public.user_role_in_client(target_client_id bigint)
  TO authenticated;
GRANT EXECUTE ON FUNCTION
    public.count_unread_notifications(),
    public.current_user_client_ids(),
    public.estimator_create_invoice(p jsonb),
    public.estimator_save_estimate(p jsonb),
    public.get_my_subscription(),
    public.mark_all_notifications_read(),
    public.mark_notification_read(p_notification_id bigint),
    public.render_system_prompt(p_client_id bigint),
    public.save_rendered_system_prompt(p_client_id bigint),
    public.user_has_client_access(target_client_id bigint),
    public.user_role_in_client(target_client_id bigint)
  TO service_role;

REVOKE ALL ON FUNCTION
    public.enforce_at_least_one_owner(),
    public.enforce_invitation_limits(),
    public.enforce_last_owner_check(),
    public.normalize_phone(input_phone text),
    public.role_rank(role_text text),
    public.set_updated_at(),
    public.touch_contacts_updated_at(),
    public.update_jobs_updated_at()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
    public.enforce_at_least_one_owner(),
    public.enforce_invitation_limits(),
    public.enforce_last_owner_check(),
    public.normalize_phone(input_phone text),
    public.role_rank(role_text text),
    public.set_updated_at(),
    public.touch_contacts_updated_at(),
    public.update_jobs_updated_at()
  TO PUBLIC;
GRANT EXECUTE ON FUNCTION
    public.enforce_at_least_one_owner(),
    public.enforce_invitation_limits(),
    public.enforce_last_owner_check(),
    public.normalize_phone(input_phone text),
    public.role_rank(role_text text),
    public.set_updated_at(),
    public.touch_contacts_updated_at(),
    public.update_jobs_updated_at()
  TO anon;
GRANT EXECUTE ON FUNCTION
    public.enforce_at_least_one_owner(),
    public.enforce_invitation_limits(),
    public.enforce_last_owner_check(),
    public.normalize_phone(input_phone text),
    public.role_rank(role_text text),
    public.set_updated_at(),
    public.touch_contacts_updated_at(),
    public.update_jobs_updated_at()
  TO authenticated;
GRANT EXECUTE ON FUNCTION
    public.enforce_at_least_one_owner(),
    public.enforce_invitation_limits(),
    public.enforce_last_owner_check(),
    public.normalize_phone(input_phone text),
    public.role_rank(role_text text),
    public.set_updated_at(),
    public.touch_contacts_updated_at(),
    public.update_jobs_updated_at()
  TO service_role;

-- ==========================================================================
-- Default privileges
-- ==========================================================================

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO postgres;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO postgres;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO postgres;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO service_role;

-- ==========================================================================
-- Comments
-- ==========================================================================

COMMENT ON TABLE public."Clients" IS 'Tenants + one reserved sentinel row with business_name = ''__platform__'' used for dashboard → n8n authentication. The sentinel should never be exposed via UI.';

COMMENT ON COLUMN public."Clients".brand_logo_url IS 'URL to the tenant logo shown in their dashboard header. Uploaded via dashboard settings page.';

COMMENT ON COLUMN public."Clients".brand_primary_color IS 'Hex color for dashboard accent. Default null = use ARIA default.';

COMMENT ON COLUMN public."Clients".business_short_name IS 'Used in greeting. E.g. "Sharpline Painting" instead of full "Sharpline Painting Co."';

COMMENT ON COLUMN public."Clients".feature_billing_enabled IS 'Show Billing page. Hide for tenants on custom contracts.';

COMMENT ON COLUMN public."Clients".feature_calendar_enabled IS 'Show calendar integration. Defaults false until v0.7+ when implemented.';

COMMENT ON COLUMN public."Clients".feature_estimator_enabled IS 'Show Estimator pages (settings, estimate builder, insights). Admin-toggled per tenant.';

COMMENT ON COLUMN public."Clients".feature_sms_enabled IS 'Show SMS pages and route SMS through. False = "Disabled by admin" panel.';

COMMENT ON COLUMN public."Clients".feature_voice_enabled IS 'Show Calls pages and route VAPI calls through. False = no inbound voice.';

COMMENT ON COLUMN public."Clients".intake_mode IS 'How this tenant uses Field. primary=Field is the only receptionist. overflow=owner takes calls when free, Field is backup. voicemail=Field only takes messages, no estimate/booking flow.';

COMMENT ON COLUMN public."Clients".notify_dashboard_ping IS 'Surface a ping in the dashboard bell after every actionable call outcome.';

COMMENT ON COLUMN public."Clients".notify_email IS 'Send email to owner_email after every actionable call outcome.';

COMMENT ON COLUMN public."Clients".notify_sms IS 'Send SMS to owner_phone. Off by default — opt-in only.';

COMMENT ON COLUMN public."Clients".owner_email IS 'Primary owner email for automation notifications (new lead, failed tool call, etc.). When WF6 email notification is turned on, it will send here rather than a hardcoded address.';

COMMENT ON COLUMN public."Clients".owner_first_name IS 'First name of the business owner, used in overflow-mode greeting (e.g. "Terry is tied up — I''m his Field agent"). Optional.';

COMMENT ON COLUMN public."Clients".pricing_block IS 'Multi-line pricing summary. Only mentioned when caller directly asks about price.';

COMMENT ON COLUMN public."Clients".primary_service IS 'Value passed in save_estimate.service field, e.g. "apartment turn"';

COMMENT ON COLUMN public."Clients".service_type IS 'Plain-language category, e.g. "painting", "bee removal". Used in role definition.';

COMMENT ON COLUMN public."Clients".stripe_connect_account_id IS 'Stripe Connect account ID for V2 per-job invoicing. Tenant connects their own Stripe; IRIS issues payment links on their behalf via Stripe-Account header. Not used in V1.';

COMMENT ON COLUMN public."Clients".timezone_label IS 'Human-readable timezone for prompts, e.g. "Mountain Time". The "timezone" column holds the IANA name for scheduling logic.';

COMMENT ON COLUMN public."Clients".vapi_voice_id IS 'ElevenLabs voice ID used by this tenant''s assistant. Override via Settings page.';

COMMENT ON COLUMN public."Clients".webhook_secret IS 'Per-tenant secret, auto-generated on insert. VAPI tool headers use this value. Keep it private — never share with the client. Rotate by UPDATE ... SET webhook_secret = encode(gen_random_bytes(24), ''hex'').';

COMMENT ON TABLE public.audit_log IS 'Append-only log of sensitive actions. Used for security investigations and accountability. Not for routine operations (those are logged via created_at/updated_at on individual tables).';

COMMENT ON COLUMN public.audit_log.action IS 'Standardized action identifier. Examples: client.created, user.invited, user.role_changed, user.removed, invitation.revoked, webhook_secret.rotated, job.bulk_deleted';

COMMENT ON COLUMN public.audit_log.details IS 'Free-form JSON for action-specific context. E.g. {old_role: "manager", new_role: "owner"} for role changes.';

COMMENT ON COLUMN public.audit_log.target_type IS 'What kind of thing was acted on. Examples: client, user, invitation, job, webhook_secret';

COMMENT ON TABLE public.billing_entities IS 'Letterheads a tenant can estimate/invoice under (e.g. an LLC + its DBA). One tenant, many entities — never split DBAs into separate tenants.';

COMMENT ON TABLE public.calendar_connections IS 'Per-tenant Google Calendar OAuth. Replaces the current pattern of every tenant sharing the Sharpline service account calendar. refresh_token is used by n8n to get fresh access tokens. Never exposed via public APIs.';

COMMENT ON TABLE public.call_summaries IS 'One row per completed VAPI call. Populated from end-of-call VAPI webhook. Drives dashboard analytics (calls/day, conversion rate, avg duration) and the per-call email summary sent to the client owner.';

COMMENT ON COLUMN public.call_summaries.duration_seconds IS 'Call duration in seconds with millisecond precision (matches VAPI durationSeconds). Range 0.000 to 9999999.999.';

COMMENT ON TABLE public.client_secrets IS 'Tenant webhook secrets. Service-role only. Legacy Clients.webhook_secret remains until WF1 + admin pages cut over (audit_sec_003b drops it).';

COMMENT ON TABLE public.contacts IS 'Canonical customer entity. One per (tenant, normalized phone). Jobs and messages FK to this table. Manual edits stick — n8n upsert preserves user-set values via COALESCE.';

COMMENT ON COLUMN public.contacts.archived_at IS 'Soft-delete timestamp. NULL = visible. Set = hidden from default views. Jobs and SMS threads remain intact for record-keeping.';

COMMENT ON VIEW public.contacts_with_stats IS 'Contacts joined with computed stats (job count, lifetime value, next job). Uses security_invoker so RLS on the underlying contacts table applies to the caller. Read by the dashboard contacts list.';

COMMENT ON COLUMN public.estimate_materials.qty IS 'Units PURCHASED - always ceil to purchasable_unit_size at pricing time (float-safe, eps=1e-9).';

COMMENT ON TABLE public.estimates IS 'Snapshot Rule: saving freezes all resolved_* inputs. Later settings changes must NEVER change a saved estimate. Only re-snapshot paths: editing the estimate, or explicit Reprice at current settings with confirm.';

COMMENT ON TABLE public.invoices IS 'End-customer invoices. Generated from completed jobs. Stripe Hosted Invoice Page handles the actual payment UI. line_items is freeform JSON: [{description, quantity, unit_price_cents}].';

COMMENT ON COLUMN public.invoices.invoice_number IS 'Per-entity per-year sequence, e.g. SPC-2026-001. Assigned server-side at creation; NULL for legacy/subscription rows.';

COMMENT ON TABLE public.job_status_log IS 'Append-only history of job status changes. Trigger-fed. Used by the per-contact activity timeline.';

COMMENT ON TABLE public.lead_intake IS 'Inbound sales leads from getfield.co request-access form and other sources.
   Anonymous INSERT allowed; SELECT/UPDATE/DELETE require service_role.
   Phone auto-normalizes to E.164 via trigger; invalid formats kept raw and flagged.';

COMMENT ON COLUMN public.materials.is_placeholder IS 'Seed values the owner has not adopted yet. UI labels these PLACEHOLDER - edit before relying on this.';

COMMENT ON TABLE public.messages IS 'Voicemail / message-intent records. When a caller doesn''t want an estimate or booking but wants to leave a message, VAPI calls save_message which lands here. Surfaced in the tenant dashboard inbox.';

COMMENT ON TABLE public.notifications IS 'Dashboard alert inbox. Created by WF10 (call ended) for actionable outcomes only — no notifications for hangups, wrong numbers, or info-only calls. read_at NULL = unread, drives the bell badge count.';

COMMENT ON TABLE public.onboard_intake_log IS 'Rate-limit ledger for /api/onboard. ip_hash is sha256(ip), never raw IP. Used to enforce N/hour and M/day per IP.';

COMMENT ON TABLE public.price_modifiers IS 'Prep levels etc. LINE MULTIPLIER modifiers apply to LABOR HOURS ONLY, never materials.';

COMMENT ON TABLE public.pricing_settings IS 'One row per tenant. Loaded rate is DERIVED: (pay/12 + monthly overhead) / (hrs/wk x 52/12 x utilization). Margin math: price = cost / (1 - margin), never cost x (1 + margin).';

COMMENT ON TABLE public.prompt_templates IS 'Master prompt template + swappable greeting blocks. Dashboard renders Clients.system_prompt by picking the right blocks and substituting {{tokens}} from the Clients row.';

COMMENT ON TABLE public.service_catalog IS 'Two line-item types by design: MEASURED (qty x hrs/unit) for painting, TASK (flat hrs) for handyman work.';

COMMENT ON TABLE public.sms_messages IS 'Individual SMS messages. twilio_message_sid is UNIQUE for idempotent webhook retries.';

COMMENT ON TABLE public.sms_reply_templates IS 'Saved per-tenant SMS reply snippets. Inserted into the reply box with one tap. No automation — manual insertion only. archived_at hides without deleting.';

COMMENT ON TABLE public.sms_scheduled IS 'Pending and historical scheduled outbound SMS sends. Manual scheduling only in v0.5.9. n8n cron polls pending rows where scheduled_for <= now() and ships them via Twilio, then updates status. Audit fields preserve why a send did or did not happen.';

COMMENT ON TABLE public.sms_threads IS 'One row per (tenant, contact_phone) SMS conversation.';

COMMENT ON COLUMN public.sms_threads.consent_status IS 'active = can send. stopped = user texted STOP. help_sent = HELP keyword auto-replied this session.';

COMMENT ON COLUMN public.sms_threads.last_read_at IS 'When the dashboard user last opened this thread. Unread = last_inbound_at > last_read_at.';

COMMENT ON TABLE public.stripe_webhook_secrets IS 'Stripe webhook signing secret. Service-role only. Single row enforced by CHECK (id=1). Rotate via rotate_stripe_webhook_secret() RPC.';

COMMENT ON TABLE public.subscriptions IS 'One row per paying tenant. Mirrors Stripe subscription state. status=active + setup_fee_paid_at NOT NULL means the tenant is in good standing. WF-billing updates this from Stripe webhooks.';

COMMENT ON COLUMN public.subscriptions.cancel_at_period_end IS 'True when the customer has scheduled cancellation but the subscription is still active until current_period_end. UI should show "Cancels on <date>" when this is true.';

COMMENT ON TABLE public.tags IS 'Tenant-scoped tag pool. Tags are shared between jobs and contacts via job_tags/contact_tags.';

COMMENT ON TABLE public.team_audit_log IS 'Append-only audit log of team membership changes. Written by server actions via service-role client. Read by owners + managers only.';

COMMENT ON TABLE public.workflow_errors IS 'n8n sub-workflow error sink. Service-role insert only, platform-admin read. Pair with daily pg_cron digest after Supabase Pro upgrade.';

COMMENT ON FUNCTION public.admin_reset_platform() IS 'Admin-only nuclear option. Wipes every tenant and per-tenant data, leaves only the platform sentinel. Used to reset to clean state for dry-run or pre-launch. Auth users are NOT deleted — re-link them via the new tenant form.';

COMMENT ON FUNCTION public.auto_link_contact() IS 'Trigger function: auto-links jobs/messages/call_summaries to contacts on INSERT. Creates contact if none exists. Never overwrites existing contact data — manual edits stick.';

COMMENT ON FUNCTION public.enforce_invitation_limits() IS 'Rate limits: 20 pending invitations per tenant, 10 new invitations per hour per user.';

COMMENT ON FUNCTION public.enforce_last_owner_check() IS 'Trigger that prevents removing/demoting the last owner of any client.';

COMMENT ON FUNCTION public.get_job_by_id_for_tenant(p_job_id bigint, p_client_id bigint) IS 'Tenant-scoped single-job lookup by id. Returns 0 rows if the id belongs to a different tenant than specified. Used by ARIA WF8/WF9 to enforce tenant isolation at the database layer.';

COMMENT ON FUNCTION public.get_jobs_for_caller(p_client_id bigint, p_phone text) IS 'Tenant-scoped job lookup for ARIA voice receptionist. Used by WF3 (Get Estimate). Enforces client_id + phone filtering at the database layer so n8n node bugs cannot leak data across tenants.';

COMMENT ON FUNCTION public.get_my_subscription() IS 'Returns the current users subscription if they are the owner or manager of a tenant. Used by the dashboard billing page.';

COMMENT ON FUNCTION public.handle_auth_user_link() IS 'Trigger: when auth user is created (signup or invite acceptance), auto-link them to a Clients row if email matches owner_email. Removes the manual INSERT INTO client_users step from onboarding.';

COMMENT ON FUNCTION public.list_team_members(p_client_id bigint) IS 'List team members of a tenant for assignment dropdowns. Caller must be a member of the requested tenant.';

COMMENT ON FUNCTION public.log_audit_event(p_action text, p_client_id bigint, p_target_type text, p_target_id text, p_details jsonb) IS 'Convenience RPC for writing to audit_log. Captures auth.uid() and email automatically. Call from server actions after successful mutations.';

COMMENT ON FUNCTION public.normalize_e164(input text) IS 'Convert any US phone variant to E.164. Returns NULL on null/empty input; raises on unparseable.';

COMMENT ON FUNCTION public.normalize_phone(input_phone text) IS 'Normalize phone to E.164. Returns NULL for unusable input. V1 MVP — handles US/CA + best-effort international.';

COMMENT ON FUNCTION public.render_system_prompt(p_client_id bigint) IS 'Render system prompt for a client. Fails loudly on missing required fields and unreplaced {{tokens}}. v0.6.2.';

COMMENT ON FUNCTION public.resolve_client_id_by_email(p_email text) IS 'Used by WF-Billing to resolve client_id from a Stripe customer email. Returns NULL if no Clients row matches. Excludes the __platform__ sentinel row.';

COMMENT ON FUNCTION public.role_rank(role_text text) IS 'Numeric rank for role comparison. owner=3, manager=2, member=1.';

COMMENT ON FUNCTION public.rotate_webhook_secret(p_client_id bigint) IS 'Platform admin operation — rotates a client webhook secret and returns the new value. Not callable by regular users.';

COMMENT ON FUNCTION public.save_rendered_system_prompt(p_client_id bigint) IS 'Renders the system prompt for a tenant and saves it to Clients.system_prompt. Returns the rendered text.';

COMMENT ON FUNCTION public.set_client_active_by_subscription(p_stripe_subscription_id text, p_is_active boolean) IS 'Used by the billing webhook (WF-Billing) to flip a tenant active/inactive based on subscription state. Resolves stripe_subscription_id -> client_id and updates Clients.is_active atomically.';

COMMENT ON FUNCTION public.upsert_contact(p_client_id bigint, p_phone text, p_name text, p_email text, p_address text) IS 'Upsert a contact by (client_id, normalized phone). Preserves existing name/email/address if set (manual edits stick). Updates last_contacted_at. Used by WF1 before tool routing.';

COMMENT ON FUNCTION public.user_role_in_client(target_client_id bigint) IS 'Returns the caller''s role at a given client, or NULL if not linked.';

COMMENT ON POLICY clients_select_own ON public."Clients" IS 'Authenticated users see only tenants they belong to, excluding the platform sentinel row.';

COMMENT ON TRIGGER trg_clients_normalize_phones ON public."Clients" IS 'Auto-normalize phone fields to E.164 on insert/update. Prevents whitespace, parens, and format-variant bugs.';

-- ==========================================================================
-- Realtime publication
-- ==========================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.sms_messages;

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.sms_threads;

-- ==========================================================================
-- Storage buckets
-- ==========================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('job-photos', 'job-photos', 'f', NULL, NULL) ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('receipts', 'receipts', 'f', NULL, NULL) ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('tenant-logos', 'tenant-logos', 't', 2097152, '{image/png,image/jpeg,image/svg+xml,image/webp}'::text[]) ON CONFLICT (id) DO NOTHING;
