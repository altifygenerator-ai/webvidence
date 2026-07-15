# Webvidence launch checklist

## Accounts and security
- [ ] Verify signup, confirmation email, login, homepage signed-in state, and logout
- [ ] Verify RLS with two unrelated test accounts
- [ ] Confirm the configured owner is the only admin
- [ ] Confirm one account cannot fetch or edit another account's lead or message IDs
- [ ] Run `supabase/002_launch_security.sql` on the existing production Supabase project
- [ ] Test free-plan search exhaustion and verify a failed search refunds its credit
- [ ] Test free-plan analysis exhaustion
- [ ] Test free-plan outreach-generation exhaustion
- [ ] Confirm server secret keys never appear in browser requests or Git history
- [ ] Confirm authenticated clients cannot directly insert/update campaigns, leads, messages, or usage counters through Supabase REST
- [ ] Confirm a second simultaneous search returns 409 and does not consume another Google request
- [ ] Confirm cross-site mutation requests return 403 and burst requests return 429

## Search and audits
- [ ] Test at least five trades in five different states
- [ ] Verify 25, 50, 75, and 100-mile results
- [ ] Review duplicate, closed, service-area, no-website, and unreachable-site cases
- [ ] Compare at least 50 evidence scores against a human review
- [ ] Confirm search errors and long searches show useful status messages
- [ ] Set Google Cloud quotas, billing alerts, and API restrictions
- [ ] Review Google Maps Platform storage and display requirements before public launch

## Outreach
- [ ] Configure a real outreach profile in Settings
- [ ] Test Facebook, email, text, and follow-up drafts
- [ ] Confirm drafts only use saved audit findings
- [ ] Confirm editing, copy, mark-sent, notes, status, and follow-up dates persist
- [ ] Confirm no outreach is automatically sent
- [ ] Add reviewed acceptable-use language and do-not-contact procedures

## Stripe
- [ ] Test Starter, Freelancer, and Studio checkout
- [ ] Test Starter to Freelancer and Freelancer to Studio upgrades
- [ ] Verify Studio shows maximum-plan state
- [ ] Verify Customer Portal, cancellation, payment-method updates, and invoices
- [ ] Replay duplicate webhooks and verify only one request processes while concurrent duplicates retry
- [ ] Test active and trialing grant paid access; canceled, past-due, unpaid, incomplete, and failed-payment states fall back to Free
- [ ] Verify live webhook endpoint after deployment

## Production operations
- [ ] Configure production SMTP and auth redirect URLs
- [ ] Confirm Postgres-backed user/IP rate limiting is active in production
- [ ] Add error monitoring and alerting
- [ ] Add a background job queue before large public audit batches
- [ ] Configure Supabase backups and recovery checks
- [ ] Replace starter Privacy and Terms pages with reviewed documents
- [ ] Verify analytics and conversion events
- [ ] Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm audit --omit=dev`
- [ ] Keep `DEMO_MODE=false` and confirm LIVE DATA before launch
- [ ] Keep `BILLING_ENABLED=true` only after production Stripe verification
