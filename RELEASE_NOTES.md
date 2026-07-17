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
