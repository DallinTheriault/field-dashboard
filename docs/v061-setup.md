# Field v0.6.1 — Setup additions

If `getfield.co` and `app.getfield.co` are already wired (from v0.6.0 setup),
you only need these two new things for v0.6.1:

1. Sign up for Sentry, grab the DSN (~5 min)
2. Add Sentry env vars to Netlify (~2 min)

Plus the deploy steps at the bottom.

If you're starting fresh and haven't done v0.6.0 setup yet, do `docs/v060-setup.md`
first, then come back here.

---

## Step 1 — Sentry signup

1. Go to **sentry.io** → sign up (free tier covers ~5,000 errors/month, plenty
   for validation).
2. Create a new project:
   - Platform: **Next.js**
   - Project name: `field-production` (or whatever)
3. After creation, Sentry will show you a setup wizard with a DSN that looks
   like:
   ```
   https://abc123def456@o7654321.ingest.us.sentry.io/9876543
   ```
4. Copy that DSN. You'll paste it into Netlify env vars next.
5. Skip the wizard's installation steps — the SDK is already installed in
   v0.6.1.

### Optional: configure Sentry project settings

In Sentry → your project → Settings:
- **Alerts → Create alert rule**: "Notify when there are 10+ errors in 5 min"
  → email to `support@getfield.co`. Catches incidents fast.
- **Issues → Issue grouping**: leave default, fine for now.
- **Integrations → Slack**: skip for now unless you want real-time pings.

---

## Step 2 — Netlify env vars

Add two new env vars in **Netlify → Site config → Environment variables**:

```
NEXT_PUBLIC_SENTRY_DSN=https://abc123@o765.ingest.us.sentry.io/987
SENTRY_DSN=https://abc123@o765.ingest.us.sentry.io/987
```

Same value for both. The `NEXT_PUBLIC_` version is needed for the browser SDK
(client-side errors), the un-prefixed one is for server-side errors. Setting
only one will silently miss errors from one runtime.

Sentry is **optional** — if you skip it, the dashboard works fine, you just
won't get error reports. Highly recommended though.

---

## Step 3 — Deploy v0.6.1

When ready (and Netlify credits available):

```bash
cd ~/Documents/projects/field-dashboard
unzip -o ~/Downloads/field-dashboard-v061.zip -d /tmp/fd-new
rsync -av --delete --exclude='.git' --exclude='.gitignore' \
  /tmp/fd-new/field-dashboard-v061/ ./
npm install && npm run build
git add -A
git commit -m "v0.6.1: tag rebuild, inline status, feature flags, Sentry, CSV export"
git push origin main
# Netlify auto-deploys
```

After deploy:

### Smoke tests (5 min)

1. **Background**: visit `app.getfield.co` — should now be neutral near-black,
   not greenish.
2. **Tags**: edit a job → add a tag → save → tag should render with a color
   pill on the detail page and in the list view.
3. **Inline status edit**: open a job → click the status chip → dropdown opens
   → pick a different status → page refreshes with new status + activity
   timeline shows the change.
4. **Add contact**: click "Add contact" on contacts list → fill out form →
   create → lands on detail page with the new contact.
5. **Display name**: Settings → My Profile → set display name to "Dallin" →
   save → assignment dropdowns should now show "Dallin" instead of
   "dallintheriault".
6. **Feature flags**: visit `/admin/clients/1` (Sharpline) → toggle
   `feature_sms_enabled` off → save → visit `/app/messages` → should show
   "Disabled by admin" panel. Toggle back on.
7. **CSV export**: contacts list → Export → file downloads with all
   contacts + tags column.
8. **Sentry**: in browser console, run `throw new Error("sentry test from
   v0.6.1")` on any page → check Sentry dashboard within ~1 min, the error
   should appear.

### Recent activity debug page

`/admin/clients/1/recent-activity` — bookmark this. When something breaks,
this is your first stop.

---

## Database migrations

Already applied to live Supabase via MCP:

- `v061_tags_table_with_colors` — tags + join tables + RLS + triggers
- `v061_feature_flags` — boolean columns on Clients

The `.sql` files in `supabase/migrations/` are for repo history. Re-running
them is safe (`IF NOT EXISTS` guards), but you don't need to.

If you ever need to apply them to a fresh Supabase instance (e.g. setting up
a dev branch), run them in numeric order along with all earlier migrations.

---

## What if Sentry DSN is wrong / Sentry init fails?

If Sentry init throws on startup, the dashboard will fail to render. Worst case.
The current setup is defensive — `if (dsn)` gates init, so an unset DSN means
Sentry is a complete no-op. But if you set a malformed DSN, things might break.

Fix: clear `NEXT_PUBLIC_SENTRY_DSN` and `SENTRY_DSN` in Netlify, redeploy.
Verify `app.getfield.co` loads. Then re-paste the correct DSN.

---

## Things v0.6.1 does NOT do

Not in scope, queued for later:

- **Magic-link invitations** (v0.6.2 — needs Resend SMTP fully wired and tested)
- **RLS test suite** (v0.7+ hardening)
- **Operator runbook** (v0.7+ hardening)
- **Backup verification** (v0.7+ hardening)
- **Custom tag colors per tag** (v0.6.2 — manual color override on tag creation)
- **Tag dropping `text[]` columns** (v0.6.2 after migration verification)
- **White-label per-tenant subdomains** (v0.7+)
- **Calendar integration with Google Calendar** (v0.7+)

---

## When you're ready to onboard mock-business #1

After v0.6.1 is deployed and smoke-tested, the next milestone is testing the
modular VAPI prompt template against a non-Sharpline tenant. That validates
the multi-tenant onboarding flow end-to-end before you start charging real
customers.

Steps:

1. Create a new tenant via `/onboard` form (use `is_test=true` so it doesn't
   pollute analytics)
2. Fill in fake business details — pick a service category different from
   painting (HVAC or lawn care, both common)
3. Verify the system prompt renders correctly via
   `/admin/clients/[id]/debug-prompt`
4. Connect a test Twilio number → call it → verify the assistant introduces
   itself with the new business name
5. Document anything that breaks → those become v0.6.2 bug fixes
