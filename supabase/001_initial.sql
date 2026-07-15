-- WEBVIDENCE: RESET OLD TEST SCHEMA + INSTALL FULL SUPABASE SCHEMA
-- WARNING: This removes any existing Webvidence test data in the public tables below.
-- It DOES NOT delete users from Supabase Authentication.
-- Existing auth users are automatically rebuilt into profiles/workspaces at the end.

begin;

drop trigger if exists on_auth_user_created on auth.users;

drop table if exists public.admin_audit_log cascade;
drop table if exists public.webhook_events cascade;
drop table if exists public.api_usage_log cascade;
drop table if exists public.usage_counters cascade;
drop table if exists public.subscriptions cascade;
drop table if exists public.suppression_list cascade;
drop table if exists public.messages cascade;
drop table if exists public.audit_findings cascade;
drop table if exists public.audits cascade;
drop table if exists public.audit_jobs cascade;
drop table if exists public.leads cascade;
drop table if exists public.search_runs cascade;
drop table if exists public.campaigns cascade;
drop table if exists public.outreach_profiles cascade;
drop table if exists public.workspace_members cascade;
drop table if exists public.profiles cascade;
drop table if exists public.workspaces cascade;
drop table if exists public.app_admins cascade;

drop function if exists public.update_my_workspace_name(text) cascade;
drop function if exists public.update_my_profile(text) cascade;
drop function if exists public.consume_usage(uuid, text, text, integer, integer) cascade;
drop function if exists public.ensure_current_user_profile() cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.bootstrap_auth_user(uuid, text, jsonb) cascade;
drop function if exists public.current_workspace_id() cascade;
drop function if exists public.is_admin() cascade;
drop function if exists public.set_updated_at() cascade;

drop type if exists public.plan_id cascade;

commit;
-- WEBVIDENCE: FULL SUPABASE DATABASE SETUP
-- Run this once in Supabase -> SQL Editor -> New query.
-- Admin account configured below: jlccustoms@gmail.com
-- Change that one email before running if you will sign in with a different address.

begin;

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- TYPES
-- -----------------------------------------------------------------------------

do $$
begin
  create type public.plan_id as enum (
    'free',
    'starter',
    'freelancer',
    'studio',
    'admin'
  );
exception
  when duplicate_object then null;
end
$$;

-- -----------------------------------------------------------------------------
-- CORE ACCOUNT / ADMIN TABLES
-- -----------------------------------------------------------------------------

create table if not exists public.app_admins (
  email text primary key,
  created_at timestamptz not null default now()
);

insert into public.app_admins (email)
values ('jlccustoms@gmail.com')
on conflict (email) do nothing;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  workspace_id uuid references public.workspaces(id) on delete set null,
  plan public.plan_id not null default 'free',
  is_admin boolean not null default false,
  suspended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.outreach_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Default offer',
  service_description text,
  typical_project_range text,
  target_customer text,
  outreach_style text,
  is_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- SEARCH, LEADS, AUDITS, AND OUTREACH
-- -----------------------------------------------------------------------------

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null,
  location text not null,
  radius_miles integer not null default 50 check (radius_miles between 1 and 150),
  center_lat double precision,
  center_lng double precision,
  status text not null default 'active' check (status in ('draft', 'active', 'paused', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.search_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'google_places',
  category text not null,
  location text not null,
  radius_miles integer not null default 50,
  center_lat double precision,
  center_lng double precision,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  result_count integer not null default 0,
  billable_requests integer not null default 0,
  error_message text,
  raw jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  search_run_id uuid references public.search_runs(id) on delete set null,
  source text not null default 'google_places',
  google_place_id text,
  name text not null,
  category text,
  address text,
  city text,
  state text,
  postal_code text,
  latitude double precision,
  longitude double precision,
  website text,
  phone text,
  google_maps_url text,
  reviews integer,
  rating numeric(3,2),
  business_status text,
  status text not null default 'new' check (
    status in (
      'new',
      'reviewing',
      'ready_to_contact',
      'contacted',
      'replied',
      'interested',
      'follow_up',
      'quote_sent',
      'won',
      'lost',
      'not_interested',
      'do_not_contact',
      'archived'
    )
  ),
  opportunity_score integer check (opportunity_score between 0 and 100),
  last_audited_at timestamptz,
  last_contacted_at timestamptz,
  next_follow_up_at timestamptz,
  notes text,
  raw_provider_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  attempts integer not null default 0,
  error_message text,
  locked_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  audit_job_id uuid references public.audit_jobs(id) on delete set null,
  status text not null default 'completed' check (status in ('queued', 'running', 'completed', 'partial', 'failed')),
  score integer not null check (score between 0 and 100),
  website_url text,
  final_url text,
  http_status integer,
  page_title text,
  meta_description text,
  pages_crawled integer not null default 0,
  performance_score integer check (performance_score between 0 and 100),
  accessibility_score integer check (accessibility_score between 0 and 100),
  seo_score integer check (seo_score between 0 and 100),
  best_practices_score integer check (best_practices_score between 0 and 100),
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_findings (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  code text not null,
  label text not null,
  severity text not null check (severity in ('high', 'medium', 'low', 'positive')),
  evidence text not null,
  source_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  channel text not null check (channel in ('email', 'facebook', 'linkedin', 'text', 'phone', 'follow_up', 'other')),
  direction text not null default 'outbound' check (direction in ('outbound', 'inbound', 'draft')),
  subject text,
  body text not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'sent', 'received', 'failed')),
  approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.suppression_list (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text,
  phone text,
  domain text,
  reason text not null default 'do_not_contact',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (email is not null or phone is not null or domain is not null)
);

-- -----------------------------------------------------------------------------
-- BILLING, USAGE, AND OPERATIONS
-- -----------------------------------------------------------------------------

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'inactive',
  plan public.plan_id not null default 'free',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  trial_end timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.usage_counters (
  user_id uuid not null references auth.users(id) on delete cascade,
  metric text not null,
  period text not null,
  used integer not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, metric, period)
);

create table if not exists public.api_usage_log (
  id bigint generated always as identity primary key,
  workspace_id uuid references public.workspaces(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  provider text not null,
  operation text not null,
  units integer not null default 1,
  estimated_cost numeric(12,6),
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.webhook_events (
  id text primary key,
  type text not null,
  processed_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- INDEXES
-- -----------------------------------------------------------------------------

create index if not exists profiles_workspace_id_idx on public.profiles(workspace_id);
create index if not exists workspace_members_user_id_idx on public.workspace_members(user_id);
create index if not exists outreach_profiles_workspace_id_idx on public.outreach_profiles(workspace_id);
create index if not exists campaigns_workspace_id_idx on public.campaigns(workspace_id);
create index if not exists campaigns_user_id_idx on public.campaigns(user_id);
create index if not exists search_runs_workspace_id_idx on public.search_runs(workspace_id);
create index if not exists search_runs_campaign_id_idx on public.search_runs(campaign_id);
create index if not exists leads_workspace_id_idx on public.leads(workspace_id);
create index if not exists leads_campaign_id_idx on public.leads(campaign_id);
create index if not exists leads_search_run_id_idx on public.leads(search_run_id);
create index if not exists leads_status_idx on public.leads(workspace_id, status);
create index if not exists leads_score_idx on public.leads(workspace_id, opportunity_score desc nulls last);
create unique index if not exists leads_workspace_google_place_uidx
  on public.leads(workspace_id, google_place_id)
  where google_place_id is not null;
create unique index if not exists leads_workspace_name_city_uidx
  on public.leads(workspace_id, lower(name), lower(coalesce(city, '')))
  where google_place_id is null;
create index if not exists audit_jobs_workspace_id_idx on public.audit_jobs(workspace_id);
create index if not exists audit_jobs_status_idx on public.audit_jobs(status, created_at);
create index if not exists audits_workspace_id_idx on public.audits(workspace_id);
create index if not exists audits_lead_id_idx on public.audits(lead_id, created_at desc);
create index if not exists audit_findings_audit_id_idx on public.audit_findings(audit_id);
create index if not exists messages_workspace_id_idx on public.messages(workspace_id);
create index if not exists messages_lead_id_idx on public.messages(lead_id, created_at desc);
create index if not exists suppression_workspace_id_idx on public.suppression_list(workspace_id);
create index if not exists api_usage_user_id_idx on public.api_usage_log(user_id, created_at desc);
create index if not exists api_usage_workspace_id_idx on public.api_usage_log(workspace_id, created_at desc);
create index if not exists admin_audit_created_at_idx on public.admin_audit_log(created_at desc);

-- -----------------------------------------------------------------------------
-- HELPER FUNCTIONS
-- SECURITY DEFINER functions use an empty search_path and fully qualified names.
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_admin = true
        and p.suspended_at is null
    ),
    false
  );
$$;

create or replace function public.current_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.workspace_id
  from public.profiles p
  where p.id = auth.uid()
    and p.suspended_at is null
  limit 1;
$$;

create or replace function public.bootstrap_auth_user(
  p_user_id uuid,
  p_email text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_is_admin boolean;
  v_name text;
begin
  if p_user_id is null then
    raise exception 'Missing user id';
  end if;

  select exists (
    select 1
    from public.app_admins a
    where lower(a.email) = lower(coalesce(p_email, ''))
  ) into v_is_admin;

  select p.workspace_id
  into v_workspace_id
  from public.profiles p
  where p.id = p_user_id;

  if v_workspace_id is null then
    v_name := coalesce(
      nullif(trim(p_metadata ->> 'full_name'), ''),
      nullif(split_part(coalesce(p_email, ''), '@', 1), ''),
      'My workspace'
    );

    insert into public.workspaces (name, owner_id)
    values (v_name, p_user_id)
    returning id into v_workspace_id;
  end if;

  insert into public.profiles (
    id,
    email,
    full_name,
    workspace_id,
    plan,
    is_admin
  )
  values (
    p_user_id,
    p_email,
    nullif(trim(p_metadata ->> 'full_name'), ''),
    v_workspace_id,
    case when v_is_admin then 'admin'::public.plan_id else 'free'::public.plan_id end,
    v_is_admin
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    workspace_id = coalesce(public.profiles.workspace_id, excluded.workspace_id),
    is_admin = excluded.is_admin,
    plan = case
      when excluded.is_admin then 'admin'::public.plan_id
      when public.profiles.plan = 'admin'::public.plan_id then 'free'::public.plan_id
      else public.profiles.plan
    end,
    updated_at = now();

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, p_user_id, 'owner')
  on conflict (workspace_id, user_id) do update
  set role = 'owner';

  insert into public.subscriptions (user_id, status, plan)
  values (p_user_id, 'inactive', 'free')
  on conflict (user_id) do nothing;

  if not exists (
    select 1
    from public.outreach_profiles op
    where op.user_id = p_user_id
      and op.workspace_id = v_workspace_id
  ) then
    insert into public.outreach_profiles (
      workspace_id,
      user_id,
      name,
      is_default
    )
    values (
      v_workspace_id,
      p_user_id,
      'Default offer',
      true
    );
  end if;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.bootstrap_auth_user(
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data, '{}'::jsonb)
  );
  return new;
end;
$$;

create or replace function public.ensure_current_user_profile()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user auth.users%rowtype;
begin
  select *
  into v_user
  from auth.users
  where id = auth.uid();

  if v_user.id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.bootstrap_auth_user(
    v_user.id,
    v_user.email,
    coalesce(v_user.raw_user_meta_data, '{}'::jsonb)
  );
end;
$$;

create or replace function public.consume_usage(
  p_user_id uuid,
  p_metric text,
  p_period text,
  p_amount integer,
  p_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_used integer;
  v_role text;
begin
  if p_user_id is null
     or p_metric is null
     or p_period is null
     or p_amount <= 0
     or p_limit < 0 then
    raise exception 'Invalid usage request';
  end if;

  v_role := coalesce(current_setting('request.jwt.claim.role', true), '');

  if v_role <> 'service_role'
     and auth.uid() is distinct from p_user_id
     and not public.is_admin() then
    raise exception 'Forbidden';
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and (p.is_admin = true or p.plan = 'admin'::public.plan_id)
      and p.suspended_at is null
  ) then
    return true;
  end if;

  insert into public.usage_counters (user_id, metric, period, used)
  values (p_user_id, p_metric, p_period, 0)
  on conflict (user_id, metric, period) do nothing;

  select uc.used
  into v_used
  from public.usage_counters uc
  where uc.user_id = p_user_id
    and uc.metric = p_metric
    and uc.period = p_period
  for update;

  if v_used + p_amount > p_limit then
    return false;
  end if;

  update public.usage_counters
  set
    used = used + p_amount,
    updated_at = now()
  where user_id = p_user_id
    and metric = p_metric
    and period = p_period;

  return true;
end;
$$;

create or replace function public.update_my_profile(
  p_full_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.profiles
  set
    full_name = nullif(trim(p_full_name), ''),
    updated_at = now()
  where id = auth.uid();
end;
$$;

create or replace function public.update_my_workspace_name(
  p_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'Workspace name is required';
  end if;

  v_workspace_id := public.current_workspace_id();

  update public.workspaces
  set
    name = trim(p_name),
    updated_at = now()
  where id = v_workspace_id
    and owner_id = auth.uid();
end;
$$;

-- -----------------------------------------------------------------------------
-- TRIGGERS
-- -----------------------------------------------------------------------------

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

drop trigger if exists workspaces_set_updated_at on public.workspaces;
create trigger workspaces_set_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists outreach_profiles_set_updated_at on public.outreach_profiles;
create trigger outreach_profiles_set_updated_at
before update on public.outreach_profiles
for each row execute function public.set_updated_at();

drop trigger if exists campaigns_set_updated_at on public.campaigns;
create trigger campaigns_set_updated_at
before update on public.campaigns
for each row execute function public.set_updated_at();

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
before update on public.leads
for each row execute function public.set_updated_at();

drop trigger if exists audit_jobs_set_updated_at on public.audit_jobs;
create trigger audit_jobs_set_updated_at
before update on public.audit_jobs
for each row execute function public.set_updated_at();

drop trigger if exists messages_set_updated_at on public.messages;
create trigger messages_set_updated_at
before update on public.messages
for each row execute function public.set_updated_at();

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

drop trigger if exists usage_counters_set_updated_at on public.usage_counters;
create trigger usage_counters_set_updated_at
before update on public.usage_counters
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------

alter table public.app_admins enable row level security;
alter table public.workspaces enable row level security;
alter table public.profiles enable row level security;
alter table public.workspace_members enable row level security;
alter table public.outreach_profiles enable row level security;
alter table public.campaigns enable row level security;
alter table public.search_runs enable row level security;
alter table public.leads enable row level security;
alter table public.audit_jobs enable row level security;
alter table public.audits enable row level security;
alter table public.audit_findings enable row level security;
alter table public.messages enable row level security;
alter table public.suppression_list enable row level security;
alter table public.subscriptions enable row level security;
alter table public.usage_counters enable row level security;
alter table public.api_usage_log enable row level security;
alter table public.webhook_events enable row level security;
alter table public.admin_audit_log enable row level security;

-- Remove old policies so this script can safely replace an earlier setup.
drop policy if exists app_admins_admin_select on public.app_admins;
drop policy if exists workspaces_member_select on public.workspaces;
drop policy if exists profiles_self_or_admin_select on public.profiles;
drop policy if exists workspace_members_member_select on public.workspace_members;
drop policy if exists outreach_profiles_workspace_all on public.outreach_profiles;
drop policy if exists campaigns_workspace_all on public.campaigns;
drop policy if exists search_runs_workspace_select on public.search_runs;
drop policy if exists leads_workspace_all on public.leads;
drop policy if exists audit_jobs_workspace_select on public.audit_jobs;
drop policy if exists audits_workspace_select on public.audits;
drop policy if exists audit_findings_workspace_select on public.audit_findings;
drop policy if exists messages_workspace_all on public.messages;
drop policy if exists suppression_workspace_all on public.suppression_list;
drop policy if exists subscriptions_self_or_admin_select on public.subscriptions;
drop policy if exists usage_self_or_admin_select on public.usage_counters;
drop policy if exists api_usage_admin_select on public.api_usage_log;
drop policy if exists webhook_admin_select on public.webhook_events;
drop policy if exists admin_log_admin_select on public.admin_audit_log;

-- Drop names used by the earlier Webvidence SQL, if present.
drop policy if exists profile_self on public.profiles;
drop policy if exists workspace_member on public.workspaces;
drop policy if exists campaigns_member on public.campaigns;
drop policy if exists leads_member on public.leads;
drop policy if exists audits_member on public.audits;
drop policy if exists findings_member on public.audit_findings;
drop policy if exists messages_member on public.messages;
drop policy if exists subscription_self on public.subscriptions;
drop policy if exists usage_self on public.usage_counters;

create policy app_admins_admin_select
on public.app_admins
for select
to authenticated
using (public.is_admin());

create policy workspaces_member_select
on public.workspaces
for select
to authenticated
using (
  id = public.current_workspace_id()
  or public.is_admin()
);

create policy profiles_self_or_admin_select
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.is_admin()
);

create policy workspace_members_member_select
on public.workspace_members
for select
to authenticated
using (
  workspace_id = public.current_workspace_id()
  or public.is_admin()
);

create policy outreach_profiles_workspace_all
on public.outreach_profiles
for all
to authenticated
using (
  workspace_id = public.current_workspace_id()
  or public.is_admin()
)
with check (
  workspace_id = public.current_workspace_id()
  or public.is_admin()
);

create policy campaigns_workspace_all
on public.campaigns
for all
to authenticated
using (
  workspace_id = public.current_workspace_id()
  or public.is_admin()
)
with check (
  workspace_id = public.current_workspace_id()
  or public.is_admin()
);

create policy search_runs_workspace_select
on public.search_runs
for select
to authenticated
using (
  workspace_id = public.current_workspace_id()
  or public.is_admin()
);

create policy leads_workspace_all
on public.leads
for all
to authenticated
using (
  workspace_id = public.current_workspace_id()
  or public.is_admin()
)
with check (
  workspace_id = public.current_workspace_id()
  or public.is_admin()
);

create policy audit_jobs_workspace_select
on public.audit_jobs
for select
to authenticated
using (
  workspace_id = public.current_workspace_id()
  or public.is_admin()
);

create policy audits_workspace_select
on public.audits
for select
to authenticated
using (
  workspace_id = public.current_workspace_id()
  or public.is_admin()
);

create policy audit_findings_workspace_select
on public.audit_findings
for select
to authenticated
using (
  exists (
    select 1
    from public.audits a
    where a.id = audit_id
      and (
        a.workspace_id = public.current_workspace_id()
        or public.is_admin()
      )
  )
);

create policy messages_workspace_all
on public.messages
for all
to authenticated
using (
  workspace_id = public.current_workspace_id()
  or public.is_admin()
)
with check (
  workspace_id = public.current_workspace_id()
  or public.is_admin()
);

create policy suppression_workspace_all
on public.suppression_list
for all
to authenticated
using (
  workspace_id = public.current_workspace_id()
  or public.is_admin()
)
with check (
  workspace_id = public.current_workspace_id()
  or public.is_admin()
);

create policy subscriptions_self_or_admin_select
on public.subscriptions
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin()
);

create policy usage_self_or_admin_select
on public.usage_counters
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin()
);

create policy api_usage_admin_select
on public.api_usage_log
for select
to authenticated
using (public.is_admin());

create policy webhook_admin_select
on public.webhook_events
for select
to authenticated
using (public.is_admin());

create policy admin_log_admin_select
on public.admin_audit_log
for select
to authenticated
using (public.is_admin());

-- -----------------------------------------------------------------------------
-- GRANTS
-- RLS controls rows; grants control which operations can reach each object.
-- -----------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

revoke all on all tables in schema public from authenticated;
revoke all on all sequences in schema public from authenticated;
revoke all on all functions in schema public from authenticated;

grant select on public.app_admins to authenticated;
grant select on public.workspaces to authenticated;
grant select on public.profiles to authenticated;
grant select on public.workspace_members to authenticated;

grant select, insert, update, delete on public.outreach_profiles to authenticated;
grant select, insert, update, delete on public.campaigns to authenticated;
grant select on public.search_runs to authenticated;
grant select, insert, update, delete on public.leads to authenticated;
grant select on public.audit_jobs to authenticated;
grant select on public.audits to authenticated;
grant select on public.audit_findings to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, update, delete on public.suppression_list to authenticated;
grant select on public.subscriptions to authenticated;
grant select on public.usage_counters to authenticated;
grant select on public.api_usage_log to authenticated;
grant select on public.webhook_events to authenticated;
grant select on public.admin_audit_log to authenticated;

grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.current_workspace_id() to authenticated, service_role;
grant execute on function public.ensure_current_user_profile() to authenticated;
grant execute on function public.consume_usage(uuid, text, text, integer, integer) to authenticated, service_role;
grant execute on function public.update_my_profile(text) to authenticated;
grant execute on function public.update_my_workspace_name(text) to authenticated;

revoke all on function public.bootstrap_auth_user(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;

-- The server secret/service role needs full database access.
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

-- -----------------------------------------------------------------------------
-- BACKFILL / REPAIR EXISTING AUTH USERS
-- This also grants admin status if your account already existed before this SQL.
-- -----------------------------------------------------------------------------

do $$
declare
  u record;
begin
  for u in
    select id, email, raw_user_meta_data
    from auth.users
  loop
    perform public.bootstrap_auth_user(
      u.id,
      u.email,
      coalesce(u.raw_user_meta_data, '{}'::jsonb)
    );
  end loop;
end
$$;

-- Re-apply owner admin status and admin plan after any earlier setup.
update public.profiles p
set
  is_admin = true,
  plan = 'admin'::public.plan_id,
  updated_at = now()
where exists (
  select 1
  from public.app_admins a
  where lower(a.email) = lower(coalesce(p.email, ''))
);

commit;


-- Included for fresh installs: launch security migration follows.
-- WEBVIDENCE 002: LAUNCH SECURITY HARDENING
-- Safe additive migration for an existing Webvidence Supabase project.
-- Run this once after 001_initial.sql. It does not delete users, leads, campaigns,
-- audits, messages, subscriptions, or existing usage.

begin;

-- -----------------------------------------------------------------------------
-- DURABLE RATE LIMITS AND OPERATION LOCKS
-- These live in Postgres so they work across multiple Vercel/server instances.
-- -----------------------------------------------------------------------------

create table if not exists public.rate_limit_buckets (
  key_hash text not null,
  route text not null,
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  reset_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (key_hash, route, window_start)
);

create index if not exists rate_limit_reset_idx
  on public.rate_limit_buckets(reset_at);

create table if not exists public.operation_locks (
  lock_key text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  token uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists operation_locks_expiry_idx
  on public.operation_locks(expires_at);

alter table public.rate_limit_buckets enable row level security;
alter table public.operation_locks enable row level security;

revoke all on public.rate_limit_buckets from anon, authenticated;
revoke all on public.operation_locks from anon, authenticated;
grant all privileges on public.rate_limit_buckets to service_role;
grant all privileges on public.operation_locks to service_role;

create or replace function public.check_rate_limit(
  p_key_hash text,
  p_route text,
  p_window_seconds integer,
  p_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_now timestamptz := clock_timestamp();
  v_window_start timestamptz;
  v_reset_at timestamptz;
  v_count integer;
begin
  v_role := coalesce(current_setting('request.jwt.claim.role', true), '');
  if v_role <> 'service_role' then
    raise exception 'Forbidden';
  end if;

  if nullif(trim(p_key_hash), '') is null
     or nullif(trim(p_route), '') is null
     or p_window_seconds < 1
     or p_window_seconds > 86400
     or p_limit < 1
     or p_limit > 100000 then
    raise exception 'Invalid rate limit request';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );
  v_reset_at := v_window_start + make_interval(secs => p_window_seconds);

  delete from public.rate_limit_buckets
  where key_hash = p_key_hash
    and route = p_route
    and reset_at < v_now - interval '1 minute';

  insert into public.rate_limit_buckets (
    key_hash,
    route,
    window_start,
    request_count,
    reset_at,
    updated_at
  )
  values (
    p_key_hash,
    p_route,
    v_window_start,
    1,
    v_reset_at,
    v_now
  )
  on conflict (key_hash, route, window_start)
  do update set
    request_count = public.rate_limit_buckets.request_count + 1,
    reset_at = excluded.reset_at,
    updated_at = excluded.updated_at
  returning request_count into v_count;

  return jsonb_build_object(
    'allowed', v_count <= p_limit,
    'remaining', greatest(0, p_limit - v_count),
    'reset_at', v_reset_at
  );
end;
$$;

create or replace function public.acquire_operation_lock(
  p_lock_key text,
  p_user_id uuid,
  p_token uuid,
  p_ttl_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_acquired boolean;
begin
  v_role := coalesce(current_setting('request.jwt.claim.role', true), '');
  if v_role <> 'service_role' then
    raise exception 'Forbidden';
  end if;

  if nullif(trim(p_lock_key), '') is null
     or p_user_id is null
     or p_token is null
     or p_ttl_seconds < 10
     or p_ttl_seconds > 1800 then
    raise exception 'Invalid operation lock request';
  end if;

  insert into public.operation_locks (
    lock_key,
    user_id,
    token,
    expires_at,
    updated_at
  )
  values (
    p_lock_key,
    p_user_id,
    p_token,
    clock_timestamp() + make_interval(secs => p_ttl_seconds),
    clock_timestamp()
  )
  on conflict (lock_key)
  do update set
    user_id = excluded.user_id,
    token = excluded.token,
    expires_at = excluded.expires_at,
    updated_at = excluded.updated_at
  where public.operation_locks.expires_at <= clock_timestamp()
  returning true into v_acquired;

  return coalesce(v_acquired, false);
end;
$$;

create or replace function public.release_operation_lock(
  p_lock_key text,
  p_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_deleted integer;
begin
  v_role := coalesce(current_setting('request.jwt.claim.role', true), '');
  if v_role <> 'service_role' then
    raise exception 'Forbidden';
  end if;

  delete from public.operation_locks
  where lock_key = p_lock_key
    and token = p_token;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

-- -----------------------------------------------------------------------------
-- USAGE REFUNDS
-- Search credits are reserved before billable provider calls and refunded when
-- the request fails before returning a usable result.
-- -----------------------------------------------------------------------------

create or replace function public.refund_usage(
  p_user_id uuid,
  p_metric text,
  p_period text,
  p_amount integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  v_role := coalesce(current_setting('request.jwt.claim.role', true), '');
  if v_role <> 'service_role' then
    raise exception 'Forbidden';
  end if;

  if p_user_id is null
     or nullif(trim(p_metric), '') is null
     or nullif(trim(p_period), '') is null
     or p_amount <= 0 then
    raise exception 'Invalid usage refund';
  end if;

  update public.usage_counters
  set
    used = greatest(0, used - p_amount),
    updated_at = now()
  where user_id = p_user_id
    and metric = p_metric
    and period = p_period;

  return true;
end;
$$;

-- The browser must never be able to call quota-changing functions directly.
revoke all on function public.consume_usage(uuid, text, text, integer, integer) from anon, authenticated;
revoke all on function public.refund_usage(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.check_rate_limit(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.acquire_operation_lock(text, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.release_operation_lock(text, uuid) from public, anon, authenticated;

grant execute on function public.consume_usage(uuid, text, text, integer, integer) to service_role;
grant execute on function public.refund_usage(uuid, text, text, integer) to service_role;
grant execute on function public.check_rate_limit(text, text, integer, integer) to service_role;
grant execute on function public.acquire_operation_lock(text, uuid, uuid, integer) to service_role;
grant execute on function public.release_operation_lock(text, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- STRIPE WEBHOOK CLAIMING
-- Prevent two simultaneous deliveries from processing the same event twice.
-- Failed claims can be retried; processed claims remain permanently idempotent.
-- -----------------------------------------------------------------------------

alter table public.webhook_events
  add column if not exists status text not null default 'processed',
  add column if not exists attempts integer not null default 1,
  add column if not exists error_message text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.webhook_events
  drop constraint if exists webhook_events_status_check;

alter table public.webhook_events
  add constraint webhook_events_status_check
  check (status in ('processing', 'processed', 'failed'));

update public.webhook_events
set status = 'processed'
where status is null;

create or replace function public.claim_webhook_event(
  p_event_id text,
  p_event_type text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_claimed text;
  v_status text;
begin
  v_role := coalesce(current_setting('request.jwt.claim.role', true), '');
  if v_role <> 'service_role' then
    raise exception 'Forbidden';
  end if;

  if nullif(trim(p_event_id), '') is null
     or nullif(trim(p_event_type), '') is null then
    raise exception 'Invalid webhook claim';
  end if;

  insert into public.webhook_events (
    id,
    type,
    status,
    attempts,
    processed_at,
    updated_at,
    payload
  )
  values (
    p_event_id,
    p_event_type,
    'processing',
    1,
    now(),
    now(),
    '{}'::jsonb
  )
  on conflict (id)
  do update set
    type = excluded.type,
    status = 'processing',
    attempts = public.webhook_events.attempts + 1,
    error_message = null,
    updated_at = now()
  where public.webhook_events.status = 'failed'
     or (
       public.webhook_events.status = 'processing'
       and public.webhook_events.updated_at < now() - interval '5 minutes'
     )
  returning 'claimed' into v_claimed;

  if v_claimed = 'claimed' then
    return 'claimed';
  end if;

  select status
  into v_status
  from public.webhook_events
  where id = p_event_id;

  return coalesce(v_status, 'processing');
end;
$$;

revoke all on function public.claim_webhook_event(text, text) from public, anon, authenticated;
grant execute on function public.claim_webhook_event(text, text) to service_role;

-- -----------------------------------------------------------------------------
-- CLOSE DIRECT DATABASE WRITE BYPASSES
-- All product writes now pass through authenticated server routes/actions where
-- plan limits, workspace ownership, rate limits, and audit logging are checked.
-- -----------------------------------------------------------------------------

revoke insert, update, delete on public.outreach_profiles from authenticated;
revoke insert, update, delete on public.campaigns from authenticated;
revoke insert, update, delete on public.leads from authenticated;
revoke insert, update, delete on public.messages from authenticated;
revoke insert, update, delete on public.suppression_list from authenticated;

-- Existing read permissions remain available through RLS.
grant select on public.outreach_profiles to authenticated;
grant select on public.campaigns to authenticated;
grant select on public.leads to authenticated;
grant select on public.messages to authenticated;
grant select on public.suppression_list to authenticated;

commit;
