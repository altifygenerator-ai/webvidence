-- WEBVIDENCE 009: HABIT, SESSION, WATCHED-MARKET, AND CONTACT-PATH LAYER
-- Safe and additive. Run after 008_website_verification.sql and before deploying
-- application code that uses prospecting sessions or reminders.

begin;

alter table public.campaigns
  add column if not exists watched_at timestamptz,
  add column if not exists watch_frequency_days smallint not null default 7,
  add column if not exists next_refresh_at timestamptz,
  add column if not exists last_refreshed_at timestamptz,
  add column if not exists last_new_prospect_count integer not null default 0;

alter table public.campaigns drop constraint if exists campaigns_watch_frequency_check;
alter table public.campaigns add constraint campaigns_watch_frequency_check
  check (watch_frequency_days between 1 and 30);

alter table public.leads
  add column if not exists first_reviewed_at timestamptz,
  add column if not exists last_worked_at timestamptz,
  add column if not exists pass_reason text,
  add column if not exists passed_at timestamptz;

alter table public.leads drop constraint if exists leads_pass_reason_check;
alter table public.leads add constraint leads_pass_reason_check check (
  pass_reason is null or pass_reason in (
    'strong_existing_site', 'wrong_business_type', 'no_contact_path',
    'inactive_business', 'not_enough_opportunity', 'other'
  )
);

create table if not exists public.prospecting_routines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  weekdays smallint[] not null default '{1,3,5}',
  preferred_time time not null default '09:00',
  timezone text not null default 'UTC',
  session_size smallint not null default 3 check (session_size between 1 and 10),
  reminder_emails_enabled boolean not null default true,
  weekly_reminder_enabled boolean not null default true,
  follow_up_reminders_enabled boolean not null default true,
  market_reminders_enabled boolean not null default true,
  inactivity_reminders_enabled boolean not null default true,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.prospecting_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  status text not null default 'ready' check (status in ('ready','active','completed','abandoned')),
  target_size smallint not null default 3 check (target_size between 1 and 10),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists prospecting_sessions_one_open_uidx
  on public.prospecting_sessions(user_id)
  where status in ('ready','active');

create table if not exists public.prospecting_session_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.prospecting_sessions(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  position smallint not null check (position between 1 and 10),
  status text not null default 'ready' check (status in ('ready','working','contacted','passed')),
  pass_reason text,
  opened_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (session_id, lead_id),
  unique (session_id, position)
);

alter table public.prospecting_session_items drop constraint if exists session_items_pass_reason_check;
alter table public.prospecting_session_items add constraint session_items_pass_reason_check check (
  pass_reason is null or pass_reason in (
    'strong_existing_site', 'wrong_business_type', 'no_contact_path',
    'inactive_business', 'not_enough_opportunity', 'other'
  )
);

create table if not exists public.lead_work_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  session_id uuid references public.prospecting_sessions(id) on delete set null,
  event_type text not null check (event_type in ('reviewed','contacted','passed','follow_up_completed','reply_recorded')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists lead_work_events_week_idx
  on public.lead_work_events(user_id, created_at desc);

create table if not exists public.lead_contact_paths (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  kind text not null check (kind in ('email','facebook','instagram','linkedin','tiktok','youtube','phone','contact_form','quote_form','booking_form')),
  value text not null,
  source_url text not null,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (lead_id, kind, value)
);

create table if not exists public.reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reminder_type text not null check (reminder_type in ('session_ready','follow_up_due','market_update','weekly_ready','inactivity_rescue')),
  dedupe_key text not null,
  destination_path text not null,
  provider_message_id text,
  status text not null default 'claimed' check (status in ('claimed','sent','failed','skipped')),
  error_message text,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create index if not exists watched_markets_due_idx
  on public.campaigns(next_refresh_at)
  where watched_at is not null and status = 'active';
create index if not exists contact_paths_lead_idx on public.lead_contact_paths(lead_id);
create index if not exists session_items_next_idx on public.prospecting_session_items(session_id, position);

alter table public.prospecting_routines enable row level security;
alter table public.prospecting_sessions enable row level security;
alter table public.prospecting_session_items enable row level security;
alter table public.lead_work_events enable row level security;
alter table public.lead_contact_paths enable row level security;
alter table public.reminder_deliveries enable row level security;

revoke all on public.prospecting_routines, public.prospecting_sessions,
  public.prospecting_session_items, public.lead_work_events,
  public.lead_contact_paths, public.reminder_deliveries from anon, authenticated;
grant all privileges on public.prospecting_routines, public.prospecting_sessions,
  public.prospecting_session_items, public.lead_work_events,
  public.lead_contact_paths, public.reminder_deliveries to service_role;

commit;
