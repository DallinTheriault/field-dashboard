# Field — Client Onboarding Quick Reference

Version 3 · Last updated 2026-04-27 (Field rebrand from IRIS)

> Canonical onboarding flow for Field (formerly IRIS, formerly ARIA).
> The default AI receptionist persona is **Wren** — clients can pick a custom
> persona name as a paid add-on. The brand is always "Field" lowercase.
> Replaces v2 (`onboarding-checklist.md`) which is now superseded.

---

## 0. Before you send the discovery form

You need a commit from the client and a clear understanding of scope. Before any work begins:

- [ ] Signed agreement or verbal commit on monthly rate (Basic / Deluxe $497 / SUITE)
- [ ] Owner's full name, email, cell number, and a paperwork-person email (often a spouse or office manager — this person will actually return the discovery form)
- [ ] Rough idea of their phone setup: existing business line on a cell, a dedicated landline, Google Voice, a PBX, etc. This determines phone strategy later.
- [ ] Confirmed assistant persona name with client. Default is **Wren**. If they want a custom name (e.g. their grandmother's name), it's a paid add-on — confirm $99 setup fee before agreeing.

**Estimated time from this point to a live assistant taking calls: 3–5 business days**, bottlenecked mostly by Twilio A2P registration and the client returning the discovery form.

---

## 1. Send the discovery form

Send `templates/client-discovery.md` to the paperwork person. Include:

- A friendly intro paragraph explaining what's needed and why
- Estimated time to fill it out (15–25 minutes)
- A deadline (3 business days out, but be flexible)
- Your direct number for questions

Use the warm-tone variant of `templates/welcome-email.md` for first-time clients. Use the formal variant if the client has been corporate-coded in your conversations.

---

## 2. Receive the form, set up the VAPI assistant

When the form comes back, review for completeness:

- [ ] All hours filled in (no gaps)
- [ ] Pricing tiers OR per-service rates provided
- [ ] At least 2 services listed
- [ ] Service area defined
- [ ] Personality picked
- [ ] Escalation phone number provided
- [ ] EIN + business address (required for A2P)

If anything is missing, send a one-line follow-up — don't try to guess.

Then in VAPI dashboard:

1. Duplicate `templates/vapi-assistant.json` for the new client
2. Replace `[BUSINESS_NAME]`, `[HOURS]`, `[SERVICES_LIST]`, `[SERVICE_AREA]`, `[PRICING_OVERVIEW]`, `[PERSONALITY_DESCRIPTION]`, `[NEVER_LIST]`, `[HUMAN_PHONE]` with the form data
3. If client picked a custom persona name, replace `Wren` with their chosen name everywhere in the prompt and `firstMessage`
4. Set the voice (default: ElevenLabs Cheri unless client picked male)
5. Save and note the new assistant ID

Add a row to `Clients` table in Supabase:

```sql
INSERT INTO Clients (business_name, persona_name, vapi_assistant_id, system_prompt, ...)
VALUES ('...', 'Wren', '...', '...', ...);
```

The `system_prompt` column is your source of truth — the VAPI dashboard pulls a copy, but if they ever drift, this is canonical.

---

## 3. Provision the Twilio number

In Twilio Console:

1. Buy a local number in the client's area code (preferred) or a toll-free if they specifically asked
2. Configure voice webhook → VAPI inbound URL
3. Configure SMS webhook → your n8n SMS handler workflow (WF5)
4. Note the new number

Add the number to `Clients.twilio_phone` in Supabase.

---

## 4. A2P registration (SMS compliance)

This is the slowest step — Twilio's A2P review can take 1–5 business days. Start it the same day you provision the number.

In Twilio Console → Messaging → Compliance:

1. Create a Brand registration with the client's EIN and business address
2. Create a Campaign under that Brand for the use case "Customer Care"
3. Submit a sample outbound SMS message (use the one from the discovery form)
4. Submit and wait

While waiting, you can still test calls — A2P only blocks SMS, not voice.

---

## 5. Configure n8n workflows

Bind the new client's data to the workflows. For each of the 8 workflows (WF1–WF9 minus WF5 which is shared), add a row in the workflow's webhook routing logic:

- Match on `vapi_assistant_id` or `twilio_phone` (depending on the workflow)
- Route to the correct `client_id` for downstream processing

Specifically:

- **WF3 (Get Estimate)** — make sure the `get_jobs_for_caller` RPC is scoped to the new `client_id`
- **WF4 (Save Booking)** — same scoping; verify the SMS confirmation node has `onError: continueRegularOutput` so a failed SMS doesn't lose the booking
- **WF8 (Reschedule)** and **WF9 (Cancel)** — both need `client_id`-scoped update filters
- **WF6 (Web Form → Leads)** — add the client's form URL if they have a public booking page

---

## 6. Test calls

Before going live, run two test calls:

1. **Happy path:** Call as a new customer asking for an estimate. Wren should ask for name, phone, address, service needed, and book a time. Verify the booking shows up in Supabase + (if integrated) Google Calendar + (if SMS is live) confirmation text.

2. **Edge case:** Call as an angry customer demanding a refund. Wren should attempt empathy, then transfer to the escalation number. Verify the transfer works.

If either fails, fix and re-test before going live.

---

## 7. Go live

1. Forward the client's existing business line to the new Twilio number (or have them publish the new number)
2. Send the warm-tone go-live email (template in `welcome-email.md`)
3. Add the client to the dashboard at `<DASHBOARD_URL>` (e.g. `hirefield.app`)
4. Set a reminder to check in at 48 hours and 7 days

---

## Notes

- **Default persona name is Wren.** Use this everywhere unless the client picked custom.
- **Brand name is always "field" lowercase.** Never capitalize it in user-facing copy.
- **Dashboard URL placeholder:** I've used `<DASHBOARD_URL>` throughout. Replace with `hirefield.app` or `app.hirefield.app` once the domain DNS is configured.
- **Stripe descriptor:** `HIREFIELD` (matches DBA).
