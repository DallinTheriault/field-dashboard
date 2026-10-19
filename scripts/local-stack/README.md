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
| stripe-mock | 12111 | Stripe's official mock API, answering from fixtures |
| stripe shim | 12112 | In front of stripe-mock: a finalized invoice gets `open` and a hosted URL, as real Stripe returns. The app talks to this |
| `anthropic-mock.mjs` | 12113 | Stands in for the Claude API on receipt scans (no key, no cost). Scenarios script its replies and read what the app sent. Scans run inline (`SCAN_RUNNER=inline`), not in a Netlify background function |

```sh
scripts/local-stack/fetch.sh        # once: downloads the services into /opt/fieldstack
scripts/local-stack/up.sh --fresh   # build the database, start everything, write .env.local
npm run dev                         # the app, against the local stack
# A shell that already exports ANTHROPIC_BASE_URL beats .env.local; then run
#   ANTHROPIC_BASE_URL=http://127.0.0.1:12113 npm run dev
# so receipt scans go to the mock, not the real API.
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
and email aren't run. Stripe is the mock: it accepts real API calls but returns canned
objects, so it proves the calls are well-formed, not that a payment happens.
