# Webvidence launch checklist

## Database

- [ ] Existing live project ran `003_secret_key_rpc_fix.sql` if not already applied
- [ ] Existing live project ran `004_functionality_upgrade.sql`
- [ ] `audit_jobs` shows `available_at`, `usage_reserved`, `credit_refunded`, and `result_status`
- [ ] Existing users, subscriptions, leads, and messages are still present

## Environment

- [ ] `NEXT_PUBLIC_APP_URL` uses the production domain
- [ ] `NEXT_PUBLIC_SUPPORT_EMAIL` points to a monitored inbox
- [ ] Supabase URL, publishable key, and secret key are configured
- [ ] Google Places, Geocoding, and PageSpeed keys are configured and restricted
- [ ] OpenAI key and model are configured
- [ ] Stripe live key, webhook secret, and live Price IDs are configured
- [ ] `DEMO_MODE=false`
- [ ] `BILLING_ENABLED=true`
- [ ] Strong unique `RATE_LIMIT_SALT` is configured
- [ ] Strong unique `CRON_SECRET` is configured
- [ ] API cost-rate environment values reflect the current provider pricing you want reported

## Authentication

- [ ] Signup confirmation reaches the inbox
- [ ] Resend confirmation works
- [ ] Forgot password sends a reset link
- [ ] Reset link opens `/reset-password`
- [ ] New password works and old password no longer works
- [ ] Login, logout, and selected-plan return paths work

## Free plan

- [ ] Fresh free user can run 5 searches
- [ ] Each free search returns no more than 10 businesses
- [ ] User can create up to 5 active campaigns
- [ ] User can keep up to 50 non-archived leads
- [ ] Sixth monthly search is blocked server-side
- [ ] User gets 10 charged website analyses
- [ ] No-website findings do not consume an analysis credit
- [ ] Free user cannot export CSV or access paid limits

## Website analysis

- [ ] Homepage and up to 5 important internal pages are sampled
- [ ] `pages_crawled` is accurate in Supabase and lead files
- [ ] PageSpeed runs once per website audit
- [ ] Unreachable websites save a clear failed audit finding
- [ ] Partial crawls identify failed internal pages without discarding the successful findings
- [ ] Internal/private URLs, unsafe ports, redirects, and oversized responses remain blocked

## Background jobs

- [ ] Search returns before the entire audit batch finishes
- [ ] Queued/running state is visible in the search results
- [ ] Leaving and returning does not lose queued work
- [ ] Dashboard polling picks up completed audits
- [ ] `/api/cron/audits` returns 401 without the correct secret
- [ ] Vercel Cron appears in the project dashboard after deployment
- [ ] A deliberately failed worker retries and refunds the audit credit after the final internal failure

## Leads and outreach

- [ ] Bulk archive works
- [ ] Archived view works
- [ ] Bulk restore works
- [ ] Only archived leads can be permanently deleted
- [ ] Do-not-contact blocks outreach generation
- [ ] Facebook, email, text, and follow-up drafts save correctly
- [ ] Sent status updates the lead and message history

## Billing

- [ ] Signed-out pricing selection goes through signup/login
- [ ] Signed-in free account opens Checkout
- [ ] Existing paid user upgrades without a duplicate subscription
- [ ] Studio displays maximum-plan state
- [ ] Customer Portal works
- [ ] Webhook updates profile and subscription tables
- [ ] Canceled, unpaid, and incomplete subscriptions fall back to Free
- [ ] Freelancer checkout collects a card, starts a 7-day trial, and grants `trialing` access
- [ ] Cancel the trial in the Customer Portal and confirm no first charge is made
- [ ] Advance a Stripe test clock past day 7 and confirm the $39 Freelancer invoice is attempted
- [ ] A previously trialed or subscribed account cannot start another Freelancer trial

## Reporting and legal

- [ ] Google Geocoding and Places usage logs include estimated costs
- [ ] PageSpeed usage is logged
- [ ] OpenAI logs include token counts and configured estimated costs
- [ ] Admin provider breakdown displays expected totals
- [ ] Terms and Privacy links are accessible
- [ ] Support email is correct
- [ ] Terms and Privacy have been reviewed for the operator's business and jurisdiction

## Build

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm audit --omit=dev`

## Broader market discovery check

- Run one Mixed search and confirm the completion notice reports more than one market area.
- Run the same campaign again and confirm new businesses are preferred while earlier prospects remain available through Open results.
- Try Hidden opportunities and confirm smaller listings or businesses without websites appear more often.
- Confirm Google Places usage increases by no more than the plan request budget: Free 2, Starter 3, Freelancer 5, Studio 8 per search, plus one geocoding request.
