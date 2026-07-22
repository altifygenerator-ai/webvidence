# Current Webvidence Product Inventory

This inventory was created from the supplied `webvidence-main (3)(1).zip` before the conversation-workflow update. The ZIP remains the source of truth.

## Existing workflow features preserved

- Recommended prospects are calculated by `lib/leads/recommendation.ts` and shown above the full campaign result list.
- Daily outreach progress is loaded from `/api/outreach-momentum` and appears in campaign results and the lead outreach workspace.
- Drafts are never sent automatically. External app opening and copying are followed by the existing “Did you send it?” confirmation sheet.
- Messages are stored in `public.messages`, displayed in the lead file, and editable before send confirmation.
- Sent messages update first-contact, last-contact, and the existing 3, 7, and 14-day follow-up sequence.
- Pipeline outcomes and quick actions already support replied, interested, not a fit, won, meeting booked, proposal sent, closed won, closed lost, and no response.
- Active campaigns and advanced search options are collapsible.
- The public conversation-first landing page, feedback form, testimonial permission settings, and marketing permission controls are present.
- Outreach profiles store the user’s service, best-fit customer, approximate pricing, and preferred writing style.
- Manual-review handling prevents blocked or unreachable automated checks from being presented as verified outreach claims.
- Mobile outreach controls, send confirmation, safe-area spacing, and the prior mobile result-number fix are present.
- Private lead notes are stored on the lead and are not public.
- Provider usage and estimated cost analytics are stored in `api_usage_log`; Vercel Analytics and Speed Insights are also enabled.
- Server-side authentication, workspace ownership checks, same-origin mutation checks, rate limiting, operation locks, paid-plan usage enforcement, and SSRF protections are present.
- Existing migrations `001` through `006` and the existing Vitest test suite are preserved without modification.

## Existing implementation reused by this update

- `messages.direction` already distinguishes inbound, outbound, and draft records.
- Existing lead status, outcome, follow-up, and message tables remain the workflow source of truth.
- Existing Supabase service-role write patterns and row-level security remain in place.
- Existing campaign, audit, billing, authentication, feedback, and search provider behavior remain unchanged except for focused search-input validation and wording.

## Focused gaps addressed

- A completed outreach profile could previously change first-message strategy instead of only personalizing it.
- The lead page displayed draft generation, delivery, quick outcomes, tracking, and notes as parallel actions rather than prioritizing one current next step.
- Conversation-first, website-finding, and follow-up intent were not explicit user choices.
- User-entered business observations had no dedicated private field.
- Prospect replies could be marked in the pipeline but could not be stored and analyzed in a focused reply workflow.
- Campaign recommendation wording implied more certainty than the evidence supports.
- Pipeline rows exposed more controls and details than needed for deciding what requires attention.
