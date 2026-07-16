# PERF_SPEC — Phase 3: Database hygiene

Verbatim from the spec (chat-delivered; recorded here 2026-07-16 by architect
instruction). Runs as step 5 of the approved re-plan — explicitly correctness/
scale work, **never speed-justified**, and proceeds regardless of the step-4
re-measure outcome.

> Phase 3 — Database hygiene (correctness/scale, explicitly NOT speed claims):
> RLS InitPlan fixes: wrap auth calls as `(select auth.uid())` /
> `(select current_setting(...))` in the flagged policies, client_users first.
> Verify with the advisor re-run and a tenant-isolation probe suite pass (this
> touches security policies — full RLS regression required). Consolidate the
> multiple permissive policies on sms_reply_templates. Add covering indexes
> for FKs on tables that will actually grow (job_status_log, receipt_scans,
> sms_messages, expenses/items); skip or drop the flagged unused indexes.
> Reversible migrations, rollback notes, house smoke rules (Cascade probes,
> zero residue, Sharpline untouched). Acceptance: advisor re-run shows zero
> Auth InitPlan warnings on app tables; RLS probe suite green; all existing
> E2E suites pass untouched.
