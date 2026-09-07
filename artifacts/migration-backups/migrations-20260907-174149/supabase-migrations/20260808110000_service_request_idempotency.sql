create table if not exists public.service_request_idempotency (
  account_id uuid not null references basejump.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null,
  fingerprint text not null,
  status text not null default 'pending'
    check (status in ('pending', 'completed')),
  response jsonb,
  locked_until timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, user_id, request_id),
  check (length(request_id) between 1 and 200),
  check (length(fingerprint) = 64)
);

create index if not exists idx_service_request_idempotency_expiry
  on public.service_request_idempotency (expires_at);

drop trigger if exists set_service_request_idempotency_updated_at
  on public.service_request_idempotency;
create trigger set_service_request_idempotency_updated_at
before update on public.service_request_idempotency
for each row execute function public.set_updated_at();

alter table public.service_request_idempotency enable row level security;
revoke all on public.service_request_idempotency from public, anon, authenticated;
grant select, insert, update, delete on public.service_request_idempotency to service_role;

create or replace function public.claim_service_request_idempotency(
  p_account_id uuid,
  p_user_id uuid,
  p_request_id text,
  p_fingerprint text,
  p_ttl_seconds integer default 86400
)
returns table(state text, response jsonb)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.service_request_idempotency%rowtype;
  v_inserted boolean := false;
begin
  if nullif(trim(p_request_id), '') is null or length(trim(p_request_id)) > 200 then
    raise exception 'A valid request id is required.' using errcode = '22023';
  end if;
  if p_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'A valid request fingerprint is required.' using errcode = '22023';
  end if;

  delete from public.service_request_idempotency
  where account_id = p_account_id
    and user_id = p_user_id
    and request_id = trim(p_request_id)
    and expires_at <= now();

  insert into public.service_request_idempotency (
    account_id,
    user_id,
    request_id,
    fingerprint,
    status,
    locked_until,
    expires_at
  ) values (
    p_account_id,
    p_user_id,
    trim(p_request_id),
    p_fingerprint,
    'pending',
    now() + interval '5 minutes',
    now() + make_interval(secs => greatest(60, least(coalesce(p_ttl_seconds, 86400), 604800)))
  )
  on conflict (account_id, user_id, request_id) do nothing
  returning true into v_inserted;

  if coalesce(v_inserted, false) then
    return query select 'claimed'::text, null::jsonb;
    return;
  end if;

  select * into v_row
  from public.service_request_idempotency
  where account_id = p_account_id
    and user_id = p_user_id
    and request_id = trim(p_request_id)
  for update;

  if v_row.fingerprint <> p_fingerprint then
    return query select 'conflict'::text, null::jsonb;
  elsif v_row.status = 'completed' then
    return query select 'completed'::text, v_row.response;
  elsif v_row.locked_until is null or v_row.locked_until <= now() then
    update public.service_request_idempotency
    set locked_until = now() + interval '5 minutes',
        updated_at = now()
    where account_id = p_account_id
      and user_id = p_user_id
      and request_id = trim(p_request_id);
    return query select 'claimed'::text, null::jsonb;
  else
    return query select 'pending'::text, null::jsonb;
  end if;
end;
$$;

create or replace function public.complete_service_request_idempotency(
  p_account_id uuid,
  p_user_id uuid,
  p_request_id text,
  p_fingerprint text,
  p_response jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.service_request_idempotency
  set status = 'completed',
      response = p_response,
      locked_until = null,
      updated_at = now()
  where account_id = p_account_id
    and user_id = p_user_id
    and request_id = trim(p_request_id)
    and fingerprint = p_fingerprint
    and status = 'pending';

  if not found then
    raise exception 'The request idempotency claim is missing or does not match.'
      using errcode = '40001';
  end if;
end;
$$;

create or replace function public.release_service_request_idempotency(
  p_account_id uuid,
  p_user_id uuid,
  p_request_id text,
  p_fingerprint text
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.service_request_idempotency
  where account_id = p_account_id
    and user_id = p_user_id
    and request_id = trim(p_request_id)
    and fingerprint = p_fingerprint
    and status = 'pending';
$$;

revoke all on function public.claim_service_request_idempotency(uuid, uuid, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.complete_service_request_idempotency(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.release_service_request_idempotency(uuid, uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.claim_service_request_idempotency(uuid, uuid, text, text, integer)
  to service_role;
grant execute on function public.complete_service_request_idempotency(uuid, uuid, text, text, jsonb)
  to service_role;
grant execute on function public.release_service_request_idempotency(uuid, uuid, text, text)
  to service_role;
