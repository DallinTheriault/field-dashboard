#!/usr/bin/env bash
# Apply repo migrations newer than the prod.sql snapshot that this database
# hasn't had yet, each in its own transaction, oldest first.
#   migrate.sh            everything pending
#   APPLY_THROUGH=92 ...  stop after v092 (to test a migration on existing data)
source "$(dirname "$0")/lib.sh"

psql_pg -c "create schema if not exists _local_stack;
            create table if not exists _local_stack.migrations (name text primary key, applied_at timestamptz not null default now());"

# vNNN_ files only; v0511/v0512 are the old v0.5.x scheme and long applied.
for f in "$REPO"/supabase/migrations/v[0-9][0-9][0-9]_*.sql; do
  name="$(basename "$f" .sql)"
  n="$(echo "$name" | sed -E 's/^v0*([0-9]+)_.*/\1/')"
  [ "$n" -gt "$SNAPSHOT_THROUGH" ] && [ "$n" -le "${APPLY_THROUGH:-9999}" ] || continue
  done_already="$(psql_pg -tA -c "select 1 from _local_stack.migrations where name = '$name'")"
  [ -z "$done_already" ] || continue
  echo "applying $name"
  { cat "$f"; echo; echo "insert into _local_stack.migrations (name) values ('$name');"; } | psql_pg -1 -f -
done

# PostgREST caches the schema; Supabase reloads it after DDL automatically.
psql_pg -c "notify pgrst, 'reload schema'"
