# Field — Welcome Email Templates

Two variants. Pick based on the client's communication style — warm for small-business owners who you've been chatting casually with, formal for clients who've been corporate-coded in your conversations.

Both variants reference **Wren** as the AI receptionist. If the client picked a custom persona name, find/replace `Wren` with the chosen name throughout.

The brand is always **field** lowercase. Don't capitalize it in body copy.

---

## Variant A — Warm (default)

**Subject:** Welcome to field! Wren is ready for [BUSINESS_NAME] 🎉

---

Hey [OWNER_FIRST_NAME],

Just wanted to drop you a quick note — Wren is officially live and answering calls for [BUSINESS_NAME] as of today.

Here's what to expect over the next few days:

- **Calls** are being routed to Wren via your new business number: **[TWILIO_NUMBER]**. Forward your existing line to it whenever you're ready, or start handing this number out directly.
- **Bookings** Wren makes will land in your dashboard at [DASHBOARD_URL]. You'll also get a text whenever a new lead comes in.
- **Voicemails** show up in the same dashboard inbox.
- **Transfers** to your phone ([HUMAN_PHONE]) happen automatically when someone gets angry, asks for a human, or Wren can't handle the call.

A few things to know:

1. Wren will mispronounce some names and addresses early on — totally normal, fixes itself as more calls come in.
2. If you catch Wren saying anything weird or wrong in those first few days, screenshot it and text me — I'll tune the prompt.
3. Your A2P SMS registration is [pending / approved] — once approved, Wren will start sending booking confirmation texts automatically.

I'll check in with you in 48 hours and again at the 7-day mark to see how it's going.

If anything's off, text me anytime: [YOUR_PHONE].

Thanks for trusting us with this — excited to see [BUSINESS_NAME] grow.

— [YOUR_NAME]
field — Intelligent Receptionist & Intake System
[YOUR_PHONE] · [YOUR_EMAIL]

---

## Variant B — Formal

**Subject:** [BUSINESS_NAME] — Field activation confirmed

---

Dear [OWNER_FORMAL_NAME],

This message confirms that your Field receptionist service is now active for [BUSINESS_NAME] as of [GO_LIVE_DATE].

**Service summary:**

- **Assistant name:** Wren
- **Business phone number:** [TWILIO_NUMBER]
- **Dashboard access:** [DASHBOARD_URL] — login credentials sent separately
- **Escalation number:** [HUMAN_PHONE] (calls transferred to this number when appropriate)
- **A2P SMS status:** [pending / approved]

**What happens next:**

1. Forward your existing business line to [TWILIO_NUMBER] at your convenience, or begin distributing the new number directly.
2. Bookings, voicemails, and call transcripts will appear in your dashboard. Notifications will be sent via SMS to your contact number on file.
3. Wren handles inbound calls 24/7. Transfers to [HUMAN_PHONE] occur during your specified business hours when escalation criteria are met.
4. SMS confirmations for booked appointments will activate once A2P registration completes (typically 1–5 business days).

**Support:**

We will conduct check-ins at the 48-hour and 7-day marks to review call quality, address any prompt adjustments, and answer questions. For urgent issues outside scheduled check-ins, contact [YOUR_PHONE] or reply to this email.

**Important notes:**

- During the first week, Wren may mispronounce certain names or addresses. This is expected and self-corrects with usage. Please report any persistent or material errors immediately.
- The dashboard provides full call transcripts and recordings for your review and quality control.

Thank you for choosing Field for [BUSINESS_NAME].

Sincerely,

[YOUR_NAME]
[YOUR_TITLE]
field — Intelligent Receptionist & Intake System
[YOUR_PHONE] · [YOUR_EMAIL]

---

## Notes on use

- **`Wren`** appears multiple times in each variant. If client picked a custom persona name, find/replace globally.
- **`field`** is always lowercase in body text. The only exceptions: subject lines or headers where you might use sentence case ("Field activation confirmed" is fine) and the sign-off line where the lowercase wordmark is the brand.
- **`[DASHBOARD_URL]`** placeholder — replace with your live dashboard URL (e.g. `hirefield.app` or `app.hirefield.app`).
- The "Variant A 🎉" emoji is optional — drop it if it feels off-tone for the client.
