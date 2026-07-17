# Webvidence

Webvidence is a local prospecting and website-analysis SaaS for freelance web developers.

## Current product behavior

- Supabase accounts, email confirmation, password recovery, confirmation resend, profiles, workspaces, RLS, plans, subscriptions, usage counters, and owner/admin access
- Google Geocoding and Places API search around cities and postal codes worldwide, with country-aware disambiguation
- 25, 50, 75, and 100-mile radius search with real business websites, phones, ratings, reviews, and Google listing links
- Free plan: 5 searches, 10 website analyses, 20 outreach drafts, 5 active campaigns, and 50 open saved leads per month
- Free searches are capped at 10 returned businesses so all five searches can be used without filling storage after the first search
- Website audit samples the homepage and up to five important internal pages, then runs mobile PageSpeed on the homepage
- Audits run through a database-backed job queue, continue after the search response, retry temporary worker failures, and refund the analysis credit after three internal failures
- A business with no listed website receives a no-website finding without consuming an analysis credit
- Saved evidence, PageSpeed scores, opportunity scores, pipeline status, notes, follow-up dates, and outreach history
- Evidence-backed Facebook, email, text, and follow-up drafting
- Bulk archive, restore, do-not-contact, and permanent deletion for archived leads
- Stripe checkout, upgrades, Customer Portal, signed webhooks, and server-side paid-plan enforcement
- Admin usage reporting for Google Geocoding, Places, PageSpeed, and OpenAI token usage with configurable cost estimates
- Production Terms and Privacy pages with a configurable support email

## 1. Environment

Copy `.env.example` to `.env.local` and add your values.

Generate the security values:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use one generated value for `RATE_LIMIT_SALT` and a different generated value for `CRON_SECRET`.

The same restricted Google key can be used for Places, Geocoding, and PageSpeed. `DEMO_MODE=false` is required for live business results.

Set `NEXT_PUBLIC_SUPPORT_EMAIL` to an inbox you actually monitor before launch.

The admin cost report uses list-price estimates configured in environment variables. Google free tiers, provider credits, model changes, and final invoices can make the real charge different.

## 2. Supabase migrations

### Existing live Webvidence project

Do not rerun `001_initial.sql` because it resets Webvidence public tables.

Run these missing migrations in order, skipping any one you already successfully applied:

1. `supabase/002_launch_security.sql`
2. `supabase/003_secret_key_rpc_fix.sql`
3. `supabase/004_functionality_upgrade.sql`

For the current live project that already received the rate-limit RPC repair, run only:

```text
supabase/004_functionality_upgrade.sql
```

Migration 004 is additive and preserves accounts, subscriptions, searches, leads, audits, messages, and usage.

### Brand-new Supabase project

Run all migrations in order:

1. `001_initial.sql`
2. `002_launch_security.sql`
3. `003_secret_key_rpc_fix.sql`
4. `004_functionality_upgrade.sql`

Configure Supabase Authentication URLs:

- Local Site URL: `http://localhost:3000`
- Local redirect: `http://localhost:3000/**`
- Production Site URL: `https://your-domain.com`
- Production redirect: `https://your-domain.com/**`

## 3. Vercel background recovery

The search route starts audit jobs immediately using Next.js background work. A Vercel Cron route is also included to recover queued or stale jobs:

```text
/api/cron/audits
```

Add `CRON_SECRET` to Vercel. `vercel.json` schedules the recovery route once daily, which is compatible with Vercel Hobby. The dashboard polling endpoint also re-kicks queued jobs while a user is viewing results.

## 4. Start locally

```powershell
npm install --legacy-peer-deps
npm run dev
```

## 5. Launch verification

1. Create a fresh free account and confirm the email.
2. Run five separate searches with up to 10 businesses each.
3. Confirm the sixth search is blocked by the monthly limit, not by campaign or lead storage.
4. Queue analyses from a search and leave the page. Return to Pipeline and confirm results finish.
5. Confirm a no-website business gets a finding without increasing analysis usage.
6. Test a reachable site, an unreachable site, and a site that blocks automated requests.
7. Archive several leads at once, open Archived, restore one, and permanently delete another.
8. Test Forgot password and Resend confirmation.
9. Generate all four outreach types and verify usage and estimated cost logs.
10. Complete a Stripe purchase, upgrade, cancellation, and failed-payment test.

## Verification commands

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

## Search Console and SEO setup

The production canonical domain is `https://www.webvidence.app`.

After deployment:

1. Make `www.webvidence.app` the primary production domain in Vercel.
2. Add `webvidence.app` to Google Search Console as a Domain property and verify it through DNS.
3. Submit `https://www.webvidence.app/sitemap.xml` in Search Console.
4. Inspect and request indexing for `/`, `/pricing`, `/faq`, and `/scores`.
5. Optionally set `GOOGLE_SITE_VERIFICATION` in Vercel if you use Google's HTML-tag verification method instead of DNS.

Public SEO endpoints:

- `/sitemap.xml`
- `/robots.txt`
- `/manifest.webmanifest`
- `/opengraph-image`
- `/twitter-image`

Private account, authentication, dashboard, and API routes are excluded from indexing.
