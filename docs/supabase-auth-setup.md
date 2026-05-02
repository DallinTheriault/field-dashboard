# Supabase Auth Configuration for Field

Three things to set up in your Supabase dashboard before v0.5.12 deployment
(or shortly after — none are required for the app to boot, but they fix the
"emails go to aria dashboard" bug and the "ugly default template" issue).

## 1. URL Configuration

**Path: Authentication → URL Configuration**

This is the fix for the wrong-redirect bug. Supabase substitutes `{{ .SiteURL }}`
in email templates from this setting — if it's pointed at an old deployment, every
confirmation/reset link goes to the wrong place.

| Field | Value |
|---|---|
| Site URL | `https://fielddashboard.netlify.app` |
| Redirect URLs (allowlist) | `https://fielddashboard.netlify.app/auth/callback`, `https://fielddashboard.netlify.app/reset-password`, `http://localhost:3000/auth/callback`, `http://localhost:3000/reset-password` |

Save. The localhost entries let you test the flow against a local dev server later.

When you eventually move to a real domain (`fielddesk.org` or whatever),
update Site URL and add the new domain's `/auth/callback` to redirect URLs.
Old URLs can stay for a while during transition.

## 2. Email templates

**Path: Authentication → Email Templates**

Replace each template's body with the HTML below. Subject lines optional —
the existing defaults are fine.

### Confirm signup template

Subject: `Confirm your Field account`

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1e1d;">
  <table role="presentation" style="width:100%;background:#f5f4f0;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" style="max-width:480px;width:100%;background:#ffffff;border-radius:8px;border:1px solid #e5e3dd;">
          <tr>
            <td style="padding:32px 32px 16px;">
              <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#1a1e1d;letter-spacing:-0.01em;">
                Welcome to Field
              </h1>
              <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#3a3f3d;">
                Confirm your email to finish setting up your account. After confirming, ask your team owner to add you to their Field dashboard.
              </p>
              <a href="{{ .ConfirmationURL }}"
                 style="display:inline-block;padding:12px 20px;background:#4a9d8e;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;border-radius:4px;">
                Confirm your email
              </a>
              <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#7a7f7d;">
                This link expires in 24 hours. If you didn't sign up for Field, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #e5e3dd;font-size:11px;color:#7a7f7d;">
              Field — AI voice receptionist for service businesses<br>
              <span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">fielddashboard.netlify.app</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

### Password reset template

Subject: `Reset your Field password`

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1e1d;">
  <table role="presentation" style="width:100%;background:#f5f4f0;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" style="max-width:480px;width:100%;background:#ffffff;border-radius:8px;border:1px solid #e5e3dd;">
          <tr>
            <td style="padding:32px 32px 16px;">
              <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#1a1e1d;letter-spacing:-0.01em;">
                Reset your Field password
              </h1>
              <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#3a3f3d;">
                Click the button below to choose a new password. The link is valid for 24 hours.
              </p>
              <a href="{{ .ConfirmationURL }}"
                 style="display:inline-block;padding:12px 20px;background:#4a9d8e;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;border-radius:4px;">
                Reset password
              </a>
              <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#7a7f7d;">
                If you didn't request this, you can safely ignore the email — your password won't change.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #e5e3dd;font-size:11px;color:#7a7f7d;">
              Field — AI voice receptionist for service businesses<br>
              <span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">fielddashboard.netlify.app</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

### Magic link template (for v0.6.x — defer until that ships)

Skip until the magic-link invitation flow ships. Default Supabase template
won't break anything; it's just ugly.

### Email change confirmation (rarely used)

Same template as "Confirm signup" works fine. Skip unless you start letting
users change their email address (not in v0.5.x scope).

## 3. Disable email confirmation OR set up Resend SMTP

Two paths depending on whether you've set up Resend yet:

### Path A: Defer email confirmation until Resend is configured

**Path: Authentication → Sign In / Providers → Email → Confirm email = OFF**

This is the current state. Signups don't require email verification — fine
for testing, weak against bots. The honeypot + rate-limit on `/onboard` and
`/signup` cover the immediate spam risk.

### Path B: Enable email confirmation (requires working SMTP)

Only do this AFTER you've set up Resend or another SMTP provider per the
walk-through I sent you previously. Without working SMTP, signups will hang
at "check your email" forever because the email never arrives.

Steps once SMTP is configured:

1. Authentication → SMTP Settings → toggle "Enable Custom SMTP" ON, fill in
   Resend credentials.
2. Authentication → Sign In / Providers → Email → "Confirm email" ON.
3. Save.
4. Test by signing up a fresh email at `/signup` — confirmation should arrive
   within seconds.

Existing accounts (your two existing emails) MAY be prompted to verify on
next login depending on Supabase's exact behavior. Have access to your inbox
when you next sign in.

## Verifying the fixes worked

After updating Site URL + redirect URLs:

1. Sign up a fresh test email at `/signup`
2. Check the email arrives (or, in dev, check Supabase → Authentication → Users
   for the user record and grab the manual confirmation link)
3. Click the link. You should land at `https://fielddashboard.netlify.app/auth/callback?code=...`
   which then redirects to `/app`
4. Trigger a password reset. Same expected redirect — `/auth/callback?type=recovery`
   then `/reset-password`.

If anything still goes to "aria dashboard," the Site URL didn't actually save,
or there's a stale cached email already in your inbox from before the change.

