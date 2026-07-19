# Webvidence lead-flow update validation

Validated from `webvidence-articles-full.zip`, the newest full Webvidence package available for this update.

## Included

- Dashboard **Today's Work** queue and Pipeline due badge
- 3 / 7 / 14-day manual follow-up reminders
- Lead outcomes and outcome filters
- Manual-review handling for blocked or unreachable websites
- Outreach safeguards that do not turn blocked-check messages into claims about a prospect's website
- Larger text in the search form and outreach workspace
- Additive Supabase migration `005_lead_priority_flow.sql`
- Timezone-aware due dates based on the user's browser timezone
- Message-update operation locking and status-preservation guards

## Validation completed

- `npm run typecheck` passed
- `npm run lint` passed
- `npm test` passed: 53 tests
- `npm run build` passed with Next.js 16.2.10 / Turbopack
- `npm audit --omit=dev` reported 0 production vulnerabilities
- ZIP checked to exclude `.next`, `node_modules`, `.git`, `.env`, coverage, and build-cache files

## Required deployment order

1. Back up the live `leads` and `messages` tables.
2. Run `supabase/005_lead_priority_flow.sql` in the live Supabase project after migration 004.
3. Deploy this application version only after migration 005 succeeds.
4. Test one first message, each follow-up step, an outcome, a blocked website, a normal website, Pipeline filters, and the dashboard badge using a non-admin test account.

The local production build was compiled without live Supabase, Stripe, Google, or OpenAI credentials. Live provider calls and the production database migration still require the connected production environment.
