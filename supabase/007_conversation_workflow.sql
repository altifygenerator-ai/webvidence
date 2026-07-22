-- WEBVIDENCE 007: FOCUSED CONVERSATION WORKFLOW
-- Safe and additive. Run after 006_feedback_submissions.sql.
-- Preserves all existing leads, messages, profiles, follow-ups, outcomes, and billing data.
-- Existing row-level security policies remain in force because this migration only adds columns to protected tables.

begin;

alter table public.leads
  add column if not exists business_observation text;

alter table public.leads
  drop constraint if exists leads_business_observation_length_check;

alter table public.leads
  add constraint leads_business_observation_length_check
  check (business_observation is null or char_length(business_observation) <= 1000);

alter table public.outreach_profiles
  add column if not exists base_location text,
  add column if not exists preferred_channels text;

alter table public.outreach_profiles
  drop constraint if exists outreach_profiles_base_location_length_check;

alter table public.outreach_profiles
  add constraint outreach_profiles_base_location_length_check
  check (base_location is null or char_length(base_location) <= 240);

alter table public.outreach_profiles
  drop constraint if exists outreach_profiles_preferred_channels_length_check;

alter table public.outreach_profiles
  add constraint outreach_profiles_preferred_channels_length_check
  check (preferred_channels is null or char_length(preferred_channels) <= 200);

alter table public.messages
  add column if not exists intent text,
  add column if not exists contact_channel text,
  add column if not exists parent_message_id uuid references public.messages(id) on delete set null,
  add column if not exists reply_summary text,
  add column if not exists recommended_action text,
  add column if not exists analysis_reasoning text,
  add column if not exists copied_at timestamptz;

alter table public.messages
  drop constraint if exists messages_intent_check;

alter table public.messages
  add constraint messages_intent_check
  check (
    intent is null or intent in (
      'conversation',
      'website_finding',
      'follow_up',
      'reply_response',
      'service_intro'
    )
  );

alter table public.messages
  drop constraint if exists messages_contact_channel_check;

alter table public.messages
  add constraint messages_contact_channel_check
  check (
    contact_channel is null or contact_channel in (
      'email', 'facebook', 'linkedin', 'text', 'phone', 'other'
    )
  );

alter table public.messages
  drop constraint if exists messages_recommended_action_check;

alter table public.messages
  add constraint messages_recommended_action_check
  check (
    recommended_action is null or recommended_action in (
      'ask_question',
      'introduce_service',
      'answer_directly',
      'suggest_call',
      'follow_up_later',
      'do_not_pitch',
      'mark_not_fit'
    )
  );

alter table public.messages
  drop constraint if exists messages_reply_summary_length_check;

alter table public.messages
  add constraint messages_reply_summary_length_check
  check (reply_summary is null or char_length(reply_summary) <= 1200);

alter table public.messages
  drop constraint if exists messages_analysis_reasoning_length_check;

alter table public.messages
  add constraint messages_analysis_reasoning_length_check
  check (analysis_reasoning is null or char_length(analysis_reasoning) <= 2000);

update public.messages
set intent = case
  when channel = 'follow_up' then 'follow_up'
  else 'conversation'
end
where intent is null
  and direction in ('draft', 'outbound');

update public.messages
set contact_channel = channel
where contact_channel is null
  and channel in ('email', 'facebook', 'linkedin', 'text', 'phone', 'other');

create index if not exists messages_parent_message_idx
  on public.messages(parent_message_id)
  where parent_message_id is not null;

create index if not exists messages_lead_direction_created_idx
  on public.messages(workspace_id, lead_id, direction, created_at desc);

commit;

-- Rollback notes:
-- The update can be rolled back by dropping the new indexes and the columns added
-- above. Do not roll back after users have stored observations or replies unless
-- that data has first been exported, because dropping the columns removes it.
