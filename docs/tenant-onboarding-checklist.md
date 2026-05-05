# Field — Tenant Onboarding Checklist (v0.6.3)

This is the manual onboarding playbook for adding a new paying customer to Field.
Walk through it linearly. Each checkbox is a dependency for what follows.

> **Note:** Steps marked `[v0.7]` will be eliminated by upcoming refactors
> (shared VAPI tools, single auth secret, `create_test_tenant()` SQL function,
> `/admin/clients/new` form). Until those land, follow this checklist literally.

---

## Pre-onboarding (gather from customer)

- [ ] Business legal name + DBA / short name (e.g. "Cascade HVAC Services LLC" / "Cascade HVAC")
- [ ] Owner first name, email, phone (E.164 format like `+18015550142`)
- [ ] Service type (HVAC, painting, lawn care, plumbing, etc.)
- [ ] Primary service noun (used in greeting: "calling about a [service]")
- [ ] Service area description (e.g. "Provo and surrounding 30 miles")
- [ ] Business hours (e.g. "Mon-Sat 7am-7pm MT, 24/7 emergency")
- [ ] Pricing block (free-form text describing service call fees, hourly rates, etc.)
- [ ] Service constraints (e.g. "no commercial >10 tons", "no plumbing")
- [ ] Scope values (comma-separated short tags, e.g. "AC repair, furnace install, ductwork")
- [ ] Escalation phone (where to send 'gas smell' / 'no heat' urgent calls)
- [ ] Twilio number you'll assign them (E.164, no whitespace)

---

## Stage 1 — Database setup

- [ ] **1.1** Create auth user for owner via Supabase dashboard or SQL
  ```sql
  -- Use the dashboard's "Add user" feature OR via auth.admin API
  -- Note the resulting auth.users.id
  ```

- [ ] **1.2** Insert Clients row
  ```sql
  INSERT INTO public."Clients" (
    business_name, business_short_name, slug,
    service_type, primary_service,
    business_phone, owner_phone, escalation_phone,
    business_hours, service_area, service_constraints,
    pricing_block, scope_values,
    twilio_number, webhook_secret, intake_mode,
    timezone, timezone_label,
    is_test, is_active, feature_voice_enabled
  ) VALUES (
    'Business Legal Name', 'Short Name', 'short-name-slug',
    'service_type', 'primary service',
    '+1XXXXXXXXXX', '+1XXXXXXXXXX', '+1XXXXXXXXXX',
    'Mon-Fri 8am-5pm MT', 'Provo, UT and surrounding area', 'no commercial work',
    '$89 service call. $145/hr labor.', 'comma, separated, scope, values',
    '+1XXXXXXXXXX',
    encode(gen_random_bytes(24), 'hex'),  -- random webhook_secret
    'voice', 'America/Denver', 'Mountain Time',
    true, true, true
  ) RETURNING id, webhook_secret;
  ```
  > **NOTE:** v0.6.3 trigger auto-normalizes phone fields to E.164 even if you
  > paste them with parens or spaces. Whitespace and newlines also stripped.

  > **CRITICAL:** Save the returned `id` and `webhook_secret`. You'll need both.

- [ ] **1.3** Link auth user to Client as owner
  ```sql
  INSERT INTO public.client_users (client_id, user_id, role)
  VALUES (<client_id>, '<auth_user_uuid>', 'owner');
  ```

- [ ] **1.4** Render and verify the system prompt
  ```sql
  SELECT length(public.render_system_prompt(<client_id>));
  ```
  > If this raises `Cannot render prompt for client X: missing required fields:`,
  > go fill those fields in Clients and retry. v0.6.3 fails loudly on missing
  > required fields, which is good — you want to catch this here, not in production.

- [ ] **1.5** Verify rendered prompt looks correct
  ```sql
  SELECT public.render_system_prompt(<client_id>);
  ```
  > Scan for: NO references to other tenants (e.g. "Sharpline" or "Cascade"),
  > greeting names this tenant correctly, scope/services match.

---

## Stage 2 — VAPI assistant

- [ ] **2.1** In VAPI dashboard, **duplicate** an existing assistant as starting point
  (Sharpline or Cascade — doesn't matter which, they're equivalent post-v0.6.3)

- [ ] **2.2** Rename: `[Tenant Name] — Field`

- [ ] **2.3** Replace **System Prompt** with the rendered prompt from Stage 1.5

- [ ] **2.4** Set **First Message** field — VAPI uses THIS, not the greeting
  in the system prompt. Example:
  > "Thanks for calling Cascade HVAC. This is your Field agent — what can I help you with?"

- [ ] **2.5** **CRITICAL — Replace `X-Webhook-Secret` header on all 6 tools**
  When you duplicate an assistant, the tools come with the OLD tenant's webhook
  secret. You MUST update each tool's headers with the new tenant's secret
  (from Stage 1.2).
  
  **For each tool** (get_estimate, save_estimate, save_booking, update_booking,
  cancel_booking, save_message):
  - Open the tool config
  - Find the Server section → Headers
  - Replace `X-Webhook-Secret` value with NEW tenant's secret
  - Save
  
  > **Skipping this is the #1 onboarding bug.** The model will fire tools and
  > n8n will respond "Unauthorized" because it can't find a tenant matching
  > the (wrong) secret. v0.7's shared-secret refactor will eliminate this step.

- [ ] **2.6** Optionally rename tools with tenant prefix (e.g. `Cascade_save_estimate`).
  Optional — has no functional impact, just visual organization in VAPI dashboard.

- [ ] **2.7** Save the assistant. Note its UUID.

- [ ] **2.8** Save `vapi_assistant_id` to Clients row
  ```sql
  UPDATE public."Clients" SET vapi_assistant_id = '<uuid>' WHERE id = <client_id>;
  ```

---

## Stage 3 — Twilio number

- [ ] **3.1** Buy or assign a Twilio number to the customer (or use a VAPI number for testing).

- [ ] **3.2** Save twilio_number to Clients row
  ```sql
  UPDATE public."Clients" SET twilio_number = '+1XXXXXXXXXX' WHERE id = <client_id>;
  ```
  > v0.6.3 trigger auto-normalizes — pasting "(801) 555-0142" or "8015550142"
  > is fine, will be saved as `+18015550142`.

- [ ] **3.3** In VAPI dashboard, attach the phone number to the assistant
  (Phone Numbers section → assign number to Cascade HVAC assistant)

- [ ] **3.4** Verify Twilio webhooks point at VAPI (usually auto-configured)

---

## Stage 4 — Live test

- [ ] **4.1** Call the Twilio number from your cell phone
- [ ] **4.2** Test happy path:
  - Greeting names the right tenant
  - Tools fire (model should use save_estimate after gathering info)
  - Confirm in VAPI logs: `assistant.tool.completed` (not `tool.failed`)

- [ ] **4.3** Verify data landed in Supabase
  ```sql
  SELECT id, client_id, name, phone, address, service, status, source
  FROM public.jobs
  WHERE client_id = <client_id>
  ORDER BY created_at DESC LIMIT 5;
  ```
  - `client_id` matches THIS tenant (not 1, not 8 — the correct one)
  - `phone` is E.164 (not "caller_phone_number" or other placeholder)
  - `name`, `address` reflect what you said on the call

- [ ] **4.4** Test cancel flow:
  - Call back, ask to cancel
  - Verify `cancel_booking` tool fires successfully

- [ ] **4.5** Confirm tenant shows up correctly in Field dashboard
  - Log in as the owner user (Stage 1.1)
  - Should see THEIR data, not other tenants
  - Calls/contacts/jobs all show the test interaction

---

## Stage 5 — Production hardening

- [ ] **5.1** Set Clients row `is_test = false`
- [ ] **5.2** Test invitation flow if customer has team members
- [ ] **5.3** Walk customer through dashboard once
- [ ] **5.4** Set up Stripe subscription if commercial customer (not in test mode)
- [ ] **5.5** Document any custom requests in CRM/notes for follow-up

---

## Common bugs (lessons from past onboardings)

| Symptom | Root cause | Fix |
|---|---|---|
| Tools "fire" but VAPI says "No result returned" | Wrong webhook_secret in tool headers | Update X-Webhook-Secret on all 6 tools (Stage 2.5) |
| `phone` saves as `caller_phone_number` | Model passes placeholder when caller doesn't say number | v0.6.3 WF1 Normalize Payload override (already in place) |
| Greeting still says old tenant | First Message field not updated | Stage 2.4 |
| Render prompt fails on render | Missing required Clients field | Add the field, retry render. v0.6.3 lists which fields are missing. |
| `twilio_number` doesn't match in webhook routing | Whitespace/newline in saved number | v0.6.3 trigger auto-trims (already in place) |
| Data attributed to wrong tenant | Tool description had hardcoded `client_id="1"` | Remove all hardcoded client_id from tool config; n8n derives it from authoritative tenant lookup |
