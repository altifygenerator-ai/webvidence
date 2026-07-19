-- WEBVIDENCE 005: LEAD PRIORITY, OUTCOMES, AND FOLLOW-UP FLOW
-- Safe and additive. Run after 004_functionality_upgrade.sql.
-- Does not remove or rewrite accounts, campaigns, leads, audits, or messages.

begin;

alter table public.leads
  add column if not exists first_contacted_at timestamptz,
  add column if not exists lead_outcome text,
  add column if not exists lead_outcome_updated_at timestamptz,
  add column if not exists follow_up_step smallint not null default 0,
  add column if not exists follow_up_stopped_at timestamptz,
  add column if not exists manual_review_required boolean not null default false,
  add column if not exists manual_review_reason text;

alter table public.leads
  drop constraint if exists leads_lead_outcome_check;

alter table public.leads
  add constraint leads_lead_outcome_check
  check (
    lead_outcome is null or lead_outcome in (
      'no_response',
      'replied',
      'interested',
      'meeting_booked',
      'proposal_sent',
      'closed_won',
      'closed_lost'
    )
  );

alter table public.leads
  drop constraint if exists leads_follow_up_step_check;

alter table public.leads
  add constraint leads_follow_up_step_check
  check (follow_up_step between 0 and 3);

-- Preserve existing activity while filling only missing contact timestamps.
with sent_activity as (
  select
    lead_id,
    min(coalesce(sent_at, updated_at, created_at)) filter (where status = 'sent') as first_sent_at,
    max(coalesce(sent_at, updated_at, created_at)) filter (where status = 'sent') as last_sent_at,
    least(3, count(*) filter (where status = 'sent' and channel = 'follow_up'))::smallint as sent_follow_ups
  from public.messages
  group by lead_id
)
update public.leads leads
set
  first_contacted_at = coalesce(leads.first_contacted_at, sent_activity.first_sent_at, leads.last_contacted_at),
  last_contacted_at = coalesce(leads.last_contacted_at, sent_activity.last_sent_at),
  follow_up_step = greatest(leads.follow_up_step, sent_activity.sent_follow_ups),
  updated_at = now()
from sent_activity
where leads.id = sent_activity.lead_id
  and (
    leads.first_contacted_at is null
    or leads.last_contacted_at is null
    or leads.follow_up_step < sent_activity.sent_follow_ups
  );

update public.leads
set first_contacted_at = last_contacted_at
where first_contacted_at is null
  and last_contacted_at is not null;

create index if not exists leads_follow_up_due_idx
  on public.leads(workspace_id, next_follow_up_at)
  where next_follow_up_at is not null
    and status not in ('archived', 'do_not_contact', 'not_interested', 'won', 'lost');

create index if not exists leads_outcome_idx
  on public.leads(workspace_id, lead_outcome)
  where lead_outcome is not null;

create index if not exists leads_manual_review_idx
  on public.leads(workspace_id, manual_review_required)
  where manual_review_required = true;

create index if not exists leads_first_contacted_idx
  on public.leads(workspace_id, first_contacted_at)
  where status not in ('archived', 'do_not_contact');

commit;
