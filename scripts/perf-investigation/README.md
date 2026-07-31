# Smoke suite

End-to-end probes and RLS checks that run against a **local dev server** and a
**real Supabase project**. They seed their own data, assert, and clean up.

## Setup

```bash
cp scripts/perf-investigation/smoke.config.example.json \
   scripts/perf-investigation/smoke.config.json
# then fill it in — it is gitignored
```

Credentials are **not** in that file. They are read at runtime from the app's
own `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`). Every config key can also be supplied as an
environment variable — see `_config.mjs` for the names.

Playwright is deliberately **not** a project dependency; install it wherever you
like and point `playwrightPath` at it. Scripts that never open a browser (the
RLS probes) load it lazily and run without it.

```bash
node scripts/perf-investigation/job-inline-reassign.mjs http://localhost:3415
```

Most scripts take an optional base URL as the first argument, falling back to
`baseUrl` from the config.

## The two rules these scripts encode

**1. Cleanup deletes only IDs captured at creation time.** Never a predicate —
not `client_id`, not a name pattern, not a date range — under any circumstance,
*including recovering from a crashed run*. Deleting all children of a row this
run created (`.eq("job_id", <captured id>)`) is identity, not scope, and is
fine. The trap to watch for is a delete that *looks* ID-based while the IDs came
from a scope query; that shape shipped undetected once.

`_harness.mjs` provides `capture(table, id)`, which records an ID and appends it
to a per-run manifest **on disk, immediately**. An ID held only in a dying
process's memory is unrecoverable, which forces reporting orphans and stopping —
the manifest keeps ID-based cleanup available after any crash. It is deleted
when a run finishes with zero failures.

**2. A skip is never a pass.** A probe that cannot run because a precondition is
missing is reported `NOT RUN`, excluded from the pass tally, and makes the run
non-green. `22/22` must mean 22 probes executed and asserted. Scripts seed their
own preconditions; `notRun()` is a last resort for state a script genuinely
cannot create.

## Tenancy

`CLIENT_ID` is the only tenant these scripts may write to. `REF_CLIENT_ID` is a
second, **read-only** tenant used to prove isolation — cross-tenant reads and
writes must fail, and its data must be identical after a run. Nothing may ever
write there.

Assert that with a **before/after snapshot**, never a hardcoded census. If the
reference tenant is a real business, a count baked into the script goes red the
moment someone does ordinary work, and a probe that cries wolf trains people to
ignore red. The invariant is "this run changed nothing", not "their data stopped
moving".
