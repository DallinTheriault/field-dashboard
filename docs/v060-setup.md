# Field v0.6 — Domain & Email Setup

End-to-end setup for `getfield.co` (Porkbun) → `app.getfield.co` (Netlify) →
Resend (transactional email) → Porkbun email forwarding (inbound). Estimated
total time: 30-60 minutes including DNS propagation waits.

Order matters. Do steps in sequence; each later step depends on the previous
ones being verified.

---

## Step 1 — Resend signup + domain

1. Go to **resend.com** and sign up (free tier covers 3K emails/month).
2. Once signed in: **Domains → Add Domain → `getfield.co`**.
3. Resend shows you a list of DNS records to add. They look like this:

   ```
   Type    Host                  Value
   ────────────────────────────────────────────────────────────────
   TXT     send                  v=spf1 include:amazonses.com ~all
   TXT     resend._domainkey     p=MIGfMA0GCSqGSIb3DQEBAQUAA4...
   MX      send                  10 feedback-smtp.us-east-1.amazonses.com
   TXT     _dmarc                v=DMARC1; p=none;
   ```

   **Copy these exactly.** Yours will have a different DKIM `p=` value.

4. Leave the Resend tab open — you'll come back to verify after step 3.

---

## Step 2 — Netlify: add custom subdomain

This is what your dashboard URL will be (`app.getfield.co`).

1. Netlify dashboard → your site → **Site configuration → Domain management**.
2. **Add a domain** → enter `app.getfield.co`.
3. Netlify will show you a CNAME target like `your-site-name.netlify.app`.
   Copy this exact string — you'll need it for Porkbun.
4. Netlify will say "DNS verification pending." Don't worry — that's expected
   until step 3 is done.

---

## Step 3 — Porkbun DNS: add all records

This is the biggest step. You're configuring the domain to point at the right places.

Go to **Porkbun → Domain Management → getfield.co → DNS Records**.

### Records for the dashboard (Netlify)

```
Type    Host    Answer                              TTL
────────────────────────────────────────────────────────────
CNAME   app     <netlify CNAME from step 2>         600
```

### Records for email sending (Resend, from step 1)

Paste exactly what Resend showed you. The records will look like:

```
Type    Host                Answer                                        TTL
─────────────────────────────────────────────────────────────────────────────
TXT     send                v=spf1 include:amazonses.com ~all             600
TXT     resend._domainkey   p=MIGfMA0GC...                                600
MX      send                10 feedback-smtp.us-east-1.amazonses.com      600
TXT     _dmarc              v=DMARC1; p=none;                             600
```

**Important Porkbun quirks:**
- For `send` host TXT records, enter just `send` in Host field, not `send.getfield.co`
- For `_dmarc` host, enter just `_dmarc`
- For DKIM record `resend._domainkey`, enter just `resend._domainkey`
- The MX record may have a separate "Priority" field — set it to `10` if so

### Records for marketing site (apex `getfield.co`)

For now, leave the apex empty or point it at a placeholder. We'll handle the
marketing site later. If you want to redirect apex → `app.getfield.co` for now,
use Porkbun's URL Forwarding feature (Domain Management → URL Forwarding):

```
From: getfield.co (HTTP)  →  To: https://app.getfield.co  (302 redirect)
```

This is optional. Only do it if you don't want a "no website" error when
someone types just `getfield.co`.

---

## Step 4 — Porkbun email forwarding (inbound)

Resend sends emails. To **receive** at `dallin@getfield.co` and `support@getfield.co`,
use Porkbun's free email forwarding.

1. Porkbun → **Email Forwarding** → select `getfield.co`
2. Enable forwarding (free with any Porkbun-managed domain)
3. Add forwards:

   ```
   support@getfield.co  →  dallintheriault@live.com
   dallin@getfield.co   →  dallintheriault@live.com
   ```

4. Porkbun will automatically add the necessary MX records for receiving.
   **Heads up:** if Porkbun's forwarding MX conflicts with the Resend MX from
   step 3, Resend's `send` subdomain MX takes priority for sending. Inbound
   on the apex (`@getfield.co`) goes to Porkbun forwarding. They don't conflict
   because Resend uses `send.getfield.co` as its MX host, not the apex.

5. (Optional) Set up "Send as" in Live.com so you can reply from `dallin@getfield.co`:
   - Live.com → Settings → Mail → Sync email → Add a connected account
   - This lets you reply with `dallin@getfield.co` showing as the sender, but
     you compose from your existing Live.com inbox. Most professional setup
     without paying for Workspace.

---

## Step 5 — Wait + verify DNS

DNS propagation typically 5-30 minutes. Check status with:

```bash
# From any terminal
dig app.getfield.co CNAME +short
dig send.getfield.co TXT +short
dig resend._domainkey.getfield.co TXT +short
```

Or use **dnschecker.org** (paste the hostname, see global propagation).

When records resolve worldwide:
1. Netlify → Domain management → should show "Verified ✓" with SSL provisioning
2. Resend → Domains → should show "Verified ✓" for getfield.co

**SSL provisioning on Netlify** can take an additional 5-15 min after DNS
verification. Don't deploy v0.6.0 until SSL is green.

---

## Step 6 — Resend API key

Once Resend shows the domain as verified:

1. Resend → **API Keys → Create API Key**
2. Name: `field-production`
3. Permission: **Sending access** (do NOT pick Full access)
4. Copy the key (starts with `re_`) — you only see it once
5. Save it somewhere secure for now — you'll paste into Netlify env vars below

---

## Step 7 — Supabase Auth: update Site URL + redirect URLs

Auth confirmation emails and redirects need the new domain.

1. Supabase dashboard → **Authentication → URL Configuration**
2. **Site URL:** `https://app.getfield.co`
3. **Redirect URLs** (Add each one):
   ```
   https://app.getfield.co/auth/callback
   https://app.getfield.co/reset-password/update
   https://app.getfield.co/**
   ```
   The last wildcard is a catch-all for any future redirect path.

4. Save changes. The site URL is what `{{ .SiteURL }}` resolves to in email
   templates — confirmation links will now point at `app.getfield.co/auth/callback`.

5. (Optional) **Auth → Email Templates** — review the existing templates use
   `{{ .SiteURL }}` and not a hardcoded domain. The branded HTML I wrote earlier
   is in `/mnt/user-data/outputs/supabase-auth-setup.md` if you want to apply it.

---

## Step 8 — Netlify: add v0.6.0 environment variables

Netlify dashboard → your site → **Site configuration → Environment variables**.

Add (or update if they already exist):

```
RESEND_API_KEY              re_<your key from step 6>
EMAIL_FROM_NOREPLY          Field <noreply@getfield.co>
EMAIL_FROM_SUPPORT          Field Support <support@getfield.co>
NEXT_PUBLIC_APP_URL         https://app.getfield.co
```

**Important:** the value for `EMAIL_FROM_NOREPLY` and `EMAIL_FROM_SUPPORT`
includes the display name AND the angle-bracketed email. Format exactly as
shown (no quotes around the value when pasting into Netlify's UI).

`NEXT_PUBLIC_APP_URL` is referenced in places that need to construct absolute
URLs (e.g. email templates, OAuth redirects). If this stays as
`fielddashboard.netlify.app`, links in transactional emails will point at the
old URL.

---

## Step 9 — Deploy v0.6.0

When Netlify credits return and all the above is verified:

```bash
cd ~/Documents/projects/field-dashboard
unzip -o ~/Downloads/field-dashboard-v060.zip -d /tmp/fd-new
rsync -av --delete --exclude='.git' --exclude='.gitignore' \
  /tmp/fd-new/field-dashboard-v060/ ./
npm install && npm run build
# build should succeed locally
git add -A
git commit -m "v0.6.0: lead assignment + activity timeline + Resend + getfield.co"
git push origin main
# Netlify auto-deploys
```

After deploy:
1. Visit `https://app.getfield.co` → should load the dashboard
2. Sign in (your existing dallintheriault@live.com account works fine)
3. Visit a job and a contact — verify Activity timeline renders
4. Edit a job — verify the "Assigned to" dropdown shows team members
5. Edit a contact — verify Tags + Assigned to fields appear

If the old Netlify URL `fielddashboard.netlify.app` still works after deploy,
that's expected — Netlify keeps the default subdomain alongside custom domains.
You can leave both pointing at the same deploy or remove the auto-subdomain
later.

---

## Step 10 — Smoke test email

Send yourself a test email through Resend to verify deliverability:

```bash
# Local terminal, with RESEND_API_KEY in env
curl -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "Field <noreply@getfield.co>",
    "to": "dallintheriault@live.com",
    "subject": "Field — domain test",
    "html": "<p>If you got this, getfield.co sending is working.</p>"
  }'
```

Should return a JSON object with an `id`. Check your Live.com inbox within ~30 sec.

If it lands in spam: check Resend dashboard for delivery analytics — usually
means SPF/DKIM is not propagating yet, give it another 30 min.

---

## Troubleshooting

### "DNS verification pending" stuck on Netlify
- Wait 30 min; if still stuck, check Porkbun: the CNAME `Host` field should be
  just `app`, not `app.getfield.co`
- If Netlify shows "External DNS detected" — that's fine, click "Verify DNS"

### Resend domain says "Pending"
- Most common: DKIM `resend._domainkey` record was pasted with quotes around
  the `p=...` value. Porkbun strips quotes — but if you typed quotes manually,
  remove them
- Check `dig resend._domainkey.getfield.co TXT +short` — should show the long
  base64 string

### Supabase confirmation emails go to old URL
- Site URL update doesn't affect previously-sent emails
- Future emails after the change will use the new URL
- Test by triggering a new confirmation: sign up a fresh test account

### "Send as" doesn't work in Live.com
- Microsoft sometimes refuses connected accounts on free tier
- Alternative: use the Porkbun forwarder normally (replies come from your Live.com
  address, recipients see the wrong sender)
- Long-term fix: Google Workspace at $7/mo gives a real native inbox at `dallin@getfield.co`

### Build fails on Netlify with font fetch errors
- Build sandbox can't reach Google Fonts in some Netlify build images
- Fix: pin the Next.js build image version to one that includes font caching
- Or: temporarily switch fonts to Adobe-hosted alternatives in `app/layout.tsx`

---

## What's next after deploy

1. **Verify v0.6.0 features work end-to-end** — assign a lead, watch the timeline
   show calls/SMS, add tags to a contact
2. **Set up Sharpline as the test for outbound email** — use Resend to send
   yourself a fake "lead notification" email triggered by a status change
3. **Move to v0.6.1 work** — magic-link invitations now that Resend is wired

Setup work for `getfield.co` is one-and-done. After this is verified, you
shouldn't need to touch DNS or domain config again.
