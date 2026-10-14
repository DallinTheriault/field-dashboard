# Local stack

A full Supabase-shaped backend on one machine, built from `supabase/schema/prod.sql`,
for testing migrations and the app without touching prod. Plain processes, no Docker:

| Service | Port | Role |
|---|---|---|
| Postgres 16 | 54329 | prod schema + migrations newer than the snapshot + `seed.sql` |
| Auth (GoTrue) | 54340 | real sign-in, JWTs signed with a local secret |
| PostgREST | 54330 | the REST API supabase-js calls |
| Storage | 54350 | file backend under `$FIELDSTACK/storage-files` |
| `gateway.mjs` | 54321 | one URL for all three, like Supabase's gateway |

```sh
scripts/local-stack/fetch.sh        # once: downloads the services into /opt/fieldstack
scripts/local-stack/up.sh --fresh   # build the database, start everything, write .env.local
npm run dev                         # the app, against the local stack
scripts/local-stack/down.sh         # stop (data kept; --fresh wipes it)
```

`up.sh` writes `.env.local` only when there isn't one, or when it wrote the existing one.
It never overwrites a real `.env.local`. The keys in it are local-only and signed with
`$FIELDSTACK/jwt-secret`.

**Test data** (`seed.sql`, `seed-users.mjs`): tenant 8 Cascade HVAC Services LLC (same
pricing as prod's test tenant) and tenant 9 Other Tenant Co, for isolation checks.
Logins, all with password `local-stack-only`:
`owner@cascade.test`, `member@cascade.test` and `owner@other.test`.

**Migrations.** `prod.sql` includes everything through `SNAPSHOT_THROUGH` in `lib.sh`.
`migrate.sh` applies newer `supabase/migrations/vNNN_*.sql` files, each in one
transaction, and records them in `_local_stack.migrations`. To test a migration
against existing data, build without it (`APPLY_THROUGH=92 up.sh --fresh`), create data,
then run `migrate.sh`.

**Scenarios** (`scenarios/`): browser and API checks per billing slice. For example,
`scenarios/slice1.sh` rebuilds at v092, creates an estimate in the old builder,
applies v093 and runs the price-book checks at phone width. They need the app running
on :3000.

Differences from Supabase that matter: the database is Postgres 16, not 17. Two
`prod.sql` lines are skipped: the PG17-only `MAINTAIN` privilege and the
`supabase_vault` extension, which nothing in `public` uses. Realtime, Edge Functions
and email aren't run.
