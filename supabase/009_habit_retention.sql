-- WEBVIDENCE 009: HABIT / RETENTION WORKFLOW
-- Safe and additive. Run after 008_website_verification.sql.
-- Adds prospecting routines, prepared sessions, real user review/work tracking,
-- pass reasons, private public-contact discoveries, watched-market refresh state,
-- and reminder deduplication. Existing production rows are preserved.

begin;

alter table public.leads
  add column if not exists last_reviewed_at timestamptz,
  add column if not exists last_worked_at timestamptz,
  add column if not exists passed_at timestamptz,
  add column if not exists pass_reason text;

alter table public.leads
  drop constraint if exists leads_pass_reason_check;

alter table public.leads
  add constraint leads_pass_reason_check
  check (
    pass_reason is null or pass_reason in (
      'strong_existing_site',
      'wrong_business_type',
      'no_contact_path',
      'business_inactive',
      'not_enough_opportunity',
      'other'
    )
  );

create table if not exists public.prospecting_routines (
  user_id uuid primary key references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  days_of_week smallint[] not null default '{1,2,3,4,5}',
  preferred_time time not null default '09:00',
  timezone_offset_minutes integer not null default 0 check (timezone_offset_minutes between -840 and 840),
  session_size smallint not null default 3 check (session_size between 1 and 20),
  reminder_email_enabled boolean not null default false,
  weekly_routine_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(days_of_week) between 1 and 7),
  check (days_of_week <@ array[0,1,2,3,4,5,6]::smallint[])
);

create table if not exists public.prospecting_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active','completed','abandoned')),
  source text not null default 'today' check (source in ('today','search','watched_market','reminder','manual')),
  target_size smallint not null default 3 check (target_size between 1 and 20),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists prospecting_sessions_one_active_workspace_uidx
  on public.prospecting_sessions(user_id, workspace_id)
  where status = 'active';

create table if not exists public.prospecting_session_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.prospecting_sessions(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  position smallint not null check (position between 1 and 20),
  status text not null default 'pending' check (status in ('pending','working','contacted','passed','follow_up_cleared','reply_recorded')),
  started_at timestamptz,
  completed_at timestamptz,
  pass_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id, lead_id),
  unique(session_id, position),
  constraint prospecting_session_items_pass_reason_check check (
    pass_reason is null or pass_reason in (
      'strong_existing_site',
      'wrong_business_type',
      'no_contact_path',
      'business_inactive',
      'not_enough_opportunity',
      'other'
    )
  )
);

create table if not exists public.watched_markets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  status text not null default 'active' check (status in ('active','paused')),
  refresh_interval_hours integer not null default 24 check (refresh_interval_hours between 6 and 168),
  last_refreshed_at timestamptz,
  next_refresh_at timestamptz not null default now(),
  last_new_prospect_count integer not null default 0 check (last_new_prospect_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, campaign_id)
);

create index if not exists watched_markets_due_idx
  on public.watched_markets(status, next_refresh_at)
  where status = 'active';

create table if not exists public.lead_contact_paths (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  kind text not null check (kind in ('email','facebook','instagram','linkedin','tiktok','youtube','form','phone')),
  value text,
  url text,
  source_url text not null,
  verified_public boolean not null default true,
  discovered_at timestamptz not null default now(),
  unique(lead_id, kind, value, url)
);

create index if not exists lead_contact_paths_lead_idx
  on public.lead_contact_paths(workspace_id, lead_id);

create table if not exists public.reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('session_ready','follow_up_due','market_new_prospects','weekly_routine','inactivity_rescue')),
  dedupe_key text not null,
  target_path text not null,
  provider_message_id text,
  sent_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique(user_id, dedupe_key)
);

create index if not exists reminder_deliveries_recent_idx
  on public.reminder_deliveries(user_id, sent_at desc);

-- Backfill genuine first-contact work without treating historical automated audits as reviews.
update public.leads
set last_worked_at = coalesce(last_worked_at, first_contacted_at, last_contacted_at)
where last_worked_at is null
  and (first_contacted_at is not null or last_contacted_at is not null);

alter table public.prospecting_routines enable row level security;
alter table public.prospecting_sessions enable row level security;
alter table public.prospecting_session_items enable row level security;
alter table public.watched_markets enable row level security;
alter table public.lead_contact_paths enable row level security;
alter table public.reminder_deliveries enable row level security;

drop policy if exists prospecting_routines_workspace_select on public.prospecting_routines;
create policy prospecting_routines_workspace_select on public.prospecting_routines
  for select to authenticated
  using ((workspace_id = public.current_workspace_id() and user_id = auth.uid()) or public.is_admin());

drop policy if exists prospecting_sessions_workspace_select on public.prospecting_sessions;
create policy prospecting_sessions_workspace_select on public.prospecting_sessions
  for select to authenticated
  using ((workspace_id = public.current_workspace_id() and user_id = auth.uid()) or public.is_admin());

drop policy if exists prospecting_session_items_workspace_select on public.prospecting_session_items;
create policy prospecting_session_items_workspace_select on public.prospecting_session_items
  for select to authenticated
  using ((workspace_id = public.current_workspace_id() and user_id = auth.uid()) or public.is_admin());

drop policy if exists watched_markets_workspace_select on public.watched_markets;
create policy watched_markets_workspace_select on public.watched_markets
  for select to authenticated
  using ((workspace_id = public.current_workspace_id() and user_id = auth.uid()) or public.is_admin());

-- Contact paths can include discovered public email addresses. Keep them server-only
-- instead of making them queryable from the browser Supabase client.
revoke all on public.lead_contact_paths from anon, authenticated;
revoke all on public.reminder_deliveries from anon, authenticated;

grant select on public.prospecting_routines to authenticated;
grant select on public.prospecting_sessions to authenticated;
grant select on public.prospecting_session_items to authenticated;
grant select on public.watched_markets to authenticated;
grant all privileges on public.prospecting_routines to service_role;
grant all privileges on public.prospecting_sessions to service_role;
grant all privileges on public.prospecting_session_items to service_role;
grant all privileges on public.watched_markets to service_role;
grant all privileges on public.lead_contact_paths to service_role;
grant all privileges on public.reminder_deliveries to service_role;

commit;

-- Rollback notes:
-- The migration is additive. Export routine/session/contact/reminder data before
-- dropping the new tables or the leads review/pass columns after production use.
