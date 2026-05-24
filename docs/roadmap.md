# Roadmap — Field

**Merged ordered queue** (audit findings + product features in one sequence). Path to v1.0 and the validation milestone.

**Last reconciled:** 2026-05-23 from live state via Supabase + n8n MCPs.
**Validation goal:** 3+ paying customers excluding Sharpline by **2026-07-23** (~9 weeks from today).

---

## ⚠ VERIFY BEFORE STARTING

Don't trust this doc on volatile items. Before claiming an item is still pending:
1. Run `docs/architecture.md` §⚠ queries to confirm state.
2. Ask Dallin: "what's actually closed since the doc was last updated?"
3. Default to assuming the doc is stale on items that span multiple chats.

---

## Locked product decisions

Owner-decided. Do not re-litigate.

- **Pricing:** $397/mo + $299 setup. **No free trial.** No Lite tier until 12+ months of price-objection data.
- **Delivery:** done-for-you, manual onboarding, human pre-flight review before go-live.
- **v1.0 excludes:** public auto-provisioning, self-serve wizard, native mobile app, **multi-language at launch (English only — Spanish is post-v1.0 if at all).**
- **Default assistant name:** ARIS. Sharpline keeps "Aria."
- **n8n is webhook-only.** No cron workflows ever. Periodic work goes on pg_cron / Edge Functions.

---

## Timing reality

9 weeks to validation deadline. The sequenced queue below is ~50 items. Not all are mine — β refactor splits across Audit Builder / Troubleshoot / Dallin in Vapi. But the volume + the β VAPI HMAC gate (Dallin must ask Vapi support before any β work proceeds) + the n8n quota reset on June 1 means: **expect to ship v0.7 + v0.8 by mid-July. v0.9 + v1.0 will likely slip past July 23 unless scope drops.**

Worth Dallin's decision: ship v0.8 hard, accept that "production-ready done-for-you" is mid-August, push outreach hard with Sharpline as the only reference until then. Or: cut v0.9 and v1.0 to a leaner "good enough" subset (no analytics page, no help center, no PWA) and try for July 23.

---

## v0.7 — Security closure + onboarding scale prep

**Goal:** Close audit Batch 1B, ship the β refactor (if Vapi HMAC gate clears), make onboarding customer #2 a <30-min job.

### Phase 1 — Unblock (this week)

| # | Task | Effort | Owner |
|---|---|---|---|
| 1 | **Sharpline webhook secret rotation** (Audit Blocker 1) — generate 48-hex, update Vapi tool headers first, then `client_secrets`, then activate, test call. | S | Dallin + Claude Code |
| 2 | **WF-Billing Code node + Stripe key rotation** (Audit Blocker 2) — rotate Stripe webhook secret, replace Code node body (or use the simpler split-node alternative), test with Stripe CLI. | S | Claude Code |
| 3 | **HIGH-5 closure** — apply `client_secrets_format_chk` migration once #1 is done. | S | Claude Code |
| 4 | **Reconcile local `supabase/migrations/`** — currently 12 files local vs 90 applied remote. One-shot `supabase db pull` + git commit. | S | Claude Code |
| 5 | **Clean stale README** — remove the WF13 keep-warm cron setup section (Pro = no auto-pause; cron is forbidden anyway). | S | Claude Code |

### Phase 2 — n8n security (after June 1 quota reset)

| # | Task | Effort | Owner |
|---|---|---|---|
| 6 | **HIGH-8** — Vapi end-of-call webhook signature verification on WF10. Add `vapi_server_secret` to `client_secrets`, add `lookup_client_by_vapi_secret()` RPC, gate WF10 entry. | S | Claude Code (DB) + Dallin (Vapi) |
| 7 | **HIGH-10** — Re-enable WF-Billing's 3 disabled state-sync handlers (`Activate Client`, `Disable Client (Past Due)`, `Disable Client (Cancelled)`). Verify `set_client_active_by_subscription` signature first. | S | Claude Code |
| 8 | **MEDIUM-1 wiring** — Add HTTP `onError` nodes on WF1/2/3/4/8/9/10/Billing pointing at `/rest/v1/workflow_errors`. | S | Claude Code |
| 9 | **LOW-6** — Set WF-Billing `errorWorkflow` setting to the new sink (bundle with #8). | S | Claude Code |

### Phase 3 — Rate limit + pg_cron foundation

| # | Task | Effort | Owner |
|---|---|---|---|
| 10 | **CRITICAL-3 Part A** — `CREATE EXTENSION pg_cron`, write `process_due_sms()` SECURITY DEFINER, schedule `cron.schedule('sms_tick', '*/5 * * * *', ...)`, delete WF12/WF13 from n8n. (Twilio call from SQL needs Edge Function via `net.http_post()`.) | M | Claude Code |
| 11 | **CRITICAL-3 Part B** — `webhook_rate_limit` table + `check_webhook_rate_limit()` function. SQL ships first; WF1 enforcement after quota healthy. | S+S | Claude Code |
| 12 | **HIGH-3** — `sms_messages.client_id` index. | S | Claude Code |

### Phase 4 — β refactor (gated)

**Pre-req:** Vapi HMAC verification answer from Vapi support. Pre-req: Phase 1-3 closed.

| # | Task | Effort | Owner |
|---|---|---|---|
| 13 | **Vapi HMAC support ticket** — confirm Vapi natively HMAC-signs tool-call bodies per-assistant. | S | Dallin |
| 14 | **β Phase 1 — schema** — `client_signing_secrets`, `webhook_replay_cache`, RPCs (`resolve_client_by_assistant_id`, `verify_vapi_signature`), UNIQUE index on `vapi_assistant_id`. | M | Audit Builder chat |
| 15 | **β Phase 2 — WF1 dual-path** — manual UI edit if WF5 still unpublished. | M | Troubleshoot / Dallin |
| 16 | **β Phase 3 — tool-by-tool migration** — 6 tools × 2 tenants, per-tool rollback. | M | Dallin in Vapi |
| 17 | **7 clean days** — observability window. | — | — |
| 18 | **β Phase 4 — decommission legacy** — drop `client_secrets` table, drop `Clients.webhook_secret` column (HIGH-1 part 2). | S | Audit Builder |

### Phase 5 — WF10 email path (user-visible)

| # | Task | Effort | Owner |
|---|---|---|---|
| 19 | **MEDIUM-7 + MEDIUM-8 + MEDIUM-9** bundle — Resend `from` = `noreply@getfield.co`, replace dead `should_send_email` check, fix stale `fielddashboard.netlify.app` URL → `app.getfield.co`. One n8n save. | S | Claude Code |

### Phase 6 — Onboarding plumbing (overlaps with Phase 4-5)

| # | Task | Effort | Owner |
|---|---|---|---|
| 20 | **Publish WF5** (verify safe first) — unblocks WF1 partial-update validation. | S | Dallin |
| 21 | **`create_test_tenant(jsonb)` SQL function** — provisions full tenant from JSON spec. Must populate `client_signing_secrets` (post β Phase 1). | M | Claude Code |
| 22 | **`provisioning_state` column** on Clients — `draft` / `pre_flight` / `live` enum. WF1 rejects non-`live` traffic. | M | Claude Code |
| 23 | **`save_message` Vapi tool** — verify status in Vapi dashboard (Builder says registered, main says missing). Complete if missing. | S | Dallin |
| 24 | **Vapi account migration** to `dallin@getfield.co`. | M | Dallin |
| 25 | **A2P 10DLC decision + execution** — toll-free vs 10DLC based on projected per-tenant SMS volume. | M | Dallin |

### v0.7 done when
- Audit Batch 1B closed (CRITICAL-4 cutover, HIGH-8, HIGH-9).
- HIGH-5 CHECK live on `client_secrets`.
- WF-Billing Code node calls RPC, no hardcoded `whsec_`.
- pg_cron installed; `process_due_sms` running.
- WF1 enforces rate limit.
- β complete OR explicitly deferred to v0.8 with reason.
- Onboarding customer #2 takes <30 min Dallin time.

---

## v0.8 — Operational maturity

**Goal:** When a customer reports something broken on a Saturday night, diagnose + fix in <30 min.

| # | Task | Effort | Owner |
|---|---|---|---|
| 26 | **Operator runbook** — `docs/runbook.md`. Failure modes: calls not reaching n8n / n8n errors / Supabase down / Twilio SMS not sending / login broken. Symptom → diagnostic → fix. | M | Claude Code |
| 27 | **Sentry alert rules** — 5xx from API routes, unhandled promise rejections on hot path, auth-failure spikes. Document the rules in runbook. | S | Claude Code |
| 28 | **Backup verification** — quarterly test restore to a Supabase branch. Document procedure. | M | Claude Code |
| 29 | **RLS test suite** — pgTAP. For each tenant table, assert user from tenant A cannot see tenant B's data. Incremental rollout OK. | L | Claude Code |
| 30 | **Magic-link team invitations** — `invitations` table exists; build end-to-end (API route + Resend template + invite landing page). | M | Claude Code |
| 31 | **Per-customer analytics page** — calls, leads, bookings, escalations, missed-after-hours. Charts. | L | Claude Code |
| 32 | **Owner daily email digest** — Supabase Edge Function (NOT n8n), Resend template. | M | Claude Code |
| 33 | **Vapi prompt auto-sync** — Postgres trigger on `Clients` UPDATE → `render_system_prompt` → Vapi assistant PATCH via API. Solves the static-prompt drift. Allows shrinking the protected-columns list. | M | Claude Code |

---

## v0.9 — Admin tooling for done-for-you scale

**Goal:** Onboard customer #5+ in 30 min focused work + 5 min pre-flight review.

| # | Task | Effort | Owner |
|---|---|---|---|
| 34 | **`/admin/clients/new` form** — replaces SQL-by-hand. Calls `create_test_tenant()`. | L | Claude Code |
| 35 | **Pre-flight checklist UI** at `/admin/clients/[id]/preflight` — rendered prompt review, embedded Vapi test call link, checklist gates "Ship to Production" button. | L | Claude Code |
| 36 | **Locked-fields request-ticket UX** — `change_requests` table (soft-delete), modal in settings pages, Resend email on submit. `vapi_assistant_id` read-only; signing secrets never surfaced. | L | Claude Code |
| 37 | **`/admin/leads`** — sales pipeline view on `lead_intake` (new → contacted → discovery → qualified → onboarding → won/lost). | L | Claude Code |
| 38 | **Admin tenant list** with `provisioning_state` filters + bulk actions. | M | Claude Code |
| 39 | **Calendar integration** — Google Calendar OAuth using existing `calendar_connections` table. Bookings sync both ways. | L | Claude Code |
| 40 | **CSV export improvements** — date range, filtered, PDF lead reports. | M | Claude Code |
| 41 | **In-app changelog modal** — when new features ship. | M | Claude Code |
| 42 | **Help center** — top 5 customer questions answered. | M | Claude Code |

---

## v1.0 — Production-ready done-for-you product

**Goal:** Cold outreach ready. Submission → discovery → payment → live in 48 hours.

| # | Task | Effort | Owner |
|---|---|---|---|
| 43 | **Stripe live mode + payment flow** — switch keys, verify webhook, possibly Stripe Tax. | M | Dallin + Claude Code |
| 44 | **A2P 10DLC compliance** OR finalized toll-free verification (depends on Phase 6 #25 decision). | M | Dallin |
| 45 | **Public `getfield.co/signup`** = Request Access form live, writing to `lead_intake`. | S | Marketing chat (schema verify here) |
| 46 | **Branded transactional emails** — React Email or similar. Welcome, invite, receipt, digest, password reset. | L | Claude Code |
| 47 | **Status page** at `status.getfield.co` — Statuspage free tier OR custom. | S/M | Claude Code |
| 48 | **PWA setup** — `app/manifest.ts`, service worker, icons, install on iOS + Android home screen. | M | Claude Code |
| 49 | **Cross-tenant admin tooling** — impersonate (with audit trail), support escalation, billing actions. | L | Claude Code |
| 50 | **Help center matured** — top 15 questions. | M | Claude Code |

---

## Sweep (interleave throughout)

Lower-priority audit findings that should land before v1.0:

| Finding | What |
|---|---|
| MEDIUM-2 | Remove `__platform__` sentinel from Clients comment + `clients_select_own` |
| MEDIUM-3 | FK index sweep |
| MEDIUM-5 | `audit_unified` view |
| MEDIUM-6 | `onboard_intake_log` policy or comment decision |
| LOW-1 | Verify no role literals remain in policies |
| LOW-5 | Hoist Supabase URL out of n8n HTTP nodes |
| NIT-1 | Confirm/drop `contacts_with_stats` (currently exists in `information_schema.tables`) |
| NIT-2 | Rename `normalize_e164(input)` → `normalize_e164(p_phone)` |

---

## Parking lot (post-v1.0)

Do not build until explicitly requested:

- Multi-location support for tenants with multiple branches
- Team chat / collaboration inside dashboard
- Voice cloning per business (AI sounds like the owner)
- Advanced routing (different scripts per time / caller type)
- Marketplace of "Field Modules" (industry-specific add-ons)
- White-label option
- Outbound calling
- Native iOS/Android app (PWA first; only if PWA proves insufficient with customer signal)
- **Spanish language support** (the Builder roadmap line that contradicted v1.0 scope — resolved: parked)
- Field Lite tier ($99-149/mo) — only if 12+ months of price-objection data justifies
- `lost_deals` table — trigger threshold: 5+ lost deals citing price in any rolling 60-day window

---

## Open issues from Audit §4 (anticipate, don't build yet)

- **Vapi prompt sync drift** — addressed by v0.8 #33.
- **6 central tools refactor** — v0.7 β (#14-18).
- **A2P 10DLC** — Phase 6 #25 + v1.0 #44.
- **Per-tenant Twilio number provisioning** — not urgent until customer #5+.
- **Solo founder ceiling at ~15-20 customers** — decision point at customer #10: hire vs automate further vs cap intake.
- **n8n cloud single point of failure** — replicate WF1 as Edge Function fallback. Defer until n8n actually fails.
- **Dashboard SMS perf at scale** — addressed by HIGH-3 index (#12); pagination + archival worth building at 20+ tenants.
- **Stripe fee compound** — offer ACH discount at customer #25.
