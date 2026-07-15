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
