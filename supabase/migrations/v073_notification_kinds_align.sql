-- v0.7.3 — Align create_notification()'s internal kind whitelist with the
-- notifications.kind table constraint (M-D fix).
--
-- Status: applied to production via Supabase MCP. Repo copy for history.
--
-- Drift found during estimator smoke-testing: the
-- add_invoice_paid_to_notification_kinds migration widened the TABLE
-- constraint but the function still rejected 'invoice_paid' (and
-- 'callback_received'/'sms_received') with {ok:false,'invalid kind'} —
-- silently, since callers rarely check the jsonb result. Only the IN list
-- changes; behavior for previously-valid kinds is identical.

CREATE OR REPLACE FUNCTION public.create_notification(
  p_client_id bigint,
  p_kind text,
  p_title text,
  p_body text DEFAULT NULL::text,
  p_link_url text DEFAULT NULL::text,
  p_source_job_id bigint DEFAULT NULL::bigint,
  p_source_message_id bigint DEFAULT NULL::bigint,
  p_source_call_summary_id bigint DEFAULT NULL::bigint
)
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
