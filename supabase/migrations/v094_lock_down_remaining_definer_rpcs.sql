-- v094: finish v092. The last seven SECURITY DEFINER functions in public that
-- PUBLIC (and so the anon key) could execute.
--
-- Revoke from every API role, then grant back only where a real caller needs it.
-- Callers were traced through pg_policies, pg_trigger, function bodies, the app
-- code, pg_stat_statements and 24 h of API logs (no direct RPC calls at all):
--
--   user_can_write_client  69 write policies (app, as the logged-in user)  → authenticated
--   client_owner_count     client_users_delete policy (team page)          → authenticated
--   is_platform_admin      only the read policies on prompt_templates (receptionist)
--                          and workflow_errors (n8n error log), which the app never
--                          reads; trg_clients_protect_system_fields calls it as its
--                          owner, which needs no grant                   → none
--   log_job_status_change, set_job_number, trg_client_users_role_change_guard,
--   trg_clients_protect_system_fields
--                          trigger functions: Postgres checks EXECUTE only when a
--                          trigger is created, never when it fires       → none
--
-- service_role bypasses RLS, so policies never call these on its behalf.

revoke execute on function public.user_can_write_client(bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.user_can_write_client(bigint) to authenticated;

revoke execute on function public.client_owner_count(bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.client_owner_count(bigint) to authenticated;

revoke execute on function public.is_platform_admin()
  from public, anon, authenticated, service_role;

revoke execute on function public.log_job_status_change()
  from public, anon, authenticated, service_role;
revoke execute on function public.set_job_number()
  from public, anon, authenticated, service_role;
revoke execute on function public.trg_client_users_role_change_guard()
  from public, anon, authenticated, service_role;
revoke execute on function public.trg_clients_protect_system_fields()
  from public, anon, authenticated, service_role;
