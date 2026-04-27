# Field Rebrand Package

Generated 2026-04-27. Replaces all IRIS/Iris references in your repo's documentation, templates, and brand assets.

## What's in here

```
field-rebrand/
├── docs/
│   ├── onboarding-quickref.md       Canonical v3 — replaces v2 IRIS quickref
│   └── onboarding-checklist.md      Marked superseded — kept for legacy reference
├── templates/
│   ├── vapi-assistant.json          VAPI config template, validated, "Wren" persona
│   ├── welcome-email.md             Warm + formal variants
│   └── client-discovery.md          8-section questionnaire
├── brand-kit/                       Full visual brand kit (mark, lockups, palette, etc.)
└── README.md                        This file
```

## Branding rules baked into these files

- **Brand name: "field" (lowercase).** Never capitalize in body copy. Acronym "FIELD" doesn't exist — it's just a name now, no expansion. (For comparison: IRIS = Intelligent Receptionist & Intake System; Field has no expansion, it's just Field.)
- **Default persona name: "Wren".** Used everywhere unless a client picks a custom name (paid add-on).
- **Acronym in formal contexts:** when a sign-off needs to expand the brand, use "field — Intelligent Receptionist & Intake System" (the IRIS expansion, repurposed). Or just "field" with no expansion.
- **DBA: HireField** (under Dallin Paul Ventures LLC).
- **Domain: hirefield.app** (primary).
- **Stripe descriptor: HIREFIELD.**

## How to install in your repo

```bash
# 1. Rename the repo folder (your choice on timing)
mv ~/Documents/Projects/iris-dashboard ~/Documents/Projects/field-dashboard

# 2. Unzip this package
cd ~/Downloads
unzip field-rebrand.zip

# 3. Drop docs and templates into the repo
cd ~/Documents/Projects/field-dashboard
cp -r ~/Downloads/field-rebrand/docs/* docs/
cp -r ~/Downloads/field-rebrand/templates/* templates/

# 4. Drop the brand kit into your assets folder (adjust path to match your repo)
cp -r ~/Downloads/field-rebrand/brand-kit assets/

# 5. Eyeball the diff before committing
git diff
git add docs/ templates/ assets/brand-kit/
git commit -m "Rebrand from IRIS to Field; persona Iris → Wren; new brand kit"
git push
```

## What I rebranded in these files

| Was | Now |
|---|---|
| `IRIS` (brand) | `field` (lowercase) |
| `Iris` (persona) | `Wren` |
| `Intelligent Receptionist & Intake System` | Same expansion (kept for formal sign-offs, repurposed under "field") |
| `firstMessage`: "This is Iris" | "Hi, this is Wren" |
| Email subject `Iris is live` | `Wren is ready` (warm) / `Field activation confirmed` (formal) |
| Sign-off `IRIS — Intelligent Receptionist...` | `field — Intelligent Receptionist & Intake System` |
| `aria-suite-dashboard.netlify.app` | `<DASHBOARD_URL>` placeholder — replace with `hirefield.app` |
| Folder paths (legacy) | `~/Documents/Projects/field-dashboard/` |

## What you still need to do externally

These are filesystem and external-system changes I can't make from here:

1. **Rename the repo folder on your machine:** `mv iris-dashboard field-dashboard`
2. **Update the live VAPI assistants** for any current clients (Sharpline, etc.). Replace the deployed `firstMessage` and system prompt to use `Wren` instead of `Iris`. ~5 min per assistant in VAPI dashboard.
3. **Update `Clients.system_prompt` rows in Supabase** to match the new VAPI prompts. Source-of-truth alignment.
4. **Update Stripe product name** (in Stripe dashboard) from whatever IRIS-related name it has to "Field — [Tier]" (e.g. "Field — Deluxe").
5. **Update Resend domain** if it references "iris" — switch to `hirefield.app` or whatever your sender domain is.
6. **Rename the Netlify deployment** from the IRIS-era URL to `hirefield.app`. (Check that the domain is locked first.)
7. **Rename the GitHub repo** from `iris-dashboard` to `field-dashboard` (Settings → Repository name).
8. **Sweep the rest of the codebase for stragglers:**
   ```bash
   cd ~/Documents/Projects/field-dashboard
   grep -rEn "\bIRIS\b|\bIris\b|\biris\b" --include="*.tsx" --include="*.ts" --include="*.md" --include="*.json" --include="*.sql" .
   ```
   Likely stragglers: n8n workflow node names, SQL migration comments, saved system prompts in Supabase rows, env var names.
9. **DBA filing:** Register `HireField` as a DBA under Dallin Paul Ventures LLC at businessregistration.utah.gov (~$22).
10. **Domain:** Confirm `hirefield.app` is locked in to your registrar.

## Brand kit usage

The `brand-kit/` folder is a self-contained drop-in matching the IRIS folder structure exactly. Inside:

- `01-mark/`, `02-lockup-horizontal/`, `03-lockup-stacked/`, `04-wordmark/` — logo assets (SVG + PNG at 256/512/1024/2048)
- `05-app-icon/`, `06-favicon/`, `07-social/` — application assets
- `08-palette/` — color palette reference
- `brand-guidelines.html` — open in a browser for full visual usage guide
- `README.md` — file naming + color hex codes + do's/don'ts

The wordmark is converted to SVG paths, so General Sans isn't a runtime dependency.
