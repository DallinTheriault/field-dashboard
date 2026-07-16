-- v087: fix dormant infinite-recursion in client_users write policies.
-- STATUS: architect-approved and APPLIED to prod 2026-07-16. Verified:
-- definer fns pin search_path, RLS probe suite 17/17 (incl. cross-tenant
-- client_users writes), last-owner-guard edge tested (sole-owner delete
-- blocked / one-of-two allowed), advisors unchanged at zero warnings.
--
-- Found by the v086 RLS probe suite (PERF_SPEC Phase 3): the INSERT/UPDATE/
-- DELETE policies on client_users referenced client_users directly in a
-- subquery, which Postgres rejects at runtime with "infinite recursion
-- detected in policy" for any user-path write. PRE-EXISTING defect (the
-- original policies had the same shape) that never surfaced because all app
-- writes to client_users go through the service-role client (team-actions.ts),
-- which bypasses RLS. The SELECT policy already used the safe pattern —
-- SECURITY DEFINER helper functions — so the write policies now match it.
-- Semantics are unchanged: membership via current_user_client_ids(), role
-- checks via user_role_in_client(), last-owner guard via the new
-- client_owner_count() definer helper.

create or replace function public.client_owner_count(target_client_id bigint)
returns bigint
language sql
stable security definer
set search_path to 'public'
as $$
  select count(*) from public.client_users
  where client_id = target_client_id and role = 'owner';
$$;

drop policy "client_users_insert" on public.client_users;
create policy "client_users_insert" on public.client_users
  for insert
  with check (
    public.user_role_in_client(client_id) = any (array['owner'::text, 'manager'::text])
  );

drop policy "client_users_update" on public.client_users;
create policy "client_users_update" on public.client_users
  for update to authenticated
  using (
    client_id in (select public.current_user_client_ids())
    and (
      public.user_role_in_client(client_id) = 'owner'
      or (public.user_role_in_client(client_id) = 'manager'
          and role = any (array['member'::text, 'manager'::text]))
      or auth_user_id = (select auth.uid())
    )
  )
  with check (
    client_id in (select public.current_user_client_ids())
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
    client_id in (select public.current_user_client_ids())
    and (
      public.user_role_in_client(client_id) = 'owner'
      or (public.user_role_in_client(client_id) = 'manager'
          and role = any (array['member'::text, 'manager'::text]))
      or auth_user_id = (select auth.uid())
    )
    -- never delete the last owner of a tenant
    and not (
      role = 'owner'::text
      and public.client_owner_count(client_id) <= 1
    )
  );

-- =============================================================================
-- ROLLBACK (restores the v086 shape — note that shape recurses on user-path
-- writes; roll back only if the definer-function pattern itself misbehaves):
-- see supabase/migrations/v086_rls_initplan_hygiene.sql for the exact DDL of
-- client_users_update / client_users_delete, and this pre-v087 INSERT policy:
--
-- drop policy "client_users_insert" on public.client_users;
-- create policy "client_users_insert" on public.client_users for insert
--   with check (client_id in (select client_id from client_users
--     where auth_user_id = (select auth.uid()) and role = any (array['owner','manager'])));
-- drop function public.client_owner_count(bigint);
-- =============================================================================
