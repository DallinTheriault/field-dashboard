-- v086: PERF_SPEC Phase 3 — database hygiene (docs/PERF_PHASE3.md).
-- Correctness/scale work; no intended behavior change.
--
-- 1) auth_rls_initplan: every auth.uid() call in the six flagged policies is
--    wrapped as (select auth.uid()) so Postgres evaluates it once per
--    statement (InitPlan) instead of once per row. Expressions are otherwise
--    identical to the originals (captured in the ROLLBACK block below).
-- 2) multiple_permissive_policies on sms_reply_templates: the FOR ALL write
--    policy doubled as a second permissive SELECT policy. Split into
--    INSERT/UPDATE/DELETE; SELECT belongs solely to sms_reply_templates_select.
--    Owner/manager write semantics unchanged; tenant-member SELECT unchanged.
-- 3) Covering indexes for FKs on tables that grow with real use
--    (job_status_log, receipt_scans, sms_messages). The 70 flagged-unused
--    indexes are deliberately SKIPPED, not dropped — the app is too young
--    for "unused" to be evidence.

-- ---- client_users (InitPlan) ----------------------------------------------

drop policy "client_users_update" on public.client_users;
create policy "client_users_update" on public.client_users
  for update to authenticated
  using (
    client_id in (select cu.client_id from public.client_users cu
                  where cu.auth_user_id = (select auth.uid()))
    and (
      public.user_role_in_client(client_id) = 'owner'
      or (public.user_role_in_client(client_id) = 'manager'
          and role = any (array['member'::text, 'manager'::text]))
      or auth_user_id = (select auth.uid())
    )
  )
  with check (
    client_id in (select cu.client_id from public.client_users cu
                  where cu.auth_user_id = (select auth.uid()))
    and (
      public.user_role_in_client(client_id) = 'owner'
      or (public.user_role_in_client(client_id) = 'manager'
          and role = any (array['member'::text, 'manager'::text]))
      or auth_user_id = (select auth.uid())
    )
  );

drop policy "client_users_delete" on public.client_users;
create policy "client_users_delete" on public.client_users
  for delete to authenticated
  using (
    client_id in (select cu.client_id from public.client_users cu
                  where cu.auth_user_id = (select auth.uid()))
    and (
      public.user_role_in_client(client_id) = 'owner'
      or (public.user_role_in_client(client_id) = 'manager'
          and role = any (array['member'::text, 'manager'::text]))
      or auth_user_id = (select auth.uid())
    )
    -- never delete the last owner of a tenant
    and not (
      role = 'owner'::text
      and (select count(*) from public.client_users cu2
           where cu2.client_id = client_users.client_id
             and cu2.role = 'owner'::text) <= 1
    )
  );

-- ---- sms_scheduled (InitPlan) ----------------------------------------------

drop policy "sms_scheduled_insert" on public.sms_scheduled;
create policy "sms_scheduled_insert" on public.sms_scheduled
  for insert
  with check (
    client_id in (select cu.client_id from public.client_users cu
                  where cu.auth_user_id = (select auth.uid())
                    and cu.role = any (array['owner'::text, 'manager'::text]))
  );

drop policy "sms_scheduled_update" on public.sms_scheduled;
create policy "sms_scheduled_update" on public.sms_scheduled
  for update
  using (
    client_id in (select cu.client_id from public.client_users cu
                  where cu.auth_user_id = (select auth.uid())
                    and cu.role = any (array['owner'::text, 'manager'::text]))
  )
  with check (
    client_id in (select cu.client_id from public.client_users cu
                  where cu.auth_user_id = (select auth.uid())
                    and cu.role = any (array['owner'::text, 'manager'::text]))
  );

-- ---- team_audit_log (InitPlan) ----------------------------------------------

drop policy "team_audit_log_select" on public.team_audit_log;
create policy "team_audit_log_select" on public.team_audit_log
  for select
  using (
    client_id in (select cu.client_id from public.client_users cu
                  where cu.auth_user_id = (select auth.uid())
                    and cu.role = any (array['owner'::text, 'manager'::text]))
  );

-- ---- sms_reply_templates (InitPlan + permissive-policy consolidation) --------
-- The old FOR ALL policy is replaced by per-command policies so SELECT has
-- exactly one permissive policy (sms_reply_templates_select, untouched).

drop policy "sms_reply_templates_write" on public.sms_reply_templates;

create policy "sms_reply_templates_insert" on public.sms_reply_templates
  for insert
  with check (
    client_id in (select cu.client_id from public.client_users cu
                  where cu.auth_user_id = (select auth.uid())
                    and cu.role = any (array['owner'::text, 'manager'::text]))
  );

create policy "sms_reply_templates_update" on public.sms_reply_templates
  for update
  using (
    client_id in (select cu.client_id from public.client_users cu
                  where cu.auth_user_id = (select auth.uid())
                    and cu.role = any (array['owner'::text, 'manager'::text]))
  )
  with check (
    client_id in (select cu.client_id from public.client_users cu
                  where cu.auth_user_id = (select auth.uid())
                    and cu.role = any (array['owner'::text, 'manager'::text]))
  );

create policy "sms_reply_templates_delete" on public.sms_reply_templates
  for delete
  using (
    client_id in (select cu.client_id from public.client_users cu
                  where cu.auth_user_id = (select auth.uid())
                    and cu.role = any (array['owner'::text, 'manager'::text]))
  );

-- ---- covering indexes for FKs on tables that actually grow -------------------

create index if not exists idx_job_status_log_changed_by
  on public.job_status_log (changed_by);
create index if not exists idx_receipt_scans_purchase_id
  on public.receipt_scans (purchase_id);
create index if not exists idx_sms_messages_client_id
  on public.sms_messages (client_id);
create index if not exists idx_sms_messages_sent_by_user_id
  on public.sms_messages (sent_by_user_id);

-- =============================================================================
-- ROLLBACK (run manually to restore the pre-v086 state):
--
-- drop policy "client_users_update" on public.client_users;
-- create policy "client_users_update" on public.client_users for update to authenticated
--   using ((client_id in (select cu.client_id from client_users cu where cu.auth_user_id = auth.uid()))
--     and ((user_role_in_client(client_id) = 'owner') or ((user_role_in_client(client_id) = 'manager')
--     and (role = any (array['member','manager']))) or (auth_user_id = auth.uid())))
--   with check ((client_id in (select cu.client_id from client_users cu where cu.auth_user_id = auth.uid()))
--     and ((user_role_in_client(client_id) = 'owner') or ((user_role_in_client(client_id) = 'manager')
--     and (role = any (array['member','manager']))) or (auth_user_id = auth.uid())));
-- drop policy "client_users_delete" on public.client_users;
-- create policy "client_users_delete" on public.client_users for delete to authenticated
--   using ((client_id in (select cu.client_id from client_users cu where cu.auth_user_id = auth.uid()))
--     and ((user_role_in_client(client_id) = 'owner') or ((user_role_in_client(client_id) = 'manager')
--     and (role = any (array['member','manager']))) or (auth_user_id = auth.uid()))
--     and (not ((role = 'owner') and ((select count(*) from client_users cu2
--       where cu2.client_id = client_users.client_id and cu2.role = 'owner') <= 1))));
-- drop policy "sms_scheduled_insert" on public.sms_scheduled;
-- create policy "sms_scheduled_insert" on public.sms_scheduled for insert
--   with check (client_id in (select cu.client_id from client_users cu
--     where cu.auth_user_id = auth.uid() and cu.role = any (array['owner','manager'])));
-- drop policy "sms_scheduled_update" on public.sms_scheduled;
-- create policy "sms_scheduled_update" on public.sms_scheduled for update
--   using (client_id in (select cu.client_id from client_users cu
--     where cu.auth_user_id = auth.uid() and cu.role = any (array['owner','manager'])))
--   with check (client_id in (select cu.client_id from client_users cu
--     where cu.auth_user_id = auth.uid() and cu.role = any (array['owner','manager'])));
-- drop policy "team_audit_log_select" on public.team_audit_log;
-- create policy "team_audit_log_select" on public.team_audit_log for select
--   using (client_id in (select cu.client_id from client_users cu
--     where cu.auth_user_id = auth.uid() and cu.role = any (array['owner','manager'])));
-- drop policy "sms_reply_templates_insert" on public.sms_reply_templates;
-- drop policy "sms_reply_templates_update" on public.sms_reply_templates;
-- drop policy "sms_reply_templates_delete" on public.sms_reply_templates;
-- create policy "sms_reply_templates_write" on public.sms_reply_templates for all
--   using (client_id in (select cu.client_id from client_users cu
--     where cu.auth_user_id = auth.uid() and cu.role = any (array['owner','manager'])))
--   with check (client_id in (select cu.client_id from client_users cu
--     where cu.auth_user_id = auth.uid() and cu.role = any (array['owner','manager'])));
-- drop index if exists idx_job_status_log_changed_by;
-- drop index if exists idx_receipt_scans_purchase_id;
-- drop index if exists idx_sms_messages_client_id;
-- drop index if exists idx_sms_messages_sent_by_user_id;
-- =============================================================================
