# Website trust update

This update addresses cases where Google Places does not return a website even though the business has one elsewhere.

## What changed

- “No website” claims are now written as “No website linked on Google.”
- A missing Google website field now produces a moderate evidence score instead of automatically becoming a top opportunity.
- Users can add or correct a website from the lead file and immediately start a fresh analysis.
- User-confirmed website addresses are preserved when the same Google business is found again.
- Old audit findings are treated as stale after a website correction until a fresh analysis completes.
- Website provenance is shown as Google-linked or user-confirmed.
- Existing `no_site` findings and inflated scores are corrected by migration 008 so old results do not keep the previous claim.

## Required migration

Run `supabase/008_website_verification.sql` after migration 007 and before deploying this code.

## Environment variables

No new environment variables are required.

## Manual verification

1. Open a lead where Google did not return a website.
2. Confirm the UI says Google did not link a website rather than claiming none exists.
3. Choose **Add website**, enter a public domain, and select **Save and analyze**.
4. Confirm the site is saved, the old no-site evidence disappears, and a fresh audit starts.
5. Reopen the campaign and confirm the corrected website remains attached.
6. Search the same market again and confirm the user-corrected website is not overwritten by Google data.
