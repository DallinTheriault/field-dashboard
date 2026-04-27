# Field Dashboard v0.4

Next.js 15 + Supabase + Tailwind dashboard for Field (Intelligent Receptionist & Intake System).
Dark-first, salmon-accent with lime offset, Inter-fonted, production-grade.

## Setup

```bash
unzip field-dashboard.zip
cd field-dashboard
npm install
cp .env.local.example .env.local
# Edit .env.local — fill in all required values
npm run dev
# → http://localhost:3000
```

## Environment variables

```bash
# Required for app to load
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon JWT from Supabase → Project Settings → API>

# Required for Billing portal + admin payment-link generator
STRIPE_SECRET_KEY=sk_test_<your_test_secret_key>

# Required for /admin/* pages (cross-tenant queries)
SUPABASE_SERVICE_ROLE_KEY=<service_role key from Supabase → Project Settings → API>
ADMIN_EMAILS=dallintheriault@live.com   # comma-separated allowlist

# Optional
N8N_ONBOARD_WEBHOOK=https://dtheriault.app.n8n.cloud/webhook/onboard-client
```

## What's new in v0.4

**Rebrand from IRIS to Field:**
- New mark: asymmetric four-curve dipole (replaces the IRIS eye/almond)
- Ember (#FF6B35) accent dropped; replaced with **salmon** (#FF6B6B) as primary
- New offset accent token: **lime** (#BEF264) — added to the system but not yet placed in components (see "What's NOT yet built")
- All `ember-*` Tailwind classes mechanically swapped to `salmon-*` (55 replacements across 23 files)
- Idle-timeout localStorage key migrated: `aria.lastActivity` → `field.lastActivity` (existing users will see a one-time idle reset on first login post-deploy — expected and harmless)
- Page title, manifest, favicons, app icons, apple-touch-icon all rebuilt from new brand kit
- Logo component rewritten — uses dipole geometry, "field" lowercase wordmark, salmon + lime poles
- Body background gradient warm wash recolored salmon (was ember)

**Carried over from v0.3 (kept):**
- Real Calls page with searchable filters
- Real Call detail page with summary, transcript link, audio player, linked job
- Real Calendar page with month grid + conflict highlighting
- Real Job detail page
- Settings page foundation (business profile, branding, voice, calendar)
- Settings prompt viewer (read-only)
- Stripe Customer Portal wired up
- Idle session timeout (30 min, 5-min warning)
- All Overview metric cards click through
- All list rows on Overview navigate to detail

## Routes

| Path | Auth | Purpose |
|---|---|---|
| `/` | — | Auth-aware redirect |
| `/login` | public | Sign-in (with idle banner) |
| `/onboard` | public | New-client onboarding form |
| `/app` | protected | Overview |
| `/app/calls` | protected | Call log |
| `/app/calls/[id]` | protected | Call detail |
| `/app/jobs` | protected | Jobs table |
| `/app/jobs/[id]` | protected | Job detail |
| `/app/calendar` | protected | Month grid |
| `/app/invoices` | protected | (placeholder, real version in v0.5) |
| `/app/billing` | protected | Subscription + Stripe portal |
| `/app/settings` | protected | Business settings |
| `/app/settings/prompt` | protected | Read-only prompt viewer |
| `/api/stripe/portal` | protected POST | Creates Stripe portal session |
| `/dashboard` | — | Compat redirect to `/app` |

## Brand reference

Colors (defined in `tailwind.config.ts` as Tailwind tokens):

| Token | Hex | Role |
|---|---|---|
| `ink-0` | `#0a0a0a` | page background |
| `ink-1`–`ink-4` | … | layered surfaces |
| `bone-50` | `#f7f5f0` | primary text on dark |
| `bone-100`–`bone-500` | … | text hierarchy |
| `salmon-500` | `#FF6B6B` | **primary brand accent** — buttons, focus rings, key icons |
| `salmon-50`–`salmon-900` | … | full scale for hover/active/tint states |
| `lime-500` | `#BEF264` | offset accent — used at moments only (right pole of mark, accent ticks) |
| `lime-50`–`lime-900` | … | full scale (currently unused outside the logo) |

Discipline rule baked into the system: salmon dominates wherever brand color appears. Lime punctuates — used at deliberate moments, never as primary. Reserve red for UI errors and yellow for UI warnings (don't compete with brand colors).

Typography:
- Inter (300/400/500/600/700/800) for UI and headings
- JetBrains Mono for tabular data
- Wordmark uses General Sans Medium 500 (rendered as SVG paths in the brand kit, no font dependency in dashboard)

## What's NOT yet built

- **Lime placement in components** — currently lime exists only in the logo mark. Strategic placements (e.g., featured-row hover, "new lead" pulse, accent ticks on charts) are a follow-up. Don't introduce lime ad-hoc; pick deliberate moments.
- Invoices page (real flow): generate from job, send Stripe invoice
- Outbound calling
- Logo upload UI (DB column exists; UI disabled)
- Voice picker UI (DB column exists; UI read-only)
- Google Calendar OAuth flow (DB table exists; button disabled)
- Self-serve prompt editor (read-only for now)
- Reset-password page restyle (still on v0.1 plain CSS)
- Per-client Twilio number auto-provisioning
- Call summary email after each call

## Migration notes (IRIS → Field)

If you're upgrading an existing deployment, also update these external systems (the dashboard repo doesn't reach them):

1. **VAPI assistants** — replace `firstMessage` ("This is Iris…") and system prompts in each live assistant. Default persona is now Wren.
2. **Supabase `Clients.system_prompt` rows** — align with VAPI updates.
3. **Stripe product name** — rename product (currently "IRIS — [Tier]") to "Field — [Tier]".
4. **Resend sender domain** — switch to `hirefield.app` if it currently references `iris-*`.
5. **Netlify deployment URL** — point at `hirefield.app` once domain is locked.
6. **GitHub repo rename** — `iris-dashboard` → `field-dashboard`.
7. **DBA filing** — `Dallin Paul Ventures LLC dba HireField` (Utah business registration, ~$22).

The dashboard's `Clients.brand_primary_color` column still exists. The default fallback is now `#FF6B6B` (salmon-500). Existing client rows with custom hex values are preserved.
