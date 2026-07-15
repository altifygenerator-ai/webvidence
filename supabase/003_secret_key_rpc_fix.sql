-- WEBVIDENCE 003: SUPABASE SECRET-KEY RPC COMPATIBILITY
-- Run once after 002_launch_security.sql.
-- Safe and additive: does not delete users, leads, campaigns, audits, messages,
-- subscriptions, or usage data.

begin;

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
begin
  if p_user_id is null
     or p_metric is null
     or p_period is null
     or p_amount <= 0
     or p_limit < 0 then
    raise exception 'Invalid usage request';
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
  v_now timestamptz := clock_timestamp();
  v_window_start timestamptz;
  v_reset_at timestamptz;
  v_count integer;
begin
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
  v_acquired boolean;
begin
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
  v_deleted integer;
begin
  delete from public.operation_locks
  where lock_key = p_lock_key
    and token = p_token;

  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

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
begin
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
  v_claimed text;
  v_status text;
begin
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

-- Browser roles cannot execute quota, lock, or webhook-control functions.
revoke all on function public.consume_usage(uuid, text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.check_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.acquire_operation_lock(text, uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.release_operation_lock(text, uuid)
  from public, anon, authenticated;
revoke all on function public.refund_usage(uuid, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.claim_webhook_event(text, text)
  from public, anon, authenticated;

grant execute on function public.consume_usage(uuid, text, text, integer, integer)
  to service_role;
grant execute on function public.check_rate_limit(text, text, integer, integer)
  to service_role;
grant execute on function public.acquire_operation_lock(text, uuid, uuid, integer)
  to service_role;
grant execute on function public.release_operation_lock(text, uuid)
  to service_role;
grant execute on function public.refund_usage(uuid, text, text, integer)
  to service_role;
grant execute on function public.claim_webhook_event(text, text)
  to service_role;

commit;
