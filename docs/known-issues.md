# Known Issues & Gotchas — Field

Issues that have bitten us, paired with the workaround. If something seems mysteriously broken, check here first.

---

## VAPI

### Tool UI rejects "Invalid JSON Schema" on paste
**Symptom:** Pasting a full function definition into VAPI's tool "parameters" field raises:
```
Invalid JSON Schema: { "_errors": [], "type": { "_errors": ["Invalid literal value, expected \"object\""] }, ...
```

**Cause:** VAPI's parameters field accepts JSON Schema only, not the full function envelope. It expects the top-level object to be `{type: "object", properties: {...}}`, but a full envelope has `type: "function"` at the top.

**Fix:** Paste only the JSON Schema:
```json
{
  "type": "object",
  "properties": { ... },
  "required": [...]
}
```
Function name, description, server URL, and headers go in their own separate UI fields. Cloning an existing tool and editing those fields is the reliable workflow.

---

### System prompt doesn't update after editing `master_v1`
**Symptom:** Updated the prompt template in Supabase, but the AI on calls is still saying the old thing.

**Cause:** VAPI stores a static copy of the rendered system prompt in each assistant. Supabase template edits don't propagate.

**Fix:**
1. `SELECT public.render_system_prompt(<client_id>)` in Supabase.
2. Apostrophes may be doubled (`''`) due to original INSERT escaping. Run `.replace("''", "'")` before paste.
3. Paste into the VAPI assistant's System Prompt field.
4. ALSO update the `First Message` field if the greeting changed — that field overrides the prompt's GREETING line.

**Long-term fix:** v0.8 auto-sync system. See `docs/roadmap.md`.

---

### Model emits stage directions as dialogue
**Symptom:** AI says things like *"fire save_estimate"* out loud to the caller.

**Cause:** GPT-4o-2024-05-13 doesn't reliably distinguish bracketed stage directions like `[fire save_estimate]` from speakable text in prose-style prompts.

**Fix:** Use numbered SAY/CALL/WAIT sequences in the prompt with an explicit TOOL CALLING RULE block. Don't introduce stage directions in brackets. The current `master_v1` template was hardened against this (v0.6.4 prompt fix).

---

## n8n

### `n8n_update_partial_workflow` fails validation on WF1
**Symptom:** MCP edit to WF1 returns a validation error about an unrelated workflow.

**Cause:** WF5 (SMS Conversation Handler) being unpublished historically causes WF1 validation to fail because of inter-workflow references.

**Fix (in order of preference):**
1. Publish WF5. Cleanest. Also closes a roadmap item.
2. Paste JS manually via the n8n UI for that one edit.

---

### Quota exhaustion on the Starter plan
**Symptom:** Workflows refuse to execute. Error messages reference quota.

**Cause:** WF12 (scheduled SMS tick) and WF13 (keep-warm cron) per-execution billing eats the quota.

**Fix:** Both were disabled. Quota resets June 1. UptimeRobot recommended as free keep-warm replacement for WF13.

**Rule of thumb:** Scheduled tasks don't belong on n8n per-execution billing. Use pg_cron (requires Supabase Pro) or serverless / UptimeRobot.

---

## Supabase

### `apply_migration` with apostrophes or newlines fails silently
**Symptom:** Migration says it succeeded, but `LENGTH(body)` is unchanged or text didn't update.

**Cause:** Single-quoted strings break on embedded apostrophes. Chained `REPLACE()` calls collide if they use the same dollar-quote tag.

**Fix:** Use distinct dollar-quote tags per search/replace pair:
```sql
SELECT REPLACE(
  REPLACE(body, $tag_a$old text 1$tag_a$, $tag_b$new text 1$tag_b$),
  $tag_c$old text 2$tag_c$, $tag_d$new text 2$tag_d$
)
```
Verify with `SELECT LENGTH(body), updated_at FROM prompt_templates WHERE id='master_v1';` after every migration touching the template.

---

### `"Clients"` table queries fail
**Symptom:** `relation "clients" does not exist`.

**Cause:** Table name is double-quoted with capital C.

**Fix:** Always use `public."Clients"` in raw SQL.

---

### Settings page raises Postgres error on save
**Symptom:** Owner clicks Save on a Clients field, sees error like `P0001: business_hours change requires platform admin`.

**Cause:** `trg_clients_protect_system_fields` blocks owner-role updates to ~25 columns. Working as designed.

**Fix:** This is the v0.7 locked-fields request-ticket UX work. Until it ships, the field is genuinely admin-only — owner can't edit. Triage:
- `vapi_assistant_id`: never expose for edit. Read-only display only.
- `client_signing_secrets.signing_secret` (if β shipped): never expose at all.
- Other fields: route through the change-request modal once built.

---

### Supabase auto-pauses after 7 days
**Symptom:** Free-tier project becomes unresponsive after a week of idle.

**Cause:** Free-tier auto-pause.

**Fix:** Pinging `/api/cron/keepwarm` every 5 min (WF13 historically did this). OR upgrade to Pro ($25/mo, kills auto-pause).

---

## WF1 / Phone handling

### Phone field shows literal `caller_phone_number` or `unknown`
**Symptom:** Job row created with phone = `caller_phone_number` or other model-emitted placeholder.

**Cause:** GPT-4o may pass placeholder strings if the tool description suggests it should ("leave blank if unknown — system will fill it in").

**Fix:** WF1's Normalize Payload node ALWAYS overrides model phone with VAPI call metadata. If it's still leaking, check that the override is firing — the `_phoneSource` field in WF1 execution logs reveals which source won. Also: clean up the tool description text in VAPI.

---

### Phone field is empty string instead of NULL
**Symptom:** `jobs.phone = ''` when caller hung up before giving a number.

**Cause:** WF1 wrote `''` when neither model nor metadata yielded a usable phone.

**Fix:** This was patched. Verify in WF1's Normalize Payload — empty/missing should resolve to NULL, not `''`. Re-confirm before adding any UNIQUE constraint on contact phones.

---

## Dashboard

### Tailwind class silently does nothing
**Symptom:** Styles don't apply, no console error.

**Cause:** Undefined class name (`coral-500`, `field-100` if not in theme).

**Fix:** Only use theme-defined tokens (`status-danger`, `field-500`, etc.). Check the Tailwind config before inventing colors.

---

### Font reverts to system default
**Symptom:** Dashboard ships without web fonts; everything is San Francisco.

**Cause:** Build process strips `next/font/google` imports during container builds; restore step doesn't always run.

**Fix:** Always verify `app/layout.tsx` has the font import intact before zipping. Smoke-test in `app.getfield.co` after deploy.

---

## Onboarding

### #1 bug: wrong webhook_secret in copied tool headers
**Symptom:** New tenant's calls return 401 from WF1.

**Cause:** When cloning tool definitions in VAPI from an existing assistant to a new one, the `X-Webhook-Secret` header keeps the original tenant's value.

**Fix:** v0.7 β refactor eliminates per-tenant secrets in tool headers. Until β ships, paste the new tenant's secret into every tool definition (6 per tenant). Document in `docs/tenant-onboarding-checklist.md` as the FIRST gotcha.

---

### VAPI's "First Message" field doesn't reflect prompt changes
**Symptom:** Updated the system prompt's GREETING but the AI still uses the old greeting.

**Cause:** VAPI's First Message field overrides the prompt's GREETING line and is set separately.

**Fix:** Update both. Document in onboarding checklist.

---

### Setting `owner_phone` but not `business_phone`
**Symptom:** Prompt renders without the business phone token populated.

**Cause:** Separate fields, both used in different places of the rendered prompt.

**Fix:** Set both during onboarding.
