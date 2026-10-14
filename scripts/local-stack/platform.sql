-- The pieces of a fresh Supabase project that prod.sql assumes already exist:
-- API roles, the platform schemas and the schema-level grants. Mirrors what
-- the supabase/postgres image sets up; run once as postgres on an empty cluster.

-- API roles. PostgREST logs in as authenticator and switches to one of these
-- per request from the JWT's role claim.
CREATE ROLE anon NOLOGIN NOINHERIT;
CREATE ROLE authenticated NOLOGIN NOINHERIT;
CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD 'postgres';
GRANT anon, authenticated, service_role TO authenticator;

-- Service owners, as on the platform: not superusers.
CREATE ROLE supabase_auth_admin LOGIN NOINHERIT CREATEROLE PASSWORD 'postgres';
CREATE ROLE supabase_storage_admin LOGIN NOINHERIT CREATEROLE PASSWORD 'postgres';
GRANT anon, authenticated, service_role TO supabase_storage_admin;

CREATE SCHEMA extensions;
CREATE SCHEMA auth AUTHORIZATION supabase_auth_admin;
CREATE SCHEMA storage AUTHORIZATION supabase_storage_admin;
-- supabase_vault isn't packaged for stock Postgres; nothing in public uses it.
CREATE SCHEMA vault;

GRANT USAGE ON SCHEMA public, extensions TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth, storage TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA extensions TO supabase_auth_admin, supabase_storage_admin;

-- Supabase's database default; column defaults such as Clients.webhook_secret
-- call pgcrypto unqualified.
ALTER DATABASE postgres SET search_path = "$user", public, extensions;

ALTER ROLE authenticator SET statement_timeout = '8s';
ALTER ROLE anon SET statement_timeout = '3s';
ALTER ROLE authenticated SET statement_timeout = '8s';

CREATE PUBLICATION supabase_realtime;
