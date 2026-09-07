-- Remove Basejump personal accounts. EnLearn only supports ERP business account sets.

drop trigger if exists on_auth_user_created_basejump_account on auth.users;
drop function if exists basejump.run_new_user_setup();
drop function if exists public.get_personal_account();

update basejump.config
set enable_personal_account_billing = false
where singleton;

create or replace function basejump.normalize_account_set_fields()
returns trigger
language plpgsql
as $$
begin
  if new.personal_account then
    raise exception 'Personal accounts are not supported';
  end if;

  new.code := upper(coalesce(
    nullif(btrim(new.code), ''),
    'A' || substr(replace(new.id::text, '-', ''), 1, 11)
  ));
  new.base_currency := upper(coalesce(nullif(btrim(new.base_currency), ''), 'CNY'));
  new.timezone := coalesce(nullif(btrim(new.timezone), ''), 'Asia/Shanghai');
  return new;
end;
$$;

create or replace function public.get_accounts()
returns json
language sql
stable
as $$
  select coalesce(
    json_agg(
      json_build_object(
        'account_id', memberships.account_id,
        'account_role', memberships.account_role,
        'is_primary_owner', accounts.primary_owner_user_id = auth.uid(),
        'name', accounts.name,
        'slug', accounts.slug,
        'code', accounts.code,
        'status', accounts.status,
        'base_currency', accounts.base_currency,
        'timezone', accounts.timezone,
        'fiscal_year_start_month', accounts.fiscal_year_start_month,
        'is_default', preferences.default_account_id = accounts.id,
        'is_last_used', preferences.last_account_id = accounts.id,
        'last_login_at', preferences.last_login_at,
        'metadata', accounts.public_metadata,
        'created_at', accounts.created_at,
        'updated_at', accounts.updated_at
      )
      order by
        (preferences.last_account_id = accounts.id) desc nulls last,
        accounts.code asc
    ),
    '[]'::json
  )
  from basejump.account_user memberships
  join basejump.accounts accounts on accounts.id = memberships.account_id
  left join public.account_user_preferences preferences on preferences.user_id = auth.uid()
  where memberships.user_id = auth.uid()
    and accounts.personal_account = false;
$$;

grant execute on function public.get_accounts() to authenticated;

create or replace function public.get_login_account_options(login_user_id uuid)
returns json
language sql
security definer
stable
set search_path = public, basejump
as $$
  select coalesce(
    json_agg(
      json_build_object(
        'account_id', accounts.id,
        'code', accounts.code,
        'name', accounts.name,
        'base_currency', accounts.base_currency
      )
      order by accounts.code asc, accounts.name asc
    ),
    '[]'::json
  )
  from basejump.account_user memberships
  join basejump.accounts accounts on accounts.id = memberships.account_id
  where memberships.user_id = get_login_account_options.login_user_id
    and accounts.personal_account = false
    and accounts.status = 'active';
$$;

revoke all on function public.get_login_account_options(uuid) from public, anon, authenticated;
grant execute on function public.get_login_account_options(uuid) to service_role;

create or replace function public.is_active_account_member(account_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, basejump
as $$
  select coalesce(exists (
    select 1
    from basejump.account_user memberships
    join basejump.accounts accounts on accounts.id = memberships.account_id
    where memberships.user_id = auth.uid()
      and memberships.account_id = is_active_account_member.account_id
      and accounts.personal_account = false
      and accounts.status = 'active'
  ), false);
$$;

grant execute on function public.is_active_account_member(uuid) to authenticated, service_role;

create or replace function public.account_user_ids(account_id uuid)
returns table (user_id uuid)
language sql
security definer
stable
set search_path = public, basejump
as $$
  select memberships.user_id
  from basejump.account_user memberships
  join basejump.accounts accounts on accounts.id = memberships.account_id
  where memberships.account_id = account_user_ids.account_id
    and accounts.personal_account = false
    and accounts.status = 'active'
    and (
      current_user in ('postgres', 'service_role', 'supabase_admin')
      or current_setting('request.jwt.claim.role', true) = 'service_role'
      or coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'role' = 'service_role'
      or exists (
        select 1
        from basejump.account_user caller_membership
        where caller_membership.account_id = account_user_ids.account_id
          and caller_membership.user_id = auth.uid()
      )
    )
  order by memberships.created_at, memberships.user_id;
$$;

grant execute on function public.account_user_ids(uuid) to authenticated, service_role;

create or replace function public.get_account_members(
  account_id uuid,
  results_limit integer default 50,
  results_offset integer default 0
)
returns json
language plpgsql
security definer
set search_path = public, basejump
as $$
begin
  if public.current_user_account_role(get_account_members.account_id) ->> 'account_role' <> 'owner' then
    raise exception 'Only account owners can access this function';
  end if;

  return coalesce(
    (
      select json_agg(
        json_build_object(
          'user_id', memberships.user_id,
          'account_role', memberships.account_role,
          'name', profiles.full_name,
          'email', auth_users.email,
          'is_primary_owner', accounts.primary_owner_user_id = memberships.user_id
        )
        order by accounts.primary_owner_user_id = memberships.user_id desc, auth_users.email asc
      )
      from basejump.account_user memberships
      join basejump.accounts accounts on accounts.id = memberships.account_id
      left join public.users profiles on profiles.id = memberships.user_id
      left join auth.users auth_users on auth_users.id = memberships.user_id
      where memberships.account_id = get_account_members.account_id
        and accounts.personal_account = false
      limit coalesce(get_account_members.results_limit, 50)
      offset coalesce(get_account_members.results_offset, 0)
    ),
    '[]'::json
  );
end;
$$;

grant execute on function public.get_account_members(uuid, integer, integer) to authenticated;

drop function if exists public.get_admin_user_permission_rows();

create or replace function public.get_admin_user_permission_rows()
returns table (
  id uuid,
  user_id uuid,
  email text,
  full_name text,
  avatar_url text,
  phone text,
  nickname text,
  legacy_profile_role text,
  updated_at timestamp with time zone,
  app_role_codes text[],
  app_role_names text,
  role_codes text[],
  role_names text,
  permission_codes text[],
  permission_names text,
  permission_count integer,
  account_ids uuid[],
  account_names text,
  account_roles text[],
  account_count integer,
  is_primary_account_owner boolean
)
language plpgsql
security definer
stable
set search_path = public, basejump
as $$
begin
  if not public.has_app_permission('admin.users.manage') then
    raise exception 'Admin users permission required';
  end if;

  return query
  with role_summary as (
    select
      user_roles.user_id,
      array_agg(distinct roles.code order by roles.code) as role_codes,
      string_agg(distinct roles.name, ', ' order by roles.name) as role_names
    from public.admin_user_roles user_roles
    join public.admin_roles roles on roles.id = user_roles.role_id
    where roles.status = 'active'
    group by user_roles.user_id
  ),
  permission_summary as (
    select
      user_roles.user_id,
      array_agg(distinct permissions.code order by permissions.code) as permission_codes,
      string_agg(distinct permissions.name, ', ' order by permissions.name) as permission_names,
      count(distinct permissions.id)::integer as permission_count
    from public.admin_user_roles user_roles
    join public.admin_roles roles on roles.id = user_roles.role_id
    join public.admin_role_permissions role_permissions on role_permissions.role_id = roles.id
    join public.admin_permissions permissions on permissions.id = role_permissions.permission_id
    where roles.status = 'active'
      and permissions.status = 'active'
    group by user_roles.user_id
  ),
  account_summary as (
    select
      memberships.user_id,
      array_agg(accounts.id order by accounts.created_at asc) as account_ids,
      string_agg(
        coalesce(accounts.name, accounts.slug, accounts.id::text),
        ', '
        order by accounts.created_at asc
      ) as account_names,
      array_agg(distinct memberships.account_role::text order by memberships.account_role::text) as account_roles,
      count(*)::integer as account_count,
      bool_or(accounts.primary_owner_user_id = memberships.user_id) as is_primary_account_owner
    from basejump.account_user memberships
    join basejump.accounts accounts on accounts.id = memberships.account_id
    where accounts.personal_account = false
    group by memberships.user_id
  )
  select
    users.id,
    users.id as user_id,
    auth_users.email::text,
    users.full_name,
    users.avatar_url,
    users.phone,
    users.nickname,
    users.role as legacy_profile_role,
    users.updated_at,
    coalesce(role_summary.role_codes, '{}'::text[]) as app_role_codes,
    coalesce(role_summary.role_names, '') as app_role_names,
    coalesce(role_summary.role_codes, '{}'::text[]) as role_codes,
    coalesce(role_summary.role_names, '') as role_names,
    coalesce(permission_summary.permission_codes, '{}'::text[]) as permission_codes,
    coalesce(permission_summary.permission_names, '') as permission_names,
    coalesce(permission_summary.permission_count, 0) as permission_count,
    coalesce(account_summary.account_ids, '{}'::uuid[]) as account_ids,
    coalesce(account_summary.account_names, '') as account_names,
    coalesce(account_summary.account_roles, '{}'::text[]) as account_roles,
    coalesce(account_summary.account_count, 0) as account_count,
    coalesce(account_summary.is_primary_account_owner, false) as is_primary_account_owner
  from public.users users
  left join auth.users auth_users on auth_users.id = users.id
  left join role_summary on role_summary.user_id = users.id
  left join permission_summary on permission_summary.user_id = users.id
  left join account_summary on account_summary.user_id = users.id
  order by users.updated_at desc nulls last, auth_users.created_at desc;
end;
$$;

grant execute on function public.get_admin_user_permission_rows() to authenticated;

do $$
declare
  personal_account_ids uuid[];
  personal_tenant_ids text[];
  tenant_table record;
  tenant_reference_count bigint;
begin
  select coalesce(array_agg(id), '{}'::uuid[])
  into personal_account_ids
  from basejump.accounts
  where personal_account = true;

  select coalesce(array_agg(account_id::text), '{}'::text[])
  into personal_tenant_ids
  from unnest(personal_account_ids) account_id;

  for tenant_table in
    select table_schema, table_name
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'tenant_id'
  loop
    execute format(
      'select count(*) from %I.%I where tenant_id = any($1::text[])',
      tenant_table.table_schema,
      tenant_table.table_name
    )
    into tenant_reference_count
    using personal_tenant_ids;

    if tenant_reference_count > 0 then
      raise exception 'Cannot remove personal accounts: %.% contains % tenant-scoped rows',
        tenant_table.table_schema,
        tenant_table.table_name,
        tenant_reference_count;
    end if;
  end loop;

  if exists (
    select 1
    from public.sales_orders
    where account_id = any(personal_account_ids)
  ) or exists (
    select 1
    from public.sales_order_lines
    where account_id = any(personal_account_ids)
  ) then
    raise exception 'Cannot remove personal accounts while sales data still references them';
  end if;

  delete from basejump.accounts
  where id = any(personal_account_ids);
end;
$$;

alter table basejump.accounts
  drop constraint if exists basejump_accounts_slug_required_for_team;

alter table basejump.accounts
  drop constraint if exists basejump_accounts_business_only;

alter table basejump.accounts
  add constraint basejump_accounts_business_only
  check (personal_account = false and slug is not null);

alter table basejump.accounts
  alter column personal_account set default false;
