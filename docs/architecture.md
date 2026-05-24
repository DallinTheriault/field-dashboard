# Architecture — Field

Parts of Field that live outside this repo and Claude Code can't grep: Vapi, n8n, Supabase. Read this before touching anything that talks to those systems.

---

## ⚠ VERIFY BEFORE STARTING

State as of **2026-05-23, verified live via Supabase MCP + n8n MCP**. Drift is inevitable. Before doing real work, run these checks. **Trust reality. Fix this doc.**

### Live-state verification — Supabase

Use `mcp__0af6e45b-...__execute_sql` (project `your-project-ref`):

```sql
-- 1. Tenant inventory
SELECT id, business_short_name, vapi_assistant_id, twilio_number, is_test, is_active
FROM public."Clients" ORDER BY id;
-- Expect: id=1 Sharpline (prod), id=8 Cascade (test). Both is_active=true.

-- 2. β-related and security tables present?
SELECT table_name FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN ('client_signing_secrets','webhook_replay_cache','change_requests',
                     'webhook_rate_limit','client_secrets','platform_admins',
                     'workflow_errors','lead_intake','stripe_webhook_secrets');
-- Currently present (2026-05-23): client_secrets, lead_intake, platform_admins,
--   stripe_webhook_secrets, workflow_errors.
-- Currently absent: client_signing_secrets, webhook_replay_cache, change_requests,
--   webhook_rate_limit. β not started; change-request UX not built; rate limit not built.

-- 3. Clients triggers + legacy column status
SELECT
  EXISTS(SELECT 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='Clients' AND column_name='webhook_secret') AS has_legacy_webhook_secret_col,
  array_agg(tgname ORDER BY tgname) AS clients_triggers,
  (SELECT COUNT(*) FROM public.client_secrets) AS client_secrets_count,
  (SELECT array_agg(LENGTH(webhook_secret)) FROM public.client_secrets) AS webhook_secret_lengths
FROM pg_trigger WHERE tgrelid='public."Clients"'::regclass AND NOT tgisinternal;
-- Expect (2026-05-23): legacy column = true; triggers = normalize_phones,
--   protect_system_fields, trim_fields, updated_at; secrets count = 2; lengths = [58, 48].
-- Sharpline's 58-char secret is non-conforming — Audit Blocker 1.

-- 4. Recent jobs have clean E.164 phones?
SELECT COUNT(*) AS bad_phones FROM public.jobs
WHERE phone IS NOT NULL AND (phone='' OR phone NOT LIKE '+1%' OR phone ~ '\s');
-- Expect: 0.

-- 5. render_system_prompt() works for both tenants
SELECT
  LENGTH(public.render_system_prompt(1)) AS sharpline_length,
  LENGTH(public.render_system_prompt(8)) AS cascade_length;
-- Expect (2026-05-23): Sharpline ~6433, Cascade ~7110. Failure = missing required field.

-- 6. Key functions present
SELECT array_agg(proname ORDER BY proname) AS functions_present
FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN (
  'render_system_prompt','normalize_e164','user_can_write_client','is_platform_admin',
  'lookup_client_by_secret','verify_stripe_signature','rotate_stripe_webhook_secret',
  'resolve_client_by_assistant_id','verify_vapi_signature','check_webhook_rate_limit',
  'set_client_active_by_subscription','create_test_tenant'
);
-- Present (2026-05-23): is_platform_admin, lookup_client_by_secret, normalize_e164,
--   render_system_prompt, rotate_stripe_webhook_secret, set_client_active_by_subscription,
--   user_can_write_client, verify_stripe_signature.
-- Absent: resolve_client_by_assistant_id, verify_vapi_signature, check_webhook_rate_limit,
--   create_test_tenant. Each maps to a roadmap item.

-- 7. pg_cron installed?
SELECT extname, installed_version FROM pg_extension WHERE extname='pg_cron';
-- Currently: NOT installed. Available on Pro. CRITICAL-3 Part A unblocks the scheduled-task
-- migration off n8n.
```

### Live-state verification — n8n

```
mcp__n8n-mcp__n8n_list_workflows  limit:100
mcp__n8n-mcp__n8n_get_workflow    id:<id>  mode:"structure"  (or "full")
```

⚠ **WF5 (SMS Conversation Handler) is unpublished** and historically blocks `n8n_update_partial_workflow` validation on WF1. Workaround: publish WF5, OR paste JS manually in n8n UI.

### Live-state verification — Vapi

No MCP. Manual via https://dashboard.vapi.ai. Two assistants:
- Sharpline: `your-assistant-id-1` ("Aria")
- Cascade: `your-assistant-id-2`

Vapi account possibly migrated from `dallin@sharplinepainting.co` → `dallin@getfield.co`. Confirm before assuming login.

---

## 1. Call flow

```
Customer dials tenant's Twilio number
  ↓
Twilio forwards to Vapi
  ↓
Vapi assistant answers using per-tenant system prompt (rendered from master_v1 template,
  pasted statically into the Vapi assistant)
  ↓
During call, model fires tools (save_estimate, save_booking, etc.)
  ↓
Tools POST to n8n WF1 (Inbound Router) at:
  https://dtheriault.app.n8n.cloud/webhook/your-vapi-webhook-id
  ↓
WF1: auth via X-Webhook-Secret → tenant resolve → Normalize Payload (phone override) → route by tool name
  ↓
Sub-workflow (WF2 Create Job / WF4 Schedule Job / WF8 Reschedule Job / WF9 Cancel Job /
  WF3 Get Job) writes to Supabase via REST API + service-role key
  ↓
Dashboard (this repo) reads via Supabase JS client + anon JWT (RLS enforced)
```

End of call: Vapi → WF10 (Call Ended) → writes `call_summaries`, `notifications`, sends email.
Stripe events: Stripe → WF-Billing → subscription state updates.

Tenant isolation throughout is by RLS on `client_id`. n8n service-role bypasses RLS. Dashboard uses anon key + auth JWT.

---

## 2. Tenants

| ID | Name | Vapi Assistant | Twilio | is_test | Status |
|---|---|---|---|---|---|
| 1 | Sharpline Painting | `your-assistant-id-1` (Aria) | `+15555550100` | false | **production — real traffic** |
| 8 | Cascade HVAC | `your-assistant-id-2` | `+15555550101` | true | test only |

**Always smoke-test on Cascade first.** Never test on Sharpline without explicit go.

---

## 3. n8n workflows (verified 2026-05-23)

| ID | Name | Active | Nodes | Notes |
|---|---|---|---|---|
| `lAoc05QMeAl5nxgs` | **WF1 — Inbound Router** | ✓ | 32 | The hub. Auth + tenant lookup + Normalize Payload + route by tool name. |
| `OAx0TBTqV8rDtA53` | WF2 — Create Job | ✓ | 5 | (was "Save Estimate" — renamed) |
| `lfiuioCS3rHCVisl` | WF3 — Get Job | ✓ | 4 | (was "Get Estimate" — renamed) |
| `qoqqoA984XdO9vbS` | WF4 — Schedule Job | ✓ | 14 | (was "Save Booking" — renamed) |
| `dUqrrJ3MXWQQP2hr` | **WF5 — SMS Conversation Handler** | ✗ | 10 | ⚠ Unpublished. Blocks WF1 partial-update validation. |
| `3aYQx5hjHiRwUP2r` | WF6 — Web Form Handler | ✓ | 6 | Request Access form → `lead_intake`. |
| `KII8BJeV3I7vIH4k` | WF7 — Client Onboarding | ✗ | 12 | Inactive. Purpose TBD — check before v0.7 onboarding work. |
| `XwFAuiKrvkJmsHZa` | WF8 — Reschedule Job | ✓ | 18 | (was "Update Booking" — renamed) |
| `NcQanOVB9XlqQk9o` | WF9 — Cancel Job | ✓ | 12 | (was "Cancel Booking" — renamed) |
| `3EYroA67BZfciSWv` | WF10 — Call Ended | ✓ | 11 | Receives Vapi end-of-call webhook. Writes `call_summaries`. |
| `Yf5mMH0NFWoeLTOi` | WF 12 — Scheduled SMS Tick | ✗ | 2 | **Disabled** (quota drain). Migrate to pg_cron — see CRITICAL-3 Part A. |
| `5rhTRK0bDNGIAKCS` | WF13 — Keep Warm | ✗ | 2 | **Disabled** (quota drain). Delete on Pro — auto-pause is dead. |
| `A0KsVEdnzCVAdWUv` | WF-Billing — Stripe Events | ✓ | 12 | Stripe webhook. CRITICAL-4 partial (Code node still has hardcoded `whsec_...`). |
| `8BIlirP0P1Xh1iVa` | WF0 — Error Handler | ✗ | 3 | Inactive. Likely target for MEDIUM-1 wire-up. |

**Single ingress URL** for all Vapi tool calls across all tenants:
`https://dtheriault.app.n8n.cloud/webhook/your-vapi-webhook-id`

Routing inside WF1 is by tool name. Auth + tenant ID currently via `X-Webhook-Secret` header (will split in v0.7 β refactor — see §7).

---

## 4. Supabase schema (essentials)

**30 public tables.** Run query 2 above for current full list. Highlights:

### Core
- `"Clients"` — tenants. **Double-quote in SQL.** ~25 prompt-template tokens. ~25 columns are locked by `trg_clients_protect_system_fields`. Legacy `webhook_secret` column still exists (pending HIGH-1 part 2).
- `client_users` — N:N membership with role (`owner` / `manager` / `member`).
- `jobs` — leads/estimates/bookings, attributed by `client_id`.
- `contacts` — deduped people per tenant.
- `messages` — voicemails / message-only calls (separate from SMS).
- `sms_threads` + `sms_messages` + `sms_scheduled` + `sms_reply_templates` + `sms_sessions` — two-way SMS conversations.
- `tags` + `job_tags` + `contact_tags` — N:N with use_count triggers.
- `prompt_templates` — `master_v1` active, per-`intake_mode` greeting blocks.
- `job_status_log`, `audit_log`, `team_audit_log` — append-only change tracking.
- `call_summaries` — Vapi end-of-call writes via WF10.
- `subscriptions`, `invoices` — billing.
- `notifications` — in-app notification queue.
- `onboard_intake_log` — provisioning rate-limit log.
- `calendar_connections` — OAuth tokens for Google Calendar (post-v1.0 feature; table exists, code doesn't).
- `invitations` — team invite tokens. End-to-end flow not shipped (v0.8 item).

### Security (post-audit, all present 2026-05-23)
- `client_secrets` — webhook secrets, service-role-only (HIGH-1 part 1). Sharpline's secret is 58 chars (Audit Blocker 1).
- `platform_admins` — replaces hardcoded admin email (HIGH-2). 1 row (Dallin).
- `stripe_webhook_secrets` — Stripe HMAC verifier (CRITICAL-4 DB-side). 1 row, not yet rotated.
- `workflow_errors` — n8n error sink (MEDIUM-1 DB-side, n8n wiring pending).
- `lead_intake` — landing-page Request Access submissions.

### Not yet built (audit/roadmap items)
- `client_signing_secrets`, `webhook_replay_cache` — β Phase 1.
- `change_requests` — locked-fields request-ticket UX (v0.9).
- `webhook_rate_limit` — CRITICAL-3 Part B.

### Key functions (verified present 2026-05-23)
- `render_system_prompt(client_id bigint) → text` — fails loudly on missing required fields. Always use for prompt validation.
- `normalize_e164(text) → text` — phone normalizer. Triggers auto-apply.
- `user_can_write_client(client_id) → bool` — owner-or-manager gate for write policies. Use this; no inline role arrays.
- `is_platform_admin() → bool` — super-admin check.
- `lookup_client_by_secret(p_secret) → bigint` — tenant resolver for WF1.
- `verify_stripe_signature(body, sig_header, tolerance) → bool` — HMAC + replay.
- `rotate_stripe_webhook_secret(p_new_secret) → text` — admin-only.
- `set_client_active_by_subscription(p_stripe_subscription_id, p_is_active) → void` — billing state.

### Triggers on `"Clients"`
- `trg_clients_normalize_phones` — auto-normalizes phone fields on insert/update.
- `trg_clients_protect_system_fields` — blocks owner-role updates to ~25 system columns. **This is what raises P0001 on settings pages** — see §6.
- `trg_clients_trim_fields` — strips whitespace.
- `trg_clients_updated_at` — bumps `updated_at`.

### RLS pattern
All tenant tables: `client_id IN (SELECT client_id FROM client_users WHERE user_id = auth.uid())`. Service-role bypasses. Dashboard uses anon + auth JWT.

---

## 5. Vapi

### Tool registration pattern
Each assistant currently has its own copy of each tool. **6 tools × N tenants** (currently 5 + `save_message` pending verification — Builder says registered, main chat says missing; verify in dashboard). v0.7 β refactor replaces this with shared tools.

### Vapi tool UI gotcha
The "parameters" / JSON Schema field accepts **JSON Schema only**:
```json
{ "type": "object", "properties": { ... }, "required": [...] }
```
NOT the full `{type: "function", function: {...}, server: {...}}` envelope. Name, description, server URL, headers all go in separate UI fields. Cloning an existing tool and editing those fields is the reliable workflow.

### System prompt — **static copy**
Stored in Vapi as a static text block per assistant. **Does NOT auto-sync** with Supabase `master_v1` template changes. Manual paste required after any template edit:
1. `SELECT public.render_system_prompt(<client_id>)`
2. `.replace("''", "'")` to undo apostrophe escaping
3. Paste into Vapi assistant's System Prompt field
4. Also update `First Message` if greeting changed — that field overrides the prompt's GREETING line

Long-term fix: v0.8 auto-sync system (Postgres trigger on `Clients` UPDATE → `render_system_prompt` → Vapi PATCH via API).

### Tool calling
GPT-4o-2024-05-13 won't reliably fire tools from prose-style instructions. The master prompt uses numbered SAY/CALL/WAIT sequences with an explicit TOOL CALLING RULE block. **Don't introduce bracketed stage directions like `[fire save_estimate]`** — the model will emit them as dialogue (fixed in v0.6.3-v0.6.4 migrations).

---

## 6. The system-field protection trigger

`trg_clients_protect_system_fields` blocks updates by non-platform-admin users to ~25 system columns on `Clients`. Verify the current list with:
```sql
SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname='trg_clients_protect_system_fields';
```

Categories: business config (hours, phone, website, name, short_name), pricing/scope (pricing_block, scope_values, service_area, primary_service, service_constraints), identity (owner_email, vapi_assistant_id, twilio_number), plus ~15 Twilio/Vapi/calendar/Stripe/feature-flag columns.

**Impact on dashboard:** any owner-role settings page that PATCHes these columns raises `P0001 / "<column> change requires platform admin"`. Working as designed.

**Why aggressively locked:** these feed `render_system_prompt`. Owner edits would change AI behavior on calls, but Vapi holds a static prompt copy. Owner thinks edit is live; AI keeps using old values. Customer-facing bug.

**Resolution (v0.9 work):** locked-fields request-ticket UX — `change_requests` table (soft-delete), Resend email on submit, modal in settings pages. `vapi_assistant_id` special-cased **read-only display only, no request option** (security under β). `client_signing_secrets.signing_secret` if β shipped: **never surface to any user role, not even masked.**

---

## 7. Authentication flow (current, pre-β)

### How Vapi tools authenticate to n8n today
Each tool definition's header:
```
X-Webhook-Secret: <per-tenant secret>
```

WF1's first node calls `lookup_client_by_secret(secret) → client_id`. One DB lookup proves auth AND identifies tenant.

### Where secrets live
- Originally on `"Clients".webhook_secret`.
- Post-HIGH-1 part 1: moved to `client_secrets` table, service-role-only.
- Legacy column **still exists** pending HIGH-1 part 2 cutover. Dashboard codebase has zero TS/TSX references to it (verified 2026-05-23) — drop is unblocked from dashboard side; verify n8n no longer reads it before dropping.

### β refactor (v0.7, not yet executed)
Replaces with: master secret + per-assistant HMAC + body-level tenant resolver via `vapi_assistant_id`. See `docs/roadmap.md` v0.7 and the β design doc (separate file — get from Troubleshoot chat).

**Blocking gate:** does Vapi natively HMAC-sign tool-call bodies per-assistant? **Dallin must ask Vapi support.** No β work proceeds until answered.

**Second gate:** audit Batch 1B closed (CRITICAL-4 WF-Billing Code node update, HIGH-8, HIGH-9). β cannot start until 1B is closed.

---

## 8. Phone handling

Three rules, learned the hard way:

1. **WF1 ALWAYS overrides** model phone with Vapi call metadata in "Normalize Payload" node. Never trust model phone values downstream. `findCallerPhone()` checks 4 different paths.
2. **`normalize_e164()` trigger** auto-applies on `Clients` insert/update. Already-normalized phones pass through unchanged.
3. **Empty string vs NULL:** if neither model nor Vapi metadata yields a usable number, WF1 should write NULL, not `''`. Verify before adding uniqueness constraints on contact phones.

---

## 9. Infrastructure notes

- **Supabase: Pro tier active.** Auto-pause is dead. pg_cron extension AVAILABLE but NOT INSTALLED — install before CRITICAL-3 Part A.
- **n8n Starter plan:** 2,500 exec/mo. WF12, WF13 disabled (quota drain). Quota resets June 1. UptimeRobot recommended as keep-warm replacement if ever needed (Pro means it isn't).
- **Legacy `/api/cron/keepwarm` endpoint** in the dashboard is now obsolete (Pro = no auto-pause). The v0.6.2 README still references it; that section is wrong. Cleanup task on roadmap.
- **Local `supabase/migrations/` is out of sync with remote.** 12 files locally vs 90 applied. Reconciling is a one-shot task (`supabase db pull`).

---

## 10. Things that have bitten us (short list — see `known-issues.md` for fixes)

- Tool-description phrases like *"leave blank if unknown, system will fill it in"* trick the model into passing literal `caller_phone_number` strings. WF1 defends, but clean tool descriptions anyway.
- `coral-500` was an undefined Tailwind class; silently rendered nothing. Only use theme tokens.
- Dollar-quoting required for `apply_migration` SQL with apostrophes or newlines. **Distinct tags per chained REPLACE** — same tag = silent no-op.
- `apply_migration` is transactional; failed = rolled back fully. No partial state.
- #1 onboarding bug: wrong `webhook_secret` in copied tool headers when provisioning a new tenant. β eliminates it.
