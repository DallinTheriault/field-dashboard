-- v0.6.0 — list_team_members RPC
--
-- Status: ALREADY APPLIED to production via Supabase MCP on 2026-05-01.
-- This file exists for repo history; running it again is safe (CREATE OR REPLACE).
--
-- Returns all team members of a tenant for assignment dropdowns.
-- SECURITY DEFINER because we need to read auth.users.email which is
-- normally not accessible to authenticated users. Authorization gate
-- checks that the caller is a member of the requested tenant.

CREATE OR REPLACE FUNCTION public.list_team_members(p_client_id bigint)
RETURNS TABLE (
  user_id uuid,
  email text,
  display_name text,
  role text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
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
$$;

GRANT EXECUTE ON FUNCTION public.list_team_members(bigint) TO authenticated;

COMMENT ON FUNCTION public.list_team_members IS
  'List team members of a tenant for assignment dropdowns. Caller must be a member of the requested tenant.';
