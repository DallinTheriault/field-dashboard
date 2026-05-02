# Field Dashboard v0.6.1

Next.js 15 + Supabase + Tailwind dashboard for **Field AI** — productized AI
voice receptionist SaaS for service businesses.

Brand kit lives separately. Domain: `getfield.co`. Dashboard: `app.getfield.co`.

## What's new in v0.6.1

**Tag system rebuild.** Replaced the old `text[]` arrays with a first-class
`tags` table + `job_tags` / `contact_tags` join tables. Tags now have:

- A 16-color curated palette (rotating assignment, no two new tags get the same
  color until the palette wraps)
- Search-and-suggest picker UI with most-used + most-recent suggestions
- Live filter as you type
- Create-new-tag inline from the picker
- Shared between jobs and contacts (one `vip` tag can apply to both)
- Larger, color-coded chips on detail pages and list rows
- Bulk-fetched on list pages so adding tags doesn't hurt page perf

**Inline status edit.** Click the status chip on a job detail page to change
status without going to the edit form. Auto-saves, refreshes the activity
timeline.

**Dashboard background fix.** Removed the green tint that was bleeding through
in v0.6.0. Now neutral near-black (`#0A0A0A` page, `#141414` panels).

**Add Contact button.** Manually create contacts from the contacts list. New
form with TagPicker + AssignmentSelect.

**Display name editor.** "My profile" section in Settings to set
`raw_user_meta_data.display_name`. Replaces the email-prefix fallback in
assignment dropdowns and activity timeline events. Also improved the fallback
itself: `dallin.theriault` → `dallin t.` instead of `dallin.theriault`.

**Feature flags.** Admin can toggle voice / SMS / calendar / billing per
tenant from `/admin/clients/[id]`. Disabled features hide from the sidebar and
mobile nav, and pages render a "Disabled by admin" panel.

**Admin recent-activity debug page.** When a tenant calls support saying "the
call from 10 min ago didn't save," look up `/admin/clients/[id]/recent-activity`
to see last 50 calls, SMS, jobs, and intakes.

**CSV export.** Download contacts or jobs as CSV from the list page header.
RLS enforces tenant scoping on the endpoint.

**Notification preferences UI.** Owners can toggle email / dashboard / SMS
notifications from Settings. Backend columns already existed.

**Sentry integration.** `@sentry/nextjs` wired up. Will silently no-op if
`NEXT_PUBLIC_SENTRY_DSN` is unset, so dev unaffected. Set the DSN in Netlify
env to start receiving production error reports.

## Setup

```bash
unzip field-dashboard-v061.zip
cd field-dashboard-v061
npm install
cp .env.local.example .env.local
# Edit .env.local — fill in all required values
npm run dev
# → http://localhost:3000
```

## Environment variables (v0.6.1 adds Sentry)

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon JWT>
SUPABASE_SERVICE_ROLE_KEY=<service role key — for /admin/*>
ADMIN_EMAILS=dallintheriault@live.com

# App URL
NEXT_PUBLIC_APP_URL=https://app.getfield.co

# Twilio (SMS)
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...

# Stripe (billing)
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Resend (email)
RESEND_API_KEY=re_...
EMAIL_FROM_NOREPLY="Field AI <noreply@getfield.co>"
EMAIL_FROM_SUPPORT="Field AI Support <support@getfield.co>"

# Cron
CRON_SECRET=<random string>

# n8n
N8N_ONBOARD_WEBHOOK=https://dtheriault.app.n8n.cloud/webhook/onboard-client

# v0.6.1 NEW — Sentry (optional, for error monitoring)
NEXT_PUBLIC_SENTRY_DSN=https://xxx@o123.ingest.sentry.io/456
SENTRY_DSN=https://xxx@o123.ingest.sentry.io/456
```

## Deploy

```bash
cd ~/Documents/projects/field-dashboard
unzip -o ~/Downloads/field-dashboard-v061.zip -d /tmp/fd-new
rsync -av --delete --exclude='.git' --exclude='.gitignore' \
  /tmp/fd-new/field-dashboard-v061/ ./
npm install && npm run build
git add -A
git commit -m "v0.6.1: tag rebuild, inline status, feature flags, Sentry, CSV export"
git push origin main
```

## Migrations (already applied to live Supabase)

- `v061_tags_table_with_colors.sql` — tags + job_tags + contact_tags + RLS + triggers
- `v061_feature_flags.sql` — feature_sms/voice/calendar/billing_enabled columns

Both committed to `supabase/migrations/` for repo history but already live in
production. Re-running them is safe (`IF NOT EXISTS` guards).

## Project structure (additions in v0.6.1)

```
lib/
  features/flags.ts              — server helper for feature-flag pages
  tags/
    types.ts                     — Tag type, client-safe
    server.ts                    — list, getJobTags, getContactTags, bulk fetch
    colors.ts                    — 16-color palette + nextTagColor helpers
components/
  tags/
    tag-chip.tsx                 — TagChip + TagChipList (replaces tag-chips.tsx)
    tag-picker.tsx               — search-and-suggest picker (replaces tag-input.tsx)
  ui/
    inline-status-edit.tsx       — click-to-edit status chip
    feature-disabled-panel.tsx   — "Disabled by admin" panel
app/
  app/contacts/new/              — Add Contact page + form
  app/settings/
    my-profile-form.tsx          — display name editor
    notification-prefs-form.tsx  — owner notification toggles
  admin/clients/[id]/
    feature-flags-form.tsx       — admin feature toggles
    recent-activity/page.tsx     — debug page (calls/SMS/jobs/intakes)
  api/export/
    contacts/route.ts            — CSV export endpoint
    jobs/route.ts                — CSV export endpoint
sentry.client.config.ts          — Sentry browser init
sentry.server.config.ts          — Sentry server init
sentry.edge.config.ts            — Sentry edge init
instrumentation.ts               — Next.js instrumentation hook for Sentry
```

## Version history

- **v0.6.1** (this) — tag system rebuild, inline status edit, feature flags, Sentry, CSV export, dashboard bg fix, Add Contact, display names, notification prefs UI
- **v0.6.0** — lead assignment, activity timeline, contact tags, Resend scaffolding
- **v0.5.12** — tags on jobs, test-tenant flag, lead-assignment foundations
- **v0.5.11** — three-tier roles, team_audit_log, signup, intake hardening
- **v0.5.0–10** — SMS conversations, scheduling, templates, admin queue
- **v0.4** — IRIS → Field rebrand
- **v0.1–3** — initial dashboard build
