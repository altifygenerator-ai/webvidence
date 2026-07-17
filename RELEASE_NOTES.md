## Broader market discovery update

- Added Mixed, Hidden opportunities, Best Google matches, and Closest first search modes.
- Mixed and Hidden searches check several parts of the selected radius instead of relying only on Google’s first ranked batch.
- New searches prefer businesses that are not already saved in the same campaign, then use previous results only when needed to fill the requested count.
- Search coverage is cost-capped by plan: Free 2 requests / 30-candidate pool, Starter 3 / 50, Freelancer 5 / 80, Studio 8 / 120.
- No database migration or Google Cloud setting change is required.

# Webvidence functionality upgrade

## Added

- Five usable free searches with 10 results each, 5 active campaigns, and 50 open saved leads
- Multi-page website sampling up to 6 public pages
- Background audit jobs with retries, stale-job recovery, polling, and a Vercel cron fallback
- Free no-website findings that do not consume analysis credits
- Clear unreachable-site and partial-crawl evidence
- Bulk lead archive, restore, do-not-contact, and archived-only permanent deletion
- Forgot-password, reset-password, and resend-confirmation flows
- Provider usage and estimated-cost reporting for Google and OpenAI
- Production Terms and Privacy pages
- U.S.-restricted geocoding

## Required database change

Existing projects must run `supabase/004_functionality_upgrade.sql`. Projects that never installed the secret-key RPC repair must run `003_secret_key_rpc_fix.sql` first.

## SEO and Search Console release

- Added canonical production domain support for `https://www.webvidence.app`
- Added permanent non-www to www redirect
- Added complete page metadata, Open Graph, Twitter cards, app icons, and manifest
- Added dynamic `sitemap.xml` and `robots.txt`
- Added Organization, WebSite, WebPage, SoftwareApplication, Offer, FAQPage, and BreadcrumbList JSON-LD where appropriate
- Added public FAQ page
- Added public opportunity-score explanation page based on the actual scoring code
- Added public navigation and footer links to FAQ and score documentation
- Added `noindex` metadata to account and recovery pages
- Added private dashboard indexing protection
- Added Google Search Console setup documentation

## Worldwide market search

- Replaced the single U.S.-only location field with compact city/postal code, state/province, and country inputs.
- Added country-aware geocoding and Google Places filtering for worldwide searches.
- Kept the legacy `location` API input so previous clients and saved campaigns remain compatible.
- No database migration is required; existing campaigns and leads are unchanged.

## Public UI refresh + Freelancer trial

- Refreshed the public homepage, header, footer, pricing presentation, and shared public-page styling while leaving the dashboard workflow intact.
- Preserved the worldwide market form, campaign reopening, pipeline analysis, audit polling, and existing saved data behavior.
- Added a card-required 7-day Freelancer trial for eligible Free accounts.
- The trial uses the existing Freelancer Stripe price and converts to $39/month unless canceled before the trial ends.
- Trialing subscriptions receive Freelancer access through the existing signed webhook flow.
- Trial eligibility is enforced server-side and is limited to accounts without a previous Stripe subscription or recorded trial.
- Added trial status and end-date messaging to the billing page, plus matching FAQ and terms language.
