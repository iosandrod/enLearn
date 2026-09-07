-- Service-role-only helpers used by API/RPC smoke tests. Keeping setup here
-- prevents test scripts from importing a PostgreSQL client from api/src.

create or replace function public.prepare_api_smoke_test_access(
  p_user_id uuid,
  p_permission_code text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  v_account_id uuid;
  v_role_id uuid;
begin
  if session_user not in ('service_role', 'postgres', 'authenticator')
     and coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '') <> 'service_role'
     and coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'role' <> 'service_role' then
    raise exception 'Only service_role may prepare smoke-test access.' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'p_user_id is required.' using errcode = '22023';
  end if;

  select accounts.id
    into v_account_id
    from basejump.accounts accounts
   where accounts.personal_account = false
     and accounts.status = 'active'
   order by accounts.created_at
   limit 1;
  if v_account_id is null then
    raise exception 'An active business account set is required.' using errcode = 'P0002';
  end if;

  select roles.id
    into v_role_id
    from public.admin_roles roles
   where roles.code = 'system_admin'
     and roles.status = 'active'
   order by roles.created_at nulls last, roles.id
   limit 1;
  if v_role_id is null then
    raise exception 'The active system_admin role is required.' using errcode = 'P0002';
  end if;

  insert into basejump.account_user (account_id, user_id, account_role)
  values (v_account_id, p_user_id, 'member'::basejump.account_role)
  on conflict (user_id, account_id) do nothing;

  insert into public.admin_user_roles (user_id, role_id, account_id)
  values (p_user_id, v_role_id, v_account_id), (p_user_id, v_role_id, null)
  on conflict do nothing;

  if nullif(p_permission_code, '') is not null and not exists (
    select 1
      from public.admin_role_permissions role_permissions
      join public.admin_permissions permissions
        on permissions.id = role_permissions.permission_id
     where role_permissions.role_id = v_role_id
       and permissions.code = p_permission_code
       and permissions.status = 'active'
  ) then
    raise exception 'system_admin is missing required permission: %.', p_permission_code
      using errcode = '42501';
  end if;

  return pg_catalog.jsonb_build_object(
    'account_id', v_account_id,
    'role_id', v_role_id
  );
end;
$function$;

revoke all on function public.prepare_api_smoke_test_access(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.prepare_api_smoke_test_access(uuid, text)
  to service_role;

notify pgrst, 'reload schema';
