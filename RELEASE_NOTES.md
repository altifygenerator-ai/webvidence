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
