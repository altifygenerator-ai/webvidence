-- WEBVIDENCE 004: FREE-PLAN, BACKGROUND AUDIT, AND REPORTING UPGRADE
-- Safe and additive. Run after 003_secret_key_rpc_fix.sql.
-- Does not remove accounts, subscriptions, searches, leads, audits, or messages.

begin;

alter table public.audit_jobs
  add column if not exists available_at timestamptz not null default now(),
  add column if not exists usage_reserved boolean not null default false,
  add column if not exists credit_refunded boolean not null default false,
  add column if not exists result_status text;

alter table public.audit_jobs
  drop constraint if exists audit_jobs_result_status_check;

alter table public.audit_jobs
  add constraint audit_jobs_result_status_check
  check (result_status is null or result_status in ('completed', 'partial', 'failed'));

-- Close duplicate open jobs before adding the protective partial index.
with ranked as (
  select
    id,
    row_number() over (partition by lead_id order by created_at desc, id desc) as row_number
  from public.audit_jobs
  where status in ('queued', 'running')
)
update public.audit_jobs jobs
set
  status = 'cancelled',
  error_message = 'Cancelled while installing the background audit upgrade.',
  completed_at = now(),
  updated_at = now()
from ranked
where jobs.id = ranked.id
  and ranked.row_number > 1;

create unique index if not exists audit_jobs_one_open_per_lead_uidx
  on public.audit_jobs(lead_id)
  where status in ('queued', 'running');

create index if not exists audit_jobs_available_idx
  on public.audit_jobs(status, available_at, created_at);

-- Backfill list-price estimates for historical Google requests shown in the
-- current admin report. Future rows use configurable application rates.
update public.api_usage_log
set estimated_cost = round((coalesce(units, 1)::numeric * 5::numeric / 1000::numeric), 6)
where estimated_cost is null
  and provider = 'google_geocoding';

update public.api_usage_log
set estimated_cost = round((coalesce(units, 1)::numeric * 32::numeric / 1000::numeric), 6)
where estimated_cost is null
  and provider = 'google_places'
  and operation = 'text_search';

update public.api_usage_log
set estimated_cost = 0
where estimated_cost is null
  and provider in ('google_pagespeed', 'local_fallback');

-- Existing completed jobs represent work that already happened. Mark the result
-- status from the matching audit when possible.
update public.audit_jobs jobs
set result_status = audits.status
from public.audits audits
where audits.audit_job_id = jobs.id
  and jobs.result_status is null;

-- The audit worker uses the secret/service role. Browser roles remain read-only.
revoke insert, update, delete on public.audit_jobs from authenticated;
grant select on public.audit_jobs to authenticated;
grant all privileges on public.audit_jobs to service_role;

commit;
