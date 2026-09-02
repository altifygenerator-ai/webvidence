Webvidence Vercel retention type-fix
Based on deployed commit bb7af5f7b24efca7a5a5020b5689ccc1cbc13df9.

Replace these three files in the repo:
- lib/jobs/retention.ts
- lib/retention/reminders.ts
- lib/retention/markets.ts

Why:
The repo contained two retention implementations. lib/retention/reminders.ts and
lib/retention/markets.ts were stale pre-consolidation modules using an older DB schema.
The active cron already uses lib/jobs/retention.ts. This patch exposes the active jobs
and turns the old files into compatibility wrappers, removing the missing
startProspectingSession import and the stale schema code.
