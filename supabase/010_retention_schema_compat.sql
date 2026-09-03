-- WEBVIDENCE 010: RETENTION SCHEMA COMPATIBILITY
-- Bridges the first 009_habit_retention schema to the current retention/session code.
-- Safe for existing production data. Run once after 009_habit_retention.sql.

begin;

-- ---------------------------------------------------------------------------
-- 1) Watched markets moved from a separate watched_markets table onto campaigns.
-- ---------------------------------------------------------------------------
alter table public.campaigns
  add column if not exists watched_at timestamptz,
  add column if not exists watch_frequency_days smallint not null default 7,
  add column if not exists next_refresh_at timestamptz,
  add column if not exists last_refreshed_at timestamptz,
  add column if not exists last_new_prospect_count integer not null default 0;

alter table public.campaigns drop constraint if exists campaigns_watch_frequency_check;
alter table public.campaigns add constraint campaigns_watch_frequency_check
  check (watch_frequency_days between 1 and 30);

-- Preserve watched-market state from the first retention schema when present.
do $$
begin
  if to_regclass('public.watched_markets') is not null then
    execute $migrate$
      update public.campaigns c
      set
        watched_at = case when wm.status = 'active' then coalesce(c.watched_at, wm.created_at, now()) else c.watched_at end,
        watch_frequency_days = greatest(1, least(30, ceil(wm.refresh_interval_hours::numeric / 24.0)::int)),
        next_refresh_at = coalesce(wm.next_refresh_at, c.next_refresh_at),
        last_refreshed_at = coalesce(wm.last_refreshed_at, c.last_refreshed_at),
        last_new_prospect_count = greatest(coalesce(wm.last_new_prospect_count, 0), 0)
      from public.watched_markets wm
      where wm.campaign_id = c.id
    $migrate$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Lead work/review fields and pass-reason vocabulary.
-- ---------------------------------------------------------------------------
alter table public.leads
  add column if not exists first_reviewed_at timestamptz,
  add column if not exists last_worked_at timestamptz,
  add column if not exists passed_at timestamptz,
  add column if not exists pass_reason text;

-- The first 009 used last_reviewed_at. Preserve it as the first real review.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'last_reviewed_at'
  ) then
    execute 'update public.leads set first_reviewed_at = coalesce(first_reviewed_at, last_reviewed_at) where last_reviewed_at is not null';
  end if;
end $$;

alter table public.leads drop constraint if exists leads_pass_reason_check;

update public.leads
set pass_reason = 'inactive_business'
where pass_reason = 'business_inactive';

alter table public.leads add constraint leads_pass_reason_check check (
  pass_reason is null or pass_reason in (
    'strong_existing_site',
    'wrong_business_type',
    'no_contact_path',
    'inactive_business',
    'not_enough_opportunity',
    'other'
  )
);

-- ---------------------------------------------------------------------------
-- 3) Prospecting routines: keep the old columns, add the current API columns,
--    and backfill existing preferences.
-- ---------------------------------------------------------------------------
alter table public.prospecting_routines
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists weekdays smallint[] not null default '{1,3,5}',
  add column if not exists timezone text not null default 'UTC',
  add column if not exists reminder_emails_enabled boolean not null default true,
  add column if not exists weekly_reminder_enabled boolean not null default true,
  add column if not exists follow_up_reminders_enabled boolean not null default true,
  add column if not exists market_reminders_enabled boolean not null default true,
  add column if not exists inactivity_reminders_enabled boolean not null default true,
  add column if not exists unsubscribed_at timestamptz;

update public.prospecting_routines
set id = gen_random_uuid()
where id is null;

alter table public.prospecting_routines alter column id set not null;
create unique index if not exists prospecting_routines_id_uidx
  on public.prospecting_routines(id);

-- Copy the original routine settings into the current column names.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'prospecting_routines' and column_name = 'days_of_week'
  ) then
    execute 'update public.prospecting_routines set weekdays = days_of_week where days_of_week is not null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'prospecting_routines' and column_name = 'reminder_email_enabled'
  ) then
    execute 'update public.prospecting_routines set reminder_emails_enabled = reminder_email_enabled';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'prospecting_routines' and column_name = 'weekly_routine_enabled'
  ) then
    execute 'update public.prospecting_routines set weekly_reminder_enabled = weekly_routine_enabled';
  end if;
end $$;

-- Current sessions are intentionally capped at 10 prospects.
update public.prospecting_routines
set session_size = 10
where session_size > 10;

alter table public.prospecting_routines drop constraint if exists prospecting_routines_session_size_check;
alter table public.prospecting_routines add constraint prospecting_routines_session_size_check
  check (session_size between 1 and 10);

-- ---------------------------------------------------------------------------
-- 4) Prospecting sessions: add campaign ownership and the prepared/ready state.
-- ---------------------------------------------------------------------------
alter table public.prospecting_sessions
  add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;

-- Backfill campaign_id from the first lead in each historical session.
update public.prospecting_sessions s
set campaign_id = x.campaign_id
from (
  select distinct on (psi.session_id)
    psi.session_id,
    l.campaign_id
  from public.prospecting_session_items psi
  join public.leads l on l.id = psi.lead_id
  where l.campaign_id is not null
  order by psi.session_id, psi.position
) x
where s.id = x.session_id
  and s.campaign_id is null;

alter table public.prospecting_sessions drop constraint if exists prospecting_sessions_status_check;
alter table public.prospecting_sessions alter column status set default 'ready';
alter table public.prospecting_sessions add constraint prospecting_sessions_status_check
  check (status in ('ready','active','completed','abandoned'));

-- A prepared session should not look started until the user actually starts it.
alter table public.prospecting_sessions alter column started_at drop not null;
alter table public.prospecting_sessions alter column started_at drop default;

-- Current code allows one open session per user, regardless of workspace.
-- Preserve the newest open session and close any older duplicate before adding the index.
with ranked_open as (
  select id,
         row_number() over (partition by user_id order by created_at desc, id desc) as rn
  from public.prospecting_sessions
  where status in ('ready','active')
)
update public.prospecting_sessions s
set status = 'abandoned', updated_at = now()
from ranked_open r
where s.id = r.id and r.rn > 1;

drop index if exists public.prospecting_sessions_one_active_workspace_uidx;
create unique index if not exists prospecting_sessions_one_open_uidx
  on public.prospecting_sessions(user_id)
  where status in ('ready','active');

-- ---------------------------------------------------------------------------
-- 5) Session items: pending -> ready, add opened_at, align terminal statuses.
-- ---------------------------------------------------------------------------
alter table public.prospecting_session_items
  add column if not exists opened_at timestamptz;

-- Preserve evidence that an older item had already been started.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'prospecting_session_items' and column_name = 'started_at'
  ) then
    execute 'update public.prospecting_session_items set opened_at = coalesce(opened_at, started_at) where started_at is not null';
  end if;
end $$;

alter table public.prospecting_session_items drop constraint if exists prospecting_session_items_status_check;

update public.prospecting_session_items set status = 'ready' where status = 'pending';
update public.prospecting_session_items set status = 'contacted' where status in ('follow_up_cleared','reply_recorded');

alter table public.prospecting_session_items alter column status set default 'ready';
alter table public.prospecting_session_items add constraint prospecting_session_items_status_check
  check (status in ('ready','working','contacted','passed'));

alter table public.prospecting_session_items drop constraint if exists prospecting_session_items_pass_reason_check;
alter table public.prospecting_session_items drop constraint if exists session_items_pass_reason_check;
update public.prospecting_session_items set pass_reason = 'inactive_business' where pass_reason = 'business_inactive';
alter table public.prospecting_session_items add constraint session_items_pass_reason_check check (
  pass_reason is null or pass_reason in (
    'strong_existing_site',
    'wrong_business_type',
    'no_contact_path',
    'inactive_business',
    'not_enough_opportunity',
    'other'
  )
);

-- ---------------------------------------------------------------------------
-- 6) Real work-event tracking used by Today/weekly metrics.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 7) Private public-contact paths: align old form/url fields to current crawler.
-- ---------------------------------------------------------------------------
alter table public.lead_contact_paths
  add column if not exists verified_at timestamptz;

-- Preserve the old discovery timestamp and old url-only rows.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lead_contact_paths' and column_name = 'discovered_at'
  ) then
    execute 'update public.lead_contact_paths set verified_at = coalesce(verified_at, discovered_at, now())';
  else
    execute 'update public.lead_contact_paths set verified_at = coalesce(verified_at, now())';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lead_contact_paths' and column_name = 'url'
  ) then
    execute 'update public.lead_contact_paths set value = coalesce(value, url) where value is null';
  end if;
end $$;

alter table public.lead_contact_paths drop constraint if exists lead_contact_paths_kind_check;
update public.lead_contact_paths set kind = 'contact_form' where kind = 'form';
alter table public.lead_contact_paths add constraint lead_contact_paths_kind_check check (
  kind in ('email','facebook','instagram','linkedin','tiktok','youtube','phone','contact_form','quote_form','booking_form')
);

-- New crawler inserts always provide value and verified_at. If legacy rows are unusable,
-- remove only those empty rows before enforcing the current invariants.
delete from public.lead_contact_paths where value is null;
update public.lead_contact_paths set verified_at = now() where verified_at is null;
alter table public.lead_contact_paths alter column value set not null;
alter table public.lead_contact_paths alter column verified_at set default now();
alter table public.lead_contact_paths alter column verified_at set not null;

-- ---------------------------------------------------------------------------
-- 8) Reminder delivery dedupe: align the first schema with current Resend jobs.
-- ---------------------------------------------------------------------------
alter table public.reminder_deliveries
  add column if not exists reminder_type text,
  add column if not exists destination_path text,
  add column if not exists status text not null default 'claimed',
  add column if not exists error_message text,
  add column if not exists claimed_at timestamptz not null default now();

-- Backfill the renamed columns from the first 009 schema when they exist.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reminder_deliveries' and column_name = 'kind'
  ) then
    execute $q$
      update public.reminder_deliveries
      set reminder_type = coalesce(reminder_type, case kind
        when 'market_new_prospects' then 'market_update'
        when 'weekly_routine' then 'weekly_ready'
        else kind
      end)
    $q$;
    execute 'alter table public.reminder_deliveries alter column kind drop not null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reminder_deliveries' and column_name = 'target_path'
  ) then
    execute 'update public.reminder_deliveries set destination_path = coalesce(destination_path, target_path)';
    execute 'alter table public.reminder_deliveries alter column target_path drop not null';
  end if;
end $$;

-- Historical rows were already delivered in the old design.
update public.reminder_deliveries
set status = 'sent'
where sent_at is not null;

alter table public.reminder_deliveries alter column sent_at drop not null;
alter table public.reminder_deliveries alter column sent_at drop default;

update public.reminder_deliveries
set destination_path = '/dashboard'
where destination_path is null;

alter table public.reminder_deliveries drop constraint if exists reminder_deliveries_reminder_type_check;
alter table public.reminder_deliveries drop constraint if exists reminder_deliveries_status_check;
alter table public.reminder_deliveries add constraint reminder_deliveries_reminder_type_check check (
  reminder_type in ('session_ready','follow_up_due','market_update','weekly_ready','inactivity_rescue')
);
alter table public.reminder_deliveries add constraint reminder_deliveries_status_check check (
  status in ('claimed','sent','failed','skipped')
);

alter table public.reminder_deliveries alter column reminder_type set not null;
alter table public.reminder_deliveries alter column destination_path set not null;

-- ---------------------------------------------------------------------------
-- 9) Security: current retention tables are server-side/service-role data.
-- ---------------------------------------------------------------------------
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

-- Ask PostgREST to refresh its schema cache immediately.
notify pgrst, 'reload schema';
