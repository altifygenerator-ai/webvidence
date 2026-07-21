-- WEBVIDENCE 006: PRODUCT FEEDBACK, OUTCOMES, AND TESTIMONIAL PERMISSION
-- Safe and additive. Run after 005_lead_priority_flow.sql.
-- Stores the original response and the exact public-use permission selected.

begin;

create table if not exists public.feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  name text,
  email text not null,
  business_name text,
  website text,
  usage_frequency text not null check (usage_frequency in ('once', 'few_times', 'weekly', 'several_weekly', 'most_workdays')),
  features_used text[] not null default '{}',
  previous_workflow text,
  ease_impact text not null check (ease_impact in ('a_lot', 'somewhat', 'not_really', 'harder', 'too_early')),
  time_saving_detail text,
  contacted_count text not null check (contacted_count in ('none', 'one_to_five', 'six_to_fifteen', 'sixteen_to_thirty', 'over_thirty')),
  no_contact_reason text,
  replies_count text not null check (replies_count in ('not_applicable', 'none', 'one', 'a_few', 'several', 'not_checked')),
  reply_types text[] not null default '{}',
  outcome text not null check (outcome in ('not_yet', 'promising_conversation', 'call_or_meeting', 'quote_or_proposal', 'paid_project', 'referral', 'prefer_not')),
  project_range text not null check (project_range in ('not_applicable', 'under_250', '250_500', '500_1000', '1000_2500', 'over_2500', 'prefer_not')),
  workflow_most_helpful text,
  rough_or_confusing text,
  would_use_more text,
  usefulness_rating smallint not null check (usefulness_rating between 1 and 10),
  testimonial_text text,
  additional_message text,
  permission_level text not null check (permission_level in ('private', 'anonymous', 'first_name', 'name_business', 'contact_first')),
  allow_written_quote boolean not null default false,
  allow_outcome_details boolean not null default false,
  allow_business_identity boolean not null default false,
  allow_light_editing boolean not null default false,
  allow_anonymous_stats boolean not null default false,
  complimentary_access boolean not null default false,
  email_notification_sent boolean not null default false,
  email_notification_id text,
  email_notification_error text,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists feedback_submissions_submitted_idx
  on public.feedback_submissions(submitted_at desc);

create index if not exists feedback_submissions_user_idx
  on public.feedback_submissions(user_id, submitted_at desc)
  where user_id is not null;

create index if not exists feedback_submissions_permission_idx
  on public.feedback_submissions(permission_level, submitted_at desc)
  where permission_level <> 'private';

alter table public.feedback_submissions enable row level security;

-- Only the server secret/service role writes or reads feedback. Browser users do
-- not receive direct table access, including to their own prior submissions.
revoke all on public.feedback_submissions from anon, authenticated;
grant all privileges on public.feedback_submissions to service_role;

commit;
