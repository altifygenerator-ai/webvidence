# Webvidence

Webvidence is an evidence-backed local prospecting SaaS for freelance web designers.

## What is working in this build

- Supabase authentication, email confirmation, profiles, workspaces, RLS, campaigns, saved leads, audits, messages, plans, subscriptions, usage counters, and owner/admin access
- Signed-in account state on the public homepage and header
- Clear dashboard logout controls
- Google Geocoding API for turning any U.S. city, ZIP, or address into coordinates
- Google Places API (New) Text Search for real local business discovery
- 25, 50, 75, and 100-mile search radiuses
- Google pagination, radius filtering, Place ID deduplication, and closed-business filtering
- Real business names, addresses, websites, phones, ratings, review counts, and Google listing links
- Visible staged loading state while searching, saving, auditing, and scoring
- Homepage inspection with factual findings and SSRF protections for public website URLs
- Google PageSpeed Insights mobile performance, accessibility, SEO, and best-practice scores
- Saved evidence scores and findings in Supabase
- Individual lead files with verified evidence and pipeline activity
- Evidence-backed outreach generation for Facebook, email, text, and follow-up
- Outreach settings for the freelancer's service, price range, customer fit, and natural voice
- Saved drafts, editing, copy-to-clipboard, sent status, lead notes, status, and follow-up dates
- Free and paid plan usage enforcement for searches, analyses, outreach drafts, campaigns, saved leads, and exports
- Durable per-user and per-IP rate limits, one-search-at-a-time locks, per-lead audit locks, and failed-search credit refunds
- Hardened website fetching with private-network blocking, manual redirect validation, standard-port enforcement, and response-size limits
- Direct browser database writes revoked for quota-controlled tables
- Stripe checkout, upgrades, Customer Portal, webhooks, and plan syncing
- Live dashboard usage reporting and owner-only operations overview
- Public npm lockfile, ESLint flat config, and a zero-vulnerability production dependency audit at packaging time

## 1. Environment

Copy `.env.example` to `.env.local` and add your values:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...

GOOGLE_PLACES_API_KEY=AIza...
GOOGLE_GEOCODING_API_KEY=AIza...
PAGESPEED_API_KEY=AIza...

OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-mini

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_STARTER=
STRIPE_PRICE_FREELANCER=
STRIPE_PRICE_STUDIO=

ADMIN_EMAIL=jlccustoms@gmail.com
DEMO_MODE=false
BILLING_ENABLED=true
RATE_LIMIT_SALT=generate_a_long_random_value
```

Generate `RATE_LIMIT_SALT` with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The same Google key may be used for all three Google variables when it is restricted to Places API (New), Geocoding API, and PageSpeed Insights API.

`DEMO_MODE=false` is required for real Google results. Restart the development server after changing `.env.local`.

If `OPENAI_API_KEY` is blank, Webvidence still creates a deterministic evidence-based draft so the workflow can be tested without AI charges.

## 2. Supabase

For a new project, run `supabase/001_initial.sql` in Supabase SQL Editor. It resets Webvidence public test tables and installs the full schema plus launch security. It does not delete Auth users.

For an existing Webvidence project that already ran `001_initial.sql`, run `supabase/002_launch_security.sql` once. It is additive and does not delete accounts, leads, campaigns, audits, messages, subscriptions, or usage. The app intentionally fails closed on search, audit, outreach, and checkout rate limiting until this migration is installed.

Set Supabase Authentication URL configuration for local testing:

- Site URL: `http://localhost:3000`
- Redirect URL: `http://localhost:3000/**`

## 3. Start

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`, sign in, then use **Find prospects** in the dashboard.

## 4. Search and outreach test

1. Search a trade around any U.S. location.
2. Analyze at least one returned business.
3. Open **Pipeline**.
4. Open that lead's file.
5. Save your normal voice in **Settings**.
6. Generate a Facebook, email, text, or follow-up draft.
7. Edit it, copy it, mark it sent, and save a follow-up date.

The response should show a **LIVE DATA** badge. If it says **DEMO DATA**, check `DEMO_MODE=false` and restart the server.

## Stripe subscriptions

Pricing actions are tied to the authenticated Supabase user. Signed-out visitors who select a paid plan are sent through signup or sign-in with the selected plan preserved. After authentication or email confirmation, Webvidence returns them to that plan and opens Stripe.

For upgrades from an existing paid subscription, enable Stripe Customer Portal subscription switching and include all three prices. The app uses Stripe's subscription-update confirmation portal flow so Stripe can show prorations and avoid creating duplicate subscriptions.

## Verification commands

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```


## Launch security model

- Plan values are read from protected Supabase profile records and updated only by the signature-verified Stripe webhook or the owner-only admin route.
- Searches, audits, and outreach drafts consume server-side monthly counters before expensive work begins. Failed provider operations refund the reserved credit.
- Search, audit, generation, billing, and workspace mutations are rate limited in Postgres so limits apply across multiple server instances.
- Only one business search can run per account at a time, and duplicate audits for the same lead are locked.
- Authenticated browser clients have read-only access to quota-controlled tables; writes pass through server routes/actions.
- Website audits reject private/reserved addresses, internal hostnames, nonstandard ports, unsafe redirects, and oversized responses.
- Paid access is granted only for Stripe subscriptions in `active` or `trialing` state.

No web application is literally impossible to attack. Keep Supabase, Stripe, Google, OpenAI, and deployment keys private; enable provider quotas and alerts; keep dependencies patched; and review logs before increasing public traffic.
