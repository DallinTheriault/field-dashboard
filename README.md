# Field Dashboard v0.6.0

Next.js 15 + Supabase + Tailwind dashboard for **Field** — productized AI voice
receptionist SaaS for service businesses.

Brand kit lives separately. Domain: `getfield.co`. Dashboard subdomain: `app.getfield.co`.

## What's new in v0.6.0

- **Lead assignment** — every job and contact can be assigned to a team member.
  Dropdown on edit forms, chip on detail pages. Backed by `assigned_user_id`.
- **Activity timeline** — unified read-time view of calls + SMS + status changes
  on job and contact detail pages. Replaces the old "linked calls" panel on
  jobs and adds an "Activity" tab as the default on contacts.
- **Tags on contacts** — same `TagInput` UX as jobs, GIN-indexed for filtering.
- **Resend scaffolding** — `lib/email/send.ts` wraps the Resend SDK. Dev-mode
  stub if `RESEND_API_KEY` is unset (logs instead of sending). DNS setup is in
  `docs/v060-setup.md`.
- **Modular VAPI prompt template** — `prompt_templates` table + `render_system_prompt`
  RPC. Already round-trips with Sharpline. Adding a new tenant = filling 14 tokens.

Magic-link invitations deferred to v0.6.1 (needs Resend SMTP fully wired).

## Setup

```bash
unzip field-dashboard-v060.zip
cd field-dashboard-v060
npm install
cp .env.local.example .env.local
# Edit .env.local — fill in all required values
npm run dev
# → http://localhost:3000
```

## Required environment variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon JWT>
SUPABASE_SERVICE_ROLE_KEY=<service role key — for /admin/*>
ADMIN_EMAILS=dallintheriault@live.com

# App URL (used for redirects, email links)
NEXT_PUBLIC_APP_URL=https://app.getfield.co

# Twilio (SMS)
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...

# Stripe (billing)
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Resend (email — v0.6.0 NEW)
RESEND_API_KEY=re_...
EMAIL_FROM_NOREPLY="Field <noreply@getfield.co>"
EMAIL_FROM_SUPPORT="Field Support <support@getfield.co>"

# Cron (scheduled SMS tick)
CRON_SECRET=<random string>

# n8n (intake webhook)
N8N_ONBOARD_WEBHOOK=https://dtheriault.app.n8n.cloud/webhook/onboard-client
```

See `docs/v060-setup.md` for end-to-end DNS/Netlify/Resend/Supabase setup
instructions for the new `getfield.co` domain.

## Project structure

```
app/                 — Next.js app router pages + API routes
  app/               — authenticated dashboard (`/app/*` routes)
    jobs/[id]        — job detail + edit
    contacts/[id]    — contact detail + edit
    calls/[id]       — call detail
    messages         — SMS conversations
  admin/             — cross-tenant admin (gated by ADMIN_EMAILS)
  api/               — server routes (twilio, stripe, branding, etc.)
  onboard/           — public onboarding form
  signup/            — self-serve signup
components/
  activity/          — activity-timeline
  assignment/        — assignment-select, assignment-chip
  tags/              — tag-input, tag-chips, tag-filter-dropdown
  shell/             — app shell (sidebar, mobile nav)
  sms/               — SMS thread/composer
  ui/                — generic primitives
lib/
  supabase/          — server, client, admin, middleware
  permissions/       — role-based capability checks
  team/              — types (client-safe), members (server fetch)
  timeline/          — activity timeline fetcher
  email/             — Resend wrapper
  twilio/            — Twilio client + helpers
  sms/               — phone normalization, consent keywords
docs/                — operator runbooks and setup guides
supabase/            — migrations
```

## Key invariants

- **All client-side imports must avoid `next/headers`.** Server-only modules
  (anything importing `lib/supabase/server`) cannot be imported from a `"use client"`
  component. Use `lib/team/types` for client, `lib/team/members` for server.
- **Tenant scoping is enforced by RLS, not by app code.** All policies use
  `IN (SELECT public.current_user_client_ids())`.
- **`Sharpline = id 1`. Never use as test data.** Use `is_test=true` tenants for
  dev work.
- **Modular VAPI prompt** — when adding a new tenant, fill `Clients` row tokens
  then call `save_rendered_system_prompt(client_id)`. The RPC reads from
  `prompt_templates` and substitutes.

## Deploy

```bash
# After Netlify credits return:
cd ~/Documents/projects/field-dashboard
unzip -o ~/Downloads/field-dashboard-v060.zip -d /tmp/fd-new
rsync -av --delete --exclude='.git' --exclude='.gitignore' \
  /tmp/fd-new/field-dashboard-v060/ ./
npm install && npm run build
git add -A && git commit -m "v0.6.0: lead assignment + activity timeline + Resend"
git push origin main
# Netlify auto-deploys
```

## Version history

- **v0.6.0** (this) — lead assignment, activity timeline, contact tags, Resend scaffolding
- **v0.5.12** — tags on jobs, test-tenant flag, auth callback hardening, lead-assignment foundations (schema only)
- **v0.5.11** — three-tier roles (owner/manager/member), `team_audit_log`, signup page, intake hardening
- **v0.5.10** — admin pending-intake queue
- **v0.5.0–9** — SMS conversations, scheduling, templates
- **v0.4** — IRIS → Field rebrand
- **v0.1–3** — initial dashboard build

See git history for details on individual versions.
