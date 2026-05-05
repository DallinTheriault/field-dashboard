# Field Dashboard v0.6.3

Polish + lessons-learned release on top of v0.6.2.

## What's new in v0.6.3

### Bug fixes

- **Notification badge actually visible** — `coral-500` was an undefined Tailwind class, so the badge had been rendering with no background color since v0.6.1. Replaced with `status-danger` (theme-aware, defined in globals.css), bumped size to 18px, added a glow shadow, and brighter pulse ring. Bell icon now also shows in red when unread. Same fix applied to activity timeline failed-message indicator.
- **SMS thread page layout** — was a single growing scroll. Now a flex column that fills viewport height: thread header pinned at top, messages scroll between, reply box pinned at bottom. Especially noticeable on mobile.

### Database hardening (Supabase migrations applied)

- **`normalize_e164(text)` SQL helper** + **trigger on Clients** — auto-normalizes `twilio_number`, `business_phone`, `owner_phone`, `escalation_phone` to E.164 on insert/update. Handles paste from any source: `(801) 555-0142`, `8015550142`, `+18015550142` all become `+18015550142`. Trims whitespace and newlines. Prevents the silent webhook-routing bugs from v0.6.x.
- **`render_system_prompt()` fails loudly** — now refuses to render if any of `business_name`, `business_short_name`, `service_type`, `primary_service`, `business_phone`, `business_hours`, `scope_values`, `escalation_phone` are null/empty, AND scans the rendered output for unreplaced `{{tokens}}` (catches typos in the master template). Error message lists ALL missing fields at once instead of fix-one-find-next.

### n8n WF1 hardening

- **Normalize Payload code** — hardened phone handling. Now checks 4 paths in the VAPI artifact for the real caller phone, validates against E.164 format, rejects model-passed placeholder strings like `caller_phone_number` or `unknown`, trims whitespace from ALL string fields, adds `_phoneSource` debug field. Authoritative tenant `client_id` injection from upstream Supabase lookup remains unchanged.

### Documentation

- New: `docs/tenant-onboarding-checklist.md` — manual onboarding playbook with all v0.6.x lessons baked in. Explicit warnings about per-tool webhook_secret replacement (the #1 onboarding bug).
- New: `docs/save-message-tool-spec.md` — VAPI tool spec for the missing 6th tool. Apply to both Sharpline and Cascade.

### v0.7 trajectory (not in this release)

- Refactor VAPI tools from per-tenant to shared/referenced (single set of 6 tools, all assistants reference them — eliminates the webhook-secret-per-tool pattern)
- Move from per-tenant `webhook_secret` to single env-var auth + `client_id` in body (proper auth/identity separation)
- `create_test_tenant(json)` SQL function for one-shot tenant provisioning
- `/admin/clients/new` form for self-serve onboarding
- Marketing landing page at `getfield.co` apex (separate deploy)

---

# Field Dashboard v0.6.2

Polish + perf release on top of v0.6.1.

## What's new in v0.6.2

### Bug fixes

- **Settings save error** — fixed via a Postgres `NOTIFY pgrst, 'reload schema'` to refresh PostgREST's schema cache. The `Clients.updated_at` column was missing from the cache, not the table. No code change needed; already live.
- **30+ second page loads** — diagnosed and addressed. Two causes:
  1. Activity timeline had a wasted SMS query (filtered `thread_id = contactId` which is never true) followed by a re-fetch. Fixed: now does at most 2 query waves with no waste.
  2. Supabase free-tier auto-pause (project sleeps after 7 days of idle, first request takes 30-60s to wake up). Fixed: new `/api/cron/keepwarm` endpoint plus n8n schedule to ping every 5 minutes. Real fix is upgrading to Supabase Pro ($25/mo).
- **Layout queries parallelized** — was 3 sequential round-trips on every page load, now 2 (auth + parallel data fetch). Saves ~80-150ms.

### Tag UX rebuild

- Tags moved next to phone number in detail page headers (was under assignment chip, looked like the assignee's tags)
- Tags are now **outline-only** (border + text colored, transparent fill) instead of solid pills — cleaner in dense layouts
- **Manual color picker** when creating a new tag — pick from the 16-color palette via swatch grid, default rotates as before
- **`+ Tag` quick-add button** on detail page headers — small inline search bar, attach without going to edit form

### Other UX

- **Assignment chip larger and pillowed** — pill background, colored dot, more visible at a glance
- **"Messages" tab in contact card → "Voicemails"** — was confusingly the same name as the SMS page
- **SMS thread auto-update via Supabase realtime** — new messages appear without page refresh
- **Notification badge improvements** — count number with "9+" overflow, coral-colored bell when unread, bigger and more visible
- **Translucent backdrop-blur header** — applied to desktop topbar (already on mobile)

### Infrastructure

- **`/api/cron/keepwarm` endpoint** — POST with `x-cron-secret` header, n8n WF13 should ping every 5 min
- All migrations from v0.6.1 still apply (no new schema changes in v0.6.2)

## Setup additions

### n8n keep-warm cron (one-time setup)

1. n8n → New workflow "WF13 — Keep Warm"
2. Schedule trigger: every 5 minutes
3. HTTP Request node:
   - Method: POST
   - URL: `https://app.getfield.co/api/cron/keepwarm`
   - Headers: `x-cron-secret: <CRON_SECRET from Netlify env>`
4. Activate workflow

This is a workaround. The real fix is upgrading Supabase to Pro before onboarding mock-business #1.

## Deploy

```bash
cd ~/Documents/projects/field-dashboard
unzip -o ~/Downloads/field-dashboard-v062.zip -d /tmp/fd-new
rsync -av --delete --exclude='.git' --exclude='.gitignore' /tmp/fd-new/field-dashboard-v062/ ./
git add -A
git commit -m "v0.6.2: tag UX rebuild, perf fixes, realtime SMS, keep-warm cron"
git push origin main
```

## Smoke tests

1. Open a contact with tags — tags should be next to phone, not under assignment
2. Tags should be outline-only (border + text, no fill)
3. Click `+ Tag` next to existing tags — small search bar appears
4. Type new tag name — color picker grid appears below
5. Click a color swatch — picked color highlights, ready for create
6. Click create — tag attaches with chosen color
7. Open a job, click status chip — inline dropdown still works (from v0.6.1)
8. Open SMS thread, send a text from another device — appears without refresh
9. Bell icon shows count with red coral when unread

## Version history

- **v0.6.2** (this) — perf, tag UX rebuild, realtime SMS, keep-warm cron
- **v0.6.1** — tag system, inline status, feature flags, Sentry, CSV export
- **v0.6.0** — lead assignment, activity timeline, Resend
