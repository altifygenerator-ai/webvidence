# Webvidence smart recommendation update validation

## Included

- Top-three contact recommendations calculated from existing audit, activity, contactability, review, and status data
- Plain-language recommendation reasons
- Session-only 5-contact momentum batches with optional 3-contact extensions
- Email, text, and copy handoff confirmation before a message is recorded as sent
- Automatic use of the existing message-sent contact and follow-up logic
- Chained next-lead handoff across recommended search results
- Collapsed advanced search settings, audit details, and manual lead tracking
- One-tap lead outcomes
- Mobile sticky primary outreach action and bottom-sheet confirmation
- New read-only `/api/outreach-momentum` endpoint using existing `messages.sent_at`
- No database migration or Supabase schema change

## Validation completed

- `npm run typecheck` passed
- `npm run lint` passed
- `npm test` passed: 74 tests
- `npm run build` passed with Next.js 16.2.10 / Turbopack
- Full and patch ZIPs exclude `.next`, `node_modules`, `.git`, `.env`, coverage, and cache files

## Suggested live checks

1. Run a search with three analyses and confirm the recommendation block waits for completed evidence.
2. Confirm contacted and manual-review leads do not appear in the top three.
3. Open the first recommendation, generate an email or text, return to Webvidence, and use **Yes, mark sent**.
4. Confirm the contact date, next follow-up, daily count, and next recommended lead update together.
5. Test Copy message for Facebook outreach and dismiss **Not yet** to confirm it does not keep reopening.
6. Check the compact result cards, search options, mobile action dock, bottom sheet, and safe-area spacing on iPhone and Android.
7. Confirm the detailed lead tracking section still saves status, outcome, date, and notes normally.

---

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
