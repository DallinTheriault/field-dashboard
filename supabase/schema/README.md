# Schema snapshot

`prod.sql` is the full prod schema as of 2026-10-13 (latest migration `v091_mileage`).
It is the rebuild source of truth; `supabase/migrations/` holds only 34 of the 112
migrations prod has applied, so replaying migrations cannot rebuild the database.

**Rebuild** a fresh Supabase project (run as `postgres`):

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/schema/prod.sql
```

Contents: everything in `public` (tables, sequences, functions, defaults, constraints,
views, indexes, triggers, RLS, policies, grants, comments), plus the pieces the app owns
in platform schemas — the `auth.users` link trigger, `storage.objects` policies, storage
bucket config, and the `supabase_realtime` publication tables. No row data.

**How it was made.** `snapshot.sql` is a read-only catalog query that emits the DDL in
dependency order. It was used because `pg_dump` needs the DB password; when you have
it, `supabase db dump --schema public` is the more conventional source. Each section of
`prod.sql` was checked against prod by md5, then loaded into a scratch Postgres and
re-snapshotted: every section round-tripped identically except the PG17-only `MAINTAIN`
privilege and the `supabase_vault` extension, which the scratch server lacks.

**Refresh** by running `snapshot.sql` against prod and joining the `txt` column in the
order returned, with a blank line between rows, under the header in `prod.sql`.
