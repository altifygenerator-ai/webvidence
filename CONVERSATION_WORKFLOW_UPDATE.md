# Webvidence Conversation Workflow Update

## Deployment summary

This update strengthens the existing conversation-first workflow without changing authentication, billing, plan limits, Google search providers, website auditing, existing follow-up rules, or the current pricing model.

### Required database migration

Run `supabase/007_conversation_workflow.sql` after migration `006_feedback_submissions.sql` and before deploying the updated application.

The migration is additive. It does not edit or rerun migrations `001` through `006` and does not replace existing tables.

It adds:

- `leads.business_observation`
- `outreach_profiles.base_location`
- `outreach_profiles.preferred_channels`
- `messages.intent`
- `messages.contact_channel`
- `messages.parent_message_id`
- `messages.reply_summary`
- `messages.recommended_action`
- `messages.analysis_reasoning`
- `messages.copied_at`

Existing row-level security policies continue to protect these records because the fields are added to the existing protected `leads`, `messages`, and `outreach_profiles` tables.

Rollback notes are included at the bottom of the migration. Export any stored observations or reply data before dropping the new columns.

### Environment variables

No new environment variables are required. The update continues using the existing Supabase and OpenAI configuration. `.env.example` is unchanged.

## New routes

- `POST /api/outreach-profile` saves the lightweight first-draft setup.
- `POST /api/replies` stores an inbound reply and prepares a validated response plan.
- `POST /api/product-events` records product events without storing private reply text.

Existing routes updated:

- `POST /api/generate` now requires an explicit outreach intent and can store an optional business observation.
- `PATCH /api/messages/[id]` records copied state and continues to handle send confirmation and follow-up scheduling.
- `PATCH /api/leads/[id]` can store the private business observation.
- `POST /api/search` validates local business categories and rejects country-only markets.

## How reply data is stored

Inbound prospect replies reuse the existing `messages` table with `direction = 'inbound'` and `status = 'received'`.

The analysis summary, recommended action, and collapsed reasoning are stored on that inbound message. The editable suggested response is a normal draft message linked through `parent_message_id`. When marked sent, it uses the existing sent-message and lead-activity workflow.

No prospect reply text is written to `api_usage_log`. Product analytics contain only event names, lead IDs, intent/channel labels, outcome labels, and token totals where applicable.

## What is sent to OpenAI

For outreach generation, Webvidence may send:

- Business name, category, and location
- The selected intent and contact channel
- One verified website finding when website-finding mode is selected
- The user-entered business observation when supplied
- Outreach-profile context such as service, best-fit customer, location, project range, and writing style
- The previous sent message for follow-up mode
- The latest recorded prospect reply for service-introduction mode

For reply planning, Webvidence may send:

- The prospect reply or user summary
- Recent message history
- Business/category/location context
- The private observation and notes when relevant
- Outreach-profile context

The model is instructed not to invent facts, needs, owner names, locations, website problems, demand, or business outcomes. Structured reply output is validated server-side. Local safe fallbacks are used when AI output is unavailable or invalid.

## Manual test checklist

1. Search one valid category in a city or postal code.
2. Confirm comma-separated categories, vague “businesses,” persona searches, and country-only locations are rejected.
3. Open a recommended business and confirm the product shows one clear Next step.
4. Prepare conversation-first outreach with no completed profile and confirm it remains the default.
5. Complete the lightweight profile and confirm conversation-first remains selected.
6. Generate website-finding outreach and confirm only one verified plain-language finding is used.
7. Add and edit an optional business observation.
8. Copy a message, open the selected contact app, return, and confirm the send prompt appears once.
9. Mark a message sent and confirm contact history and the follow-up due date update.
10. Record a prospect reply and confirm it is preserved if response generation fails.
11. Confirm the reply planner shows a short interpretation, one recommendation, an editable response, and collapsed reasoning.
12. Mark a not-a-fit reply and confirm another pitch is not recommended.
13. Mark a clear need and confirm service introduction can be recommended.
14. Review the pipeline on desktop and mobile; confirm it shows business, status, last contact, next action, due date, and Open.
15. Review widths near 320, 375, 390, 430, tablet, and desktop. Confirm no horizontal overflow, covered content, duplicated sticky actions, or input zoom.
16. Confirm the existing feedback form, billing enforcement, recommendation logic, campaign reopening, outcome controls, and mobile result numbering still work.

## Validation commands

Use the scripts that exist in `package.json`:

```powershell
npm ci --legacy-peer-deps
npm run typecheck
npm run lint
npm test
npm run build
```

Do not deploy until migration `007` is applied and all checks pass in an environment that can reach the package registry and has the required live credentials.

## Output safety enforcement

Generated outreach is checked again after model output. If conversation-first output mentions a website, SEO, an audit, a redesign, or a service pitch, Webvidence discards it and uses the safe local fallback. Website-finding output is also rejected when it contains raw performance jargon or unsupported impact claims.

Reply analysis receives a second semantic safety pass after structured validation. A rejection always becomes a not-a-fit result, and an `introduce_service` recommendation is downgraded unless the analysis identifies a clear need. The service-introduction generation route also requires either a saved `introduce_service` recommendation or an explicitly interested lead status.
