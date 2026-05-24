# Request Access Form — Integration Guide

For the marketing chat to integrate into the `getfield.co` landing page.

## What this is

A drop-in replacement for the current `#signup` section that:
- Captures structured leads from the public form
- Writes directly to Supabase `lead_intake` table via anon key (RLS-protected)
- Auto-normalizes phone to E.164 (server-side trigger)
- Captures UTM params from URL automatically
- Has honeypot spam protection
- Shows success/error states without page navigation
- Does NOT require any backend code or Netlify Functions

## Files

- `request-access-form.html` — single-file snippet (HTML + CSS + JS)

## Integration steps

### 1. Get the Supabase anon key

Go to Supabase Dashboard → project `your-project-ref` → Settings → API.

Copy the **`anon` `public`** key (NOT the service_role key — that one stays server-side and goes in env vars only).

### 2. Replace the placeholder in the script

In `request-access-form.html`, find this line:

```js
const SUPABASE_ANON_KEY = 'PASTE_ANON_KEY_HERE';
```

Replace with the actual key. Anon keys are safe to expose in client-side code — they're protected by RLS policies on the database.

### 3. Drop into the landing page

The current `getfield.co` landing page has a `<section id="signup" class="surface-ink signup">…</section>` block. Replace the entire block with the contents of `request-access-form.html`.

The form uses CSS custom properties already defined in the landing page:
- `--paper-0`, `--paper-rule` — form background and borders
- `--field-500`, `--field-400` — accent colors
- `--ink-0`, `--rust-500` — text and error states
- `--on-paper-strong`, `--on-paper-body`, `--on-paper-muted` — text colors

If those don't exist in the marketing chat's current CSS, the form has fallback values inline.

### 4. Test end-to-end

After deploying:

1. Visit the live `getfield.co/#signup`
2. Fill out the form with test data (use a real email so you can verify follow-up flow)
3. Submit
4. Verify success state shows
5. Run this query in Supabase SQL Editor:
   ```sql
   SELECT id, business_name, contact_name, contact_email, contact_phone, status, created_at
   FROM public.lead_intake
   ORDER BY id DESC LIMIT 5;
   ```
6. Confirm: lead row exists, `contact_phone` is E.164 format, `status='new'`

### 5. Verify spam protection works

In browser dev tools, manually fill the hidden honeypot field:
```js
document.querySelector('input[name="website"]').value = 'spam';
```

Submit the form. The form should appear to succeed (UI shows success panel) but NO row should be inserted in the database. This silently catches bots without alerting them.

## What gets captured per submission

```json
{
  "business_name": "Cascade HVAC Services",
  "contact_name": "Marcus Reeves",
  "contact_email": "marcus@cascadehvac.com",
  "contact_phone": "+18015550142",
  "industry": "hvac",
  "employee_count_estimate": 5,
  "notes": "Currently using voicemail. Missing 5-6 calls a day.",
  "source": "getfield_signup",
  "source_url": "https://getfield.co/",
  "referrer": "https://google.com/",
  "utm_source": "google",
  "utm_medium": "cpc",
  "utm_campaign": "hvac_q2",
  "status": "new"
}
```

## What admin actions look like (NOT in this form's scope)

The form only INSERTs. To READ/UPDATE leads, the dashboard needs admin pages — that's v0.7+ work in `app.getfield.co`. RLS prevents anon/authenticated users from reading the table; admin pages must use server-side API routes with `SUPABASE_SERVICE_ROLE_KEY`.

For now, query directly in Supabase Dashboard SQL Editor:

```sql
-- New leads needing first contact
SELECT * FROM public.lead_intake
WHERE status = 'new'
ORDER BY created_at DESC;

-- Mark a lead as contacted
UPDATE public.lead_intake
SET status = 'contacted', contacted_at = NOW()
WHERE id = ?;

-- Discovery call scheduled
UPDATE public.lead_intake
SET status = 'discovery_scheduled'
WHERE id = ?;

-- Won (becomes a Clients row via your manual onboarding flow)
UPDATE public.lead_intake
SET status = 'won', closed_at = NOW()
WHERE id = ?;

-- Lost
UPDATE public.lead_intake
SET status = 'lost', closed_at = NOW(), loss_reason = 'too expensive | wrong fit | timing | competitor | other'
WHERE id = ?;
```

## Security notes

- **Anon key is safe in client code.** It's the public key; RLS does the security work.
- **Service role key must NEVER be in client code.** Anywhere. Server-side only.
- **RLS is enabled on `lead_intake`.** Anon/authenticated can only INSERT new rows with `status='new'`. SELECT/UPDATE/DELETE require service_role. So even if someone reverse-engineers the form, they can't read or modify other people's leads.
- **Honeypot will catch ~80% of automated bots.** For the remaining 20%, watch the daily intake — if you see junk submissions, add a CAPTCHA later (Cloudflare Turnstile is free and privacy-respecting).
- **Rate limiting** is not built-in. Supabase has its own rate limits at the project level; if you see abuse, add Cloudflare WAF rules in front of the apex domain.

## What I deliberately did NOT add

- **Email confirmation step.** Adds friction. Reach out manually within 24 hours instead — that's the premium-feel commitment.
- **Captcha.** Honeypot is sufficient for current traffic. Add later if abuse appears.
- **Analytics events for non-submission interactions.** Not worth the noise; Plausible/GA can track form views via standard scroll/event tracking.
- **Multi-step / wizard form.** Single-page is faster and converts better at this volume. Wizard makes sense at ~50+ submissions/day, not now.
- **Calendar embed inline.** Calendly is already linked elsewhere on the page; the request form is meant to capture leads who AREN'T ready to book a slot yet.
