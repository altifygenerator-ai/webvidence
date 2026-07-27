# Website trust fix completion report

## Starting point

Built from the supplied current-live archive: `webvidence-main (4).zip`.

## Changes completed

- Replaced absolute “no website” claims with the accurate state “No website linked on Google.”
- Added a compact lead-file control to add or correct a website address.
- Saving a website immediately starts a fresh analysis and keeps the saved address if the analysis queue cannot start.
- Hid the normal Analyze action when there is no website URL; adding the address is now the clear next step.
- Added website provenance for Google-linked and user-confirmed addresses.
- Preserved user-corrected addresses when the same Google business is found again.
- Treated old audits as stale after a website correction so outdated findings are not used in the UI or outreach.
- Reduced the score and recommendation weight of an unverified missing Google website field.
- Added migration 008 to backfill provenance and correct older `no_site` wording and inflated scores.
- Updated campaign, lead, scoring, FAQ, outreach, and search wording to match the more honest behavior.
- Added workspace-scoped security, URL normalization, DNS/private-network validation, rate limiting, and duplicate-running-audit protection to the website update route.
- Added desktop and mobile styles without redesigning the current lead page.

## Deployment requirement

Run `supabase/008_website_verification.sql` after migration 007 and before deploying this source. The application queries the new fields, so deploying code first would break those queries.

No new environment variables are required.

## Validation completed

- TypeScript/TSX parser check: 122 source files passed.
- Changed-file TypeScript transpile check: 16 changed TS/TSX files passed.
- Runtime smoke checks passed for URL normalization, safe-network validation helpers, honest website status, stale-audit handling, no-link scoring, recommendation weighting, and migration safety.
- Fallback regression execution: 98 tests passed, 0 failed across 12 loaded test files.
- CSS brace checks passed for `app/globals.css` and `app/application.css`.
- Desktop and narrow-screen visual mock review completed for the new website correction states. The controls remain compact and secondary when a website is already linked.

## Validation limitation

The official npm dependency installation could not complete because the session's internal npm registry returned HTTP 503 for `zod-validation-error`. Because dependencies could not be installed, the official `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` commands could not be run in this environment. No claim is made that those four official commands passed.

The fallback regression skipped the feedback and reply-workflow test files because their `zod` dependency was unavailable. Those product areas were not modified by this update.

## Manual production check

1. Back up `leads`, `audits`, `audit_findings`, and `messages`.
2. Run migration 008.
3. Deploy the updated application.
4. Open a lead where Google supplied no website and confirm the normal Analyze button is not shown.
5. Add a real public website and select **Save and analyze**.
6. Confirm the old Google-link-only finding disappears while the new analysis runs.
7. Confirm the corrected address remains after reopening the campaign and after searching the same market again.
