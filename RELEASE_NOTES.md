# Webvidence launch security update

## Added

- Monthly local-search allowances: Free 5, Starter 40, Freelancer 150, Studio 500
- Atomic server-side search, analysis, and outreach usage counters
- Failed-operation credit refunds
- Postgres-backed per-user and per-IP rate limits
- One-search-at-a-time and per-lead audit locks
- Same-origin mutation checks
- Search and analysis usage display in the dashboard
- Hardened URL validation, redirect checks, response-size limits, and private-network blocking
- Atomic Stripe webhook claiming and stricter paid-access states
- Security regression tests

## Required database action

Existing Supabase projects must run `supabase/002_launch_security.sql` once before using this build. Fresh projects can run `supabase/001_initial.sql`.
